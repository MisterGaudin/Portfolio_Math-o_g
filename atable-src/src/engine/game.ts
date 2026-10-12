// Règles d'« À TABLE ! » : mise en place, dénonciation, échange simultané,
// annonces, départage et victoire. Toutes les fonctions modifient l'état reçu
// (l'UI travaille sur une copie, voir cloneState) et renvoient des événements.
import { COURSES, DAY_EVENTS, HAND_SIZE, REGION_BY_ID, type Course } from '../config/cards';
import { ALL_REGION_IDS, buildDeck, cardById, regionCards, evaluateMenu, evaluateOneMenu, VAISSELLE } from './deck';
import { pick, randInt, shuffle, type Rng } from './rng';
import type { Card, ChefId, Choice, DayEvent, Effect, Peek, Denunciation, GameEvent, GameState, Menu, Move, Order, PlayerSetup, RegionId, RoundResult, Rules } from './types';

export interface GameOptions {
  /** Étoiles nécessaires pour devenir Chef 3 étoiles (3 par défaut). */
  etoilesToWin?: number;
  /** Au-delà de ce nombre de tours, la manche s'arrête sans gagnant (sécurité). */
  maxTurns?: number;
  /** Réglages d'équilibrage (voir Rules). */
  rules?: Partial<Rules>;
}

/**
 * Règles de la version 4 (avant la refonte « service ») : gardées pour comparer en simulation.
 */
export const V4_RULES: Rules = {
  denounceLimit: 'protege',
  headStart: 0,
  copies: 1,
  regionCount: 0,
  passCount: 2,
  mode: 'unMenu',
  regionsPerPlayer: 1,
  regionCards: 'uniques',
  secretDish: false,
  secretReserve: false,
  baguettes: 1,
  effects: { demitour: 2, troc: 2, chapardeur: 2, controle: 2 },
  blindAnnounce: true,
  lastService: true,
  revealToDenounce: true,
  openMarket: true,
  commande: 'plat',
  dishOfDay: true,
  duel: true,
  handSize: HAND_SIZE,
  vaisselleToLeader: false,
  baguetteToLast: false,
  shareTies: false,
  vaisselleStays: false,
  split: false,
  allServedStar: false,
  duelOrders: false,
  chefs: false,
};

/**
 * Règles du jeu par défaut (v5) : 1 région secrète (sa carte apporte déjà un plat), 8 cartes,
 * chaque tour une carte au voisin et une au Marché, une commande servie par tour façon
 * 7 familles, Dernier service où tout menu complet rapporte une étoile, Baguette au chef en retard.
 */
export const DEFAULT_RULES: Rules = {
  ...V4_RULES,
  denounceLimit: 'unique',
  effects: { chapardeur: 2 },
  blindAnnounce: false,
  revealToDenounce: false,
  commande: 'service',
  baguetteToLast: true,
  vaisselleStays: true,
  split: true,
  allServedStar: true,
  duelOrders: true,
  secretDish: true,
  secretReserve: true,
};
/** Règles « de base » (v3), sans les ajouts de la version 4 : utile pour comparer en simulation. */
export const BASIC_RULES: Partial<Rules> = {
  ...V4_RULES,
  effects: { demitour: 2, troc: 2 },
  blindAnnounce: false,
  lastService: false,
  revealToDenounce: false,
  openMarket: false,
  commande: 'aucune',
  dishOfDay: false,
  duel: false,
};
/** Ancienne version « 2 menus » (2 régions, 8 cartes à réunir, 1 carte par tour). */
export const TWO_MENUS_RULES: Partial<Rules> = { ...BASIC_RULES, mode: 'deuxMenus', regionsPerPlayer: 2, passCount: 1, effects: {} };

export const DAY_EVENT_IDS = Object.keys(DAY_EVENTS) as DayEvent[];

/** Mode Duel : partie à 2 joueurs avec les règles spéciales activées. */
export const isDuel = (state: Pick<GameState, 'players' | 'rules'>) => state.rules.duel && state.players.length === 2;

/** Cartes « Plat du jour » possibles : en Duel, « Inspection » remplace « Service à l'anglaise » (inutile à 2). */
export function dayEventsFor(state: Pick<GameState, 'players' | 'rules'>): DayEvent[] {
  // Règle « service » (v5) : plus d'Inspection, le Duel tire simplement parmi les autres cartes.
  if (state.rules.commande === 'service') return DAY_EVENT_IDS.filter((e) => e !== 'inspection' && !(isDuel(state) && e === 'sensInverse'));
  return DAY_EVENT_IDS.filter((e) => (isDuel(state) ? e !== 'sensInverse' : e !== 'inspection'));
}

/** Cartes à effet du paquet : en Duel, les Demi-tour (inutiles à 2) deviennent des Dégustation. */
export function effectsFor(state: Pick<GameState, 'players' | 'rules'>): Partial<Record<Effect, number>> {
  const fx = { ...state.rules.effects };
  if (isDuel(state) && fx.demitour) {
    fx.degustation = (fx.degustation ?? 0) + fx.demitour;
    delete fx.demitour;
  }
  return fx;
}

/**
 * Un joueur démasqué est-il protégé ? Jusqu'à la fin de la manche, sauf en Duel :
 * jusqu'à la fin du tour suivant seulement (sinon la Vaisselle ne servirait plus à rien).
 */
export function isProtected(state: GameState, p: number): boolean {
  if (state.rules.denounceLimit === 'tour') return (state.shieldUntil[p] ?? 0) >= state.turn;
  if (state.rules.denounceLimit !== 'protege') return false;
  return state.unmasked.includes(p) || (state.shieldUntil[p] ?? 0) >= state.turn;
}

/** Mise en place imposée d'une manche (tutoriel et tests). */
export interface RoundPreset {
  /** Les régions secrètes de chaque joueur. */
  regions: RegionId[][];
  /** Plat fourni par chaque carte Région (règle « un menu »). */
  bonus?: (Course | null)[][];
  /** Mains de départ (8 cartes chacune). */
  hands: Card[][];
  /** Pioche : la PREMIÈRE carte du tableau est le dessus de la pioche. */
  drawPile: Card[];
}

export const DEFAULT_MAX_TURNS = 200;

/** Crée une partie et distribue la première manche. 2 à 6 joueurs. */
export function createGame(setups: PlayerSetup[], rng: Rng, opts: GameOptions = {}, preset?: RoundPreset): GameState {
  if (setups.length < 2 || setups.length > 6) throw new Error('Il faut 2 à 6 joueurs');
  const state: GameState = {
    players: setups.map((s) => ({ ...s, hand: [], regions: [], bonus: [], etoiles: 0 })),
    regionsInPlay: [],
    regionReserve: [],
    drawPile: [],
    discard: [],
    phase: 'choose',
    roundNumber: 1,
    turn: 1,
    choices: {},
    denunciation: null,
    history: [],
    origins: {},
    stats: { vaisselleMoves: 0, denunciations: 0, correctDenunciations: 0, reshuffles: 0 },
    lastRound: null,
    winner: null,
    etoilesToWin: opts.etoilesToWin ?? 3,
    maxTurns: opts.maxTurns ?? DEFAULT_MAX_TURNS,
    denounceBanUntil: {},
    unmasked: [],
    shieldUntil: {},
    shown: {},
    rules: { ...DEFAULT_RULES, ...opts.rules },
    direction: 1,
    specialPile: [],
    frozen: [],
    lastService: false,
    blockedUntil: {},
    event: 'service',
    orders: [],
    catchUp: null,
    chefUsed: {},
    peeks: [],
  };
  // Variante « Chefs » : un chef différent pour chacun, tiré au hasard (sauf s'il est déjà choisi).
  if (state.rules.chefs) {
    const free = shuffle(rng, CHEF_IDS.filter((c) => !setups.some((s) => s.chef === c)));
    for (const p of state.players) p.chef ??= free.pop();
  }
  dealRound(state, rng, preset);
  return state;
}

/** Copie profonde de l'état (les cartes sont immuables, on peut les partager). */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hand: [...p.hand], regions: [...p.regions], bonus: [...p.bonus] })),
    regionsInPlay: [...s.regionsInPlay],
    regionReserve: [...s.regionReserve],
    drawPile: [...s.drawPile],
    discard: [...s.discard],
    choices: { ...s.choices },
    history: [...s.history],
    origins: { ...s.origins },
    stats: { ...s.stats },
    denounceBanUntil: { ...s.denounceBanUntil },
    unmasked: [...s.unmasked],
    shieldUntil: { ...s.shieldUntil },
    shown: { ...s.shown },
    specialPile: [...s.specialPile],
    frozen: [...s.frozen],
    blockedUntil: { ...s.blockedUntil },
    orders: [...s.orders],
    chefUsed: { ...s.chefUsed },
    peeks: [...s.peeks],
  };
}

/**
 * Distribue une manche :
 * 1. toutes les régions du jeu sont en jeu (4 cartes chacune + Baguette + Vaisselle) ;
 * 2. chaque joueur reçoit en secret 2 cartes Région : ses 2 menus à terminer.
 *    Les cartes Région non distribuées forment la réserve des régions ;
 * 3. 8 cartes par joueur, la Vaisselle TOUJOURS dans une main au hasard ;
 * 4. le reste forme la pioche, la défausse est vide.
 */
export function dealRound(state: GameState, rng: Rng, preset?: RoundPreset): void {
  const n = state.players.length;
  state.choices = {};
  state.denunciation = null;
  state.denounceBanUntil = {};
  state.unmasked = [];
  state.shieldUntil = {};
  state.shown = {};
  state.direction = 1;
  state.specialPile = [];
  state.frozen = [];
  state.lastService = false;
  state.blockedUntil = {};
  state.orders = [];
  state.peeks = [];
  // Carte « Plat du jour » : un événement pour toute la manche.
  state.event = state.rules.dishOfDay && !preset ? pick(rng, dayEventsFor(state)) : 'service';
  if (state.event === 'sensInverse') state.direction = -1;
  state.history = [];
  state.origins = {};
  state.discard = [];
  state.turn = 1;
  state.phase = 'choose';
  state.lastRound = null;
  state.stats = { vaisselleMoves: 0, denunciations: 0, correctDenunciations: 0, reshuffles: 0 };
  state.regionsInPlay = [...ALL_REGION_IDS];

  if (preset) {
    const dealt = preset.regions.flat();
    state.regionReserve = ALL_REGION_IDS.filter((r) => !dealt.includes(r));
    state.players.forEach((p, i) => {
      p.regions = [...preset.regions[i]];
      p.bonus = preset.bonus?.[i] ? [...preset.bonus[i]] : p.regions.map(() => null);
      p.hand = [...preset.hands[i]];
    });
    if (state.rules.mode === 'unMenu') {
      const taken = state.players.flatMap((p) => p.regions.map((r, k) => `${r}|${p.bonus[k]}`));
      state.regionReserve = regionDeck(state.rules).filter((x) => !taken.includes(x) && !taken.some((t) => state.rules.regionCards === 'uniques' && t.split('|')[0] === x.split('|')[0]));
    }
    state.drawPile = [...preset.drawPile].reverse(); // le dessus est la fin du tableau
  } else {
    const count = state.rules.regionCount ? Math.max(state.rules.regionCount, n * state.rules.regionsPerPlayer + 1) : ALL_REGION_IDS.length;
    state.regionsInPlay = shuffle(rng, [...ALL_REGION_IDS]).slice(0, count);
    const secret = shuffle(rng, [...state.regionsInPlay]);
    state.players.forEach((p) => {
      p.regions = secret.splice(0, state.rules.regionsPerPlayer);
      p.bonus = p.regions.map(() => null);
    });
    state.regionReserve = secret;
    if (state.rules.mode === 'unMenu') {
      // Cartes Région notées « région|plat » (le plat qu'elles représentent). La réserve
      // garde les cartes Région non distribuées.
      const cards = shuffle(rng, regionDeck(state.rules, state.regionsInPlay));
      state.players.forEach((p) => {
        const mine: string[] = [];
        while (mine.length < state.rules.regionsPerPlayer) {
          const k = cards.findIndex((x) => !mine.some((m) => m.split('|')[0] === x.split('|')[0]));
          mine.push(...cards.splice(k, 1));
        }
        p.regions = mine.map((x) => x.split('|')[0]);
        p.bonus = mine.map((x) => x.split('|')[1] as Course);
      });
      state.regionReserve = cards;
    }

    let deck = shuffle(rng, buildDeck(state.regionsInPlay, state.rules.copies, state.rules.baguettes, effectsFor(state)).filter((c) => c.kind !== 'vaisselle'));
    if (state.rules.mode === 'unMenu' && state.rules.secretDish) {
      // Une carte Plat de chaque région, mélangées, une par joueur (face cachée, à part) :
      // elles quittent le paquet ; les autres y retournent.
      const picks = shuffle(rng, state.regionsInPlay.map((r) => pick(rng, deck.filter((c) => c.kind === 'dish' && c.region === r))));
      state.players.forEach((p, i) => {
        const c = picks[i] as Card & { kind: 'dish' };
        p.regions = [c.region];
        p.bonus = [c.course];
      });
      // En Duel (règle « secretReserve »), les plats non donnés restent à part, face cachée.
      const reserve = state.rules.secretReserve && n === 2;
      const given = new Set(picks.slice(0, reserve ? picks.length : n).map((c) => c.id));
      deck = deck.filter((c) => !given.has(c.id));
      state.regionReserve = reserve ? picks.slice(n).map((c) => `${c.kind === 'dish' ? c.region : ''}|${c.kind === 'dish' ? c.course : ''}`) : [];
    }
    // Celui qui reçoit la Vaisselle : au hasard, ou (règle « vaisselleToLeader ») le chef en tête.
    const top = Math.max(...state.players.map((p) => p.etoiles));
    const leaders = state.players.map((p, i) => (p.etoiles === top ? i : -1)).filter((i) => i >= 0);
    const unlucky = state.rules.vaisselleToLeader && top > 0 ? pick(rng, leaders) : randInt(rng, n);
    // À 6 joueurs avec le plat secret, le paquet est plus court : 7 cartes en main.
    const H = state.rules.handSize - (state.rules.mode === 'unMenu' && state.rules.secretDish && n >= 6 ? 1 : 0);
    // Coup de pouce éventuel : quelques cartes de ses propres régions dès le départ
    // (mises de côté pour tout le monde avant la donne au hasard).
    // Tirées au hasard (et jamais le plat que représente déjà la carte Région) : prendre
    // les premières du paquet repoussait les autres vers le fond, au profit des derniers joueurs.
    const boosts = state.players.map((p) =>
      p.regions.flatMap((r, k) => shuffle(rng, deck.filter((c) => c.kind === 'dish' && c.region === r && c.course !== p.bonus[k])).slice(0, state.rules.headStart)),
    );
    for (const c of boosts.flat()) deck.splice(deck.indexOf(c), 1);
    // Coup de main : dès qu'un chef a une étoile, celui qui en a le moins commence la manche avec la
    // Baguette ; à égalité, le plus jeune (puis le premier dans l'ordre des places). Tant que personne
    // n'a d'étoile, la Baguette est distribuée au hasard comme les autres cartes.
    const bi = deck.findIndex((c) => c.kind === 'baguette');
    state.catchUp = null;
    if (state.rules.baguetteToLast && bi >= 0 && state.players.some((p) => p.etoiles > 0)) {
      state.catchUp = catchUpPlayer(state);
      boosts[state.catchUp].push(...deck.splice(bi, 1));
    }
    state.players.forEach((p, i) => {
      const boost = boosts[i];
      p.hand = [...boost, ...deck.splice(0, (i === unlucky ? H - 1 : H) - boost.length)];
      shuffle(rng, p.hand);
      if (i === unlucky) p.hand.splice(randInt(rng, H), 0, VAISSELLE);
    });
    state.drawPile = deck;
  }
  for (const p of state.players) for (const c of p.hand) state.origins[c.id] = 'deal';
}

/** Le chef qui reçoit la Baguette : le moins d'étoiles, puis le plus jeune, puis la première place. */
export function catchUpPlayer(state: GameState): number {
  const age = (i: number) => state.players[i].age ?? Infinity;
  return state.players
    .map((_, i) => i)
    .sort((a, b) => state.players[a].etoiles - state.players[b].etoiles || age(a) - age(b) || a - b)[0];
}

/**
 * Les cartes Région de la règle « un menu », notées « région|plat » :
 * une par région (plat fixe de la config) ou une par région et par plat.
 */
export function regionDeck(rules: Rules, regions: RegionId[] = ALL_REGION_IDS): string[] {
  return rules.regionCards === 'uniques' ? regions.map((r) => `${r}|${REGION_BY_ID[r].regionCourse}`) : regions.flatMap((r) => COURSES.map((c) => `${r}|${c}`));
}

/** Passe à la manche suivante (après un écran de fin de manche). */
export function nextRound(state: GameState, rng: Rng): GameEvent[] {
  if (state.phase !== 'roundOver') throw new Error('La manche n’est pas terminée');
  state.roundNumber += 1;
  dealRound(state, rng);
  return [{ type: 'roundStart', round: state.roundNumber }];
}

/** Joueurs encore actifs ce tour-ci (ceux qui n'ont pas posé leur main face cachée). */
export const activePlayers = (state: GameState) => state.players.map((_, i) => i).filter((i) => !state.frozen.includes(i));

/**
 * Voisin qui reçoit nos cartes : à gauche, ou à droite après un Demi-tour.
 * Pendant le Dernier service, on saute les joueurs dont la main est posée face cachée.
 */
export function leftOf(state: GameState, p: number): number {
  const n = state.players.length;
  let q = p;
  for (let k = 0; k < n; k++) {
    q = (q + state.direction + n) % n;
    if (!state.frozen.includes(q) || q === p) return q;
  }
  return q;
}
/** Voisin qui nous passe ses cartes. */
export function rightOf(state: GameState, p: number): number {
  const n = state.players.length;
  let q = p;
  for (let k = 0; k < n; k++) {
    q = (q - state.direction + n) % n;
    if (!state.frozen.includes(q) || q === p) return q;
  }
  return q;
}

/** Nombre de cartes à donner ce tour-ci (« Coup de feu » : 3). */
export const passCountOf = (state: GameState) => (state.event === 'troisCartes' ? 3 : state.rules.passCount);
/** Nombre de commandes permises par manche (« Carte blanche » : 2). */
export const ordersAllowed = (state: GameState) => (state.rules.commande === 'aucune' ? 0 : state.event === 'commandeLibre' ? 2 : 1);

/** Règle « service » : commandes permises par tour (2 avec « Carte blanche », et 2 en Duel si `duelOrders`). */
export const ordersPerTurn = (state: GameState, player?: number) =>
  1 + (state.event === 'commandeLibre' ? 1 : 0) + (isDuel(state) && state.rules.duelOrders ? 1 : 0) + (player !== undefined && chefReady(state, player, 'gourmand') ? 1 : 0);

export const CHEF_IDS: ChefId[] = ['gourmand', 'maraichere', 'plongeur', 'critique', 'renard', 'maitre'];
/** Le joueur a-t-il ce chef (variante « Chefs ») ? */
export const hasChef = (state: GameState, player: number, chef: ChefId) => state.rules.chefs && state.players[player]?.chef === chef;
/** Pouvoir « une fois par manche » encore disponible ? */
export const chefReady = (state: GameState, player: number, chef: ChefId) => hasChef(state, player, chef) && state.chefUsed[player] !== state.roundNumber;

/** Vérifie qu'un pouvoir actif (Plongeur, Critique, Renard) peut être utilisé maintenant. */
export function checkChefPower(state: GameState, player: number, chef: ChefId, target: number): string | null {
  if (!chefReady(state, player, chef)) return 'Pouvoir déjà utilisé cette manche';
  if (state.phase !== 'choose' || state.frozen.includes(player) || state.choices[player]) return 'Avant de choisir tes cartes';
  if (pendingOrder(state)) return 'Une commande est en cours';
  if (target === player || !state.players[target] || state.frozen.includes(target)) return 'Choisis un autre chef';
  if (chef === 'plongeur') {
    if (vaisselleHolder(state) !== player) return 'Il faut avoir la Vaisselle';
    if (vaisselleLocked(state, player)) return 'Après une dénonciation, la Vaisselle reste chez toi ce tour-ci';
  }
  return null;
}

/**
 * POUVOIRS DE CHEF (avant de choisir ses cartes, une fois par manche) :
 * - Plongeur : la Vaisselle part chez le chef visé, qui rend une carte au hasard ;
 * - Critique : regarde toute la main du chef visé ;
 * - Renard : vole une carte au hasard au chef visé et lui rend la carte `give`.
 */
export function useChefPower(state: GameState, player: number, chef: ChefId, target: number, rng: Rng, give?: string): Peek | Card | null {
  const err = checkChefPower(state, player, chef, target);
  if (err) throw new Error(err);
  const me = state.players[player].hand;
  const other = state.players[target].hand;
  state.chefUsed[player] = state.roundNumber;
  if (chef === 'critique') {
    const peek: Peek = { player, target, turn: state.turn, cards: [...other] };
    state.peeks.push(peek);
    return peek;
  }
  if (chef === 'plongeur') {
    const vi = me.findIndex((c) => c.kind === 'vaisselle');
    const gi = randInt(rng, other.length);
    swapCards(me, vi, other, gi);
    state.origins[me[vi].id] = 'swap';
    state.stats.vaisselleMoves += 1;
    delete state.choices[target];
    return me[vi];
  }
  if (chef === 'renard') {
    let gi = me.findIndex((c) => c.id === give);
    if (gi < 0 || me[gi].kind === 'vaisselle') gi = me.findIndex((c) => c.kind !== 'vaisselle');
    const si = randInt(rng, other.length);
    const stolen = other[si];
    swapCards(me, gi, other, si);
    state.origins[stolen.id] = 'swap';
    delete state.choices[target];
    return stolen;
  }
  return null;
}

/** Commande servie dont la carte rendue n'a pas encore été choisie (une à la fois). */
export const pendingOrder = (state: GameState) => state.orders.find((o) => o.served && o.given === undefined) ?? null;

/**
 * Après une dénonciation (juste ou fausse), la Vaisselle ne bouge plus jusqu'au tour suivant :
 * l'accusé démasqué la garde, l'accusateur qui s'est trompé aussi (règle « vaisselleStays »).
 */
export const vaisselleLocked = (state: GameState, player: number) =>
  !!state.denunciation && vaisselleHolder(state) === player && (state.rules.vaisselleStays || (!state.denunciation.correct && state.denunciation.accuser === player));

/** Peut-on passer commande maintenant ? (renvoie un message d'erreur, ou null) */
export function checkOrder(state: GameState, player: number, express = false): string | null {
  if (state.rules.commande === 'aucune') return 'Pas de commande dans cette version';
  if (state.phase !== 'choose' || state.frozen.includes(player)) return 'Ce n’est pas le moment de commander';
  if (state.choices[player]) return 'Commande avant de choisir tes cartes';
  if (pendingOrder(state)) return 'Une commande est en cours';
  if (state.rules.commande === 'service') {
    const per = ordersPerTurn(state, player);
    const used = state.orders.filter((o) => o.player === player && o.turn === state.turn && !o.express).length;
    if (express) return state.players[player].hand.some((c) => c.kind === 'effect' && c.effect === 'express') ? null : 'Il faut une carte Livraison express';
    if (used >= per) return per > 1 ? 'Deux commandes par tour, pas plus' : 'Une commande par tour';
    return null;
  }
  if (state.orders.filter((o) => o.player === player).length >= ordersAllowed(state)) return 'Tu as déjà passé ta commande cette manche';
  return null;
}

/** Indice du joueur qui a la Vaisselle en main (toujours quelqu'un). */
export function vaisselleHolder(state: GameState): number | null {
  const i = state.players.findIndex((p) => p.hand.some((c) => c.kind === 'vaisselle'));
  return i < 0 ? null : i;
}

/** Remet la défausse dans la pioche, mélangée. */
function reshuffle(state: GameState, rng: Rng): void {
  state.drawPile = shuffle(rng, [...state.discard, ...state.drawPile]);
  state.discard = [];
  state.stats.reshuffles += 1;
}

/** Pioche la carte du dessus ; si la pioche est vide, on remélange la défausse. */
function drawCard(state: GameState, rng: Rng): { card: Card; reshuffled: boolean } {
  let reshuffled = false;
  if (state.drawPile.length === 0) {
    reshuffle(state, rng);
    reshuffled = true;
  }
  const card = state.drawPile.pop();
  if (!card) throw new Error('Plus aucune carte à piocher');
  return { card, reshuffled };
}

/**
 * Peut-on dénoncer ? Seulement avec la Vaisselle en main, avant les choix du tour,
 * une seule fois par tour, et pas juste après une fausse accusation.
 * Renvoie un message d'erreur, ou null si c'est permis.
 */
export function checkDenounce(state: GameState, accuser: number): string | null {
  if (state.phase !== 'choose') return 'On ne peut dénoncer qu’avant de choisir ses cartes';
  if (state.lastService) return 'Pas de dénonciation pendant le Dernier service';
  if (state.event === 'sansDenonciation') return 'Repas de famille : pas de dénonciation cette manche';
  if (state.denunciation) return 'Il y a déjà eu une dénonciation ce tour-ci';
  if (vaisselleHolder(state) !== accuser) return 'Il faut avoir la Vaisselle pour dénoncer';
  if ((state.denounceBanUntil[accuser] ?? 0) > state.turn) return 'Après une fausse accusation, il faut attendre un tour';
  if (pendingOrder(state)) return 'Termine d’abord la commande en cours';
  if (state.rules.denounceLimit === 'unique' && state.history.some((h) => h.denunciation?.accuser === accuser))
    return 'Tu as déjà dénoncé quelqu’un cette manche';
  return null;
}

/** Échange deux cartes en place entre deux mains. */
function swapCards(a: Card[], i: number, b: Card[], j: number): void {
  [a[i], b[j]] = [b[j], a[i]];
}

/**
 * DÉNONCIATION : « Je te démasque : Alsace ! » — réservée au porteur de la Vaisselle.
 * Il faut d'abord montrer une carte de sa main à tous (`reveal`).
 * - Juste : l'accusé reçoit la Vaisselle (et rend une carte au hasard), remplace sa carte
 *   Région par une carte de la réserve, puis il est protégé jusqu'à la fin de la manche
 *   (en Duel : jusqu'à la fin du tour suivant).
 *   Récompense : la carte montrée part chez l'accusé, contre une carte prise au hasard chez lui.
 * - Fausse : l'accusateur garde la Vaisselle et ne peut pas dénoncer au tour suivant.
 * Les choix déjà faits ce tour-ci sont annulés (les mains ont pu changer).
 * `swapCardId` / `rewardCardId` imposent les cartes tirées « au hasard » (tutoriel, tests).
 */
export function denounce(
  state: GameState,
  accuser: number,
  target: number,
  region: RegionId,
  rng: Rng,
  swapCardId?: string,
  opts: { reveal?: string; rewardCardId?: string } = {},
): GameEvent[] {
  const err = checkDenounce(state, accuser);
  if (err) throw new Error(err);
  if (accuser === target || !state.players[target]) throw new Error('Accusation impossible');
  if (isProtected(state, target))
    throw new Error(`${state.players[target].name} a déjà été démasqué : il est protégé jusqu’à la fin ${isDuel(state) ? 'du tour suivant' : 'de la manche'}`);
  if (!state.regionsInPlay.includes(region)) throw new Error('Cette région n’est pas en jeu');

  const me = state.players[accuser];
  const p = state.players[target];
  let revealed: Card | undefined;
  if (state.rules.revealToDenounce) {
    const choices = me.hand.filter((c) => c.kind !== 'vaisselle');
    revealed = choices.find((c) => c.id === opts.reveal) ?? (opts.reveal ? undefined : pick(rng, choices));
    if (!revealed) throw new Error('Montre une carte de ta main (pas la Vaisselle) pour dénoncer');
  }
  const correct = p.regions.includes(region);
  let vaisselleTo: number | null = null;
  let vaisselleFrom: number | null = null;
  let rewardTaken: Card | undefined;

  if (correct) {
    // La Vaisselle passe à l'accusé, qui rend une carte à la place.
    const vIndex = me.hand.findIndex((c) => c.kind === 'vaisselle');
    let gIndex = swapCardId ? p.hand.findIndex((c) => c.id === swapCardId) : -1;
    if (gIndex < 0) gIndex = randInt(rng, p.hand.length);
    const given = p.hand[gIndex];
    swapCards(p.hand, gIndex, me.hand, vIndex);
    state.origins[VAISSELLE.id] = 'swap';
    state.origins[given.id] = 'swap';
    state.stats.vaisselleMoves += 1;
    vaisselleTo = target;
    vaisselleFrom = accuser;

    // Récompense : la carte montrée contre une carte au hasard de l'accusé.
    if (revealed) {
      const options = p.hand.map((c, k) => ({ c, k })).filter((x) => x.c.kind !== 'vaisselle');
      const chosen = options.find((x) => x.c.id === opts.rewardCardId) ?? pick(rng, options);
      const rIndex = me.hand.findIndex((c) => c.id === revealed!.id);
      if (chosen && rIndex >= 0) {
        rewardTaken = chosen.c;
        swapCards(p.hand, chosen.k, me.hand, rIndex);
        state.origins[chosen.c.id] = 'swap';
      }
    }

    // Anti-jeu : la région démasquée est remplacée par une région de la réserve.
    if (state.rules.mode === 'unMenu' && state.rules.secretDish) {
      // Le plat secret est révélé et part au Marché ; l'accusé pioche un nouveau plat secret
      // (première carte Plat de la pioche d'une autre région).
      // En Duel, il le pioche dans la réserve des plats secrets (régions toujours différentes).
      const i = p.regions.indexOf(region);
      const old = regionCards(region).find((c) => c.course === p.bonus[i]);
      if (state.regionReserve.length) {
        const fresh = pick(rng, state.regionReserve);
        state.regionReserve = state.regionReserve.filter((x) => x !== fresh);
        if (old) state.discard.push(old);
        p.regions[i] = fresh.split('|')[0];
        p.bonus[i] = fresh.split('|')[1] as Course;
      } else {
        const k = state.drawPile.map((c, j) => ({ c, j })).reverse().find((x) => x.c.kind === 'dish' && x.c.region !== region)?.j ?? -1;
        if (k >= 0) {
          if (old) state.discard.push(old);
          const fresh = state.drawPile.splice(k, 1)[0] as Card & { kind: 'dish' };
          p.regions[i] = fresh.region;
          p.bonus[i] = fresh.course;
        }
      }
    } else if (state.rules.mode === 'unMenu') {
      const i = p.regions.indexOf(region);
      const fresh = pick(rng, state.regionReserve.filter((x) => !p.regions.includes(x.split('|')[0])));
      state.regionReserve = [...state.regionReserve.filter((x) => x !== fresh), `${region}|${p.bonus[i]}`];
      p.regions[i] = fresh.split('|')[0];
      p.bonus[i] = fresh.split('|')[1] as Course;
    } else {
      const fresh = pick(rng, state.regionReserve);
      state.regionReserve = [...state.regionReserve.filter((r) => r !== fresh), region];
      p.regions = p.regions.map((r) => (r === region ? fresh : r));
    }
    // Protégé jusqu'à la fin de la manche (en Duel : jusqu'à la fin du tour suivant).
    if (isDuel(state) || state.rules.denounceLimit === 'tour') state.shieldUntil[target] = state.turn + 1;
    else state.unmasked.push(target);
    state.stats.correctDenunciations += 1;
  } else {
    state.denounceBanUntil[accuser] = state.turn + 2;
  }
  state.stats.denunciations += 1;
  state.choices = {};
  const d: Denunciation = { accuser, target, region, correct, vaisselleTo, vaisselleFrom, revealed, rewardTaken };
  state.denunciation = d;
  return [{ type: 'denounce', denunciation: d }];
}

/**
 * COMMANDE : « Qui a le Reblochon ? » (ou « Qui a un Fromage ? »), à voix haute, avant de
 * choisir ses cartes. Chaque autre joueur répond honnêtement oui ou non. Une fois par manche.
 */
export interface OrderQuery {
  cardId?: string;
  course?: Course;
  target?: number;
  give?: string;
  /** Commande en plus, en défaussant une « Livraison express ». */
  express?: boolean;
  /** Le joueur visé joue-t-il « Rupture de stock » s'il en a une ? (décision du joueur visé) */
  refuse?: (target: number) => boolean;
}

export function placeOrder(state: GameState, player: number, query: OrderQuery, rng?: Rng): GameEvent[] {
  const err = checkOrder(state, player, query.express);
  if (err) throw new Error(err);
  if (state.rules.commande === 'service') return serveOrder(state, player, query, rng);
  if (state.rules.commande === 'plat' && !query.cardId) throw new Error('Choisis un plat');
  if (state.rules.commande === 'type' && !query.course) throw new Error('Choisis un type de plat');
  const has = (q: number) =>
    state.players[q].hand.some((c) => c.kind === 'dish' && (query.cardId ? imageIdOf(c.id) === imageIdOf(query.cardId) : c.course === query.course));
  const yes = state.players.map((_, q) => q).filter((q) => q !== player && has(q));
  const order: Order = { player, turn: state.turn, cardId: query.cardId, course: query.course, yes };
  state.orders.push(order);
  return [{ type: 'order', order }];
}
const imageIdOf = (id: string) => id.replace(/-\d+$/, '');

/**
 * COMMANDE « service » (façon 7 familles) : « Bob, as-tu le Reblochon ? ». Si Bob l'a, il te le
 * donne et tu lui rends une carte de ton choix (`give`, éventuellement choisie plus tard avec
 * settleOrder) — même la Vaisselle ! La demande et la réponse sont publiques, la carte rendue non.
 */
function serveOrder(state: GameState, player: number, query: OrderQuery, rng?: Rng): GameEvent[] {
  const t = query.target;
  if (!query.cardId || cardById(query.cardId).kind !== 'dish') throw new Error('Choisis un plat');
  if (t === undefined || t === player || !state.players[t]) throw new Error('Choisis à qui tu demandes');
  if (state.frozen.includes(t)) throw new Error('Ce joueur a posé sa main face cachée');
  if (state.orders.some((o) => o.player === player && o.target === t && o.turn === state.turn && o.cardId && imageIdOf(o.cardId) === imageIdOf(query.cardId!)))
    throw new Error('Tu viens de le lui demander !');
  const other = state.players[t].hand;
  // Livraison express : la carte part sur la pile spéciale, on pioche pour la remplacer.
  if (query.express) discardEffect(state, player, 'express', rng);
  const k = other.findIndex((c) => c.kind === 'dish' && imageIdOf(c.id) === imageIdOf(query.cardId!));
  const order: Order = { player, turn: state.turn, cardId: query.cardId, target: t, yes: k >= 0 ? [t] : [], served: k >= 0, express: query.express || undefined };
  // Gourmand : la commande en plus consomme son pouvoir de la manche.
  if (!query.express && chefReady(state, player, 'gourmand') && state.orders.filter((o) => o.player === player && o.turn === state.turn && !o.express).length >= ordersPerTurn(state, player) - 1) state.chefUsed[player] = state.roundNumber;
  state.orders.push(order);
  // Rupture de stock : le joueur visé avait le plat, mais refuse de le servir (et tout le monde le sait).
  const maitre = chefReady(state, t, 'maitre');
  if (k >= 0 && (maitre || other.some((c) => c.kind === 'effect' && c.effect === 'rupture')) && query.refuse?.(t)) {
    if (maitre) state.chefUsed[t] = state.roundNumber;
    else discardEffect(state, t, 'rupture', rng);
    order.served = false;
    order.refused = true;
    return [{ type: 'order', order }];
  }
  if (k >= 0) {
    const card = other.splice(k, 1)[0];
    // Sa main a changé : s'il avait déjà choisi ses cartes, il choisit à nouveau.
    delete state.choices[t];
    state.players[player].hand.push(card);
    state.origins[card.id] = 'order';
    if (query.give) settleOrder(state, player, query.give);
  }
  return [{ type: 'order', order }];
}

/** Une carte à effet jouée hors de l'échange : sur la pile spéciale, et on pioche pour garder sa main. */
function discardEffect(state: GameState, player: number, effect: Effect, rng?: Rng): void {
  const hand = state.players[player].hand;
  const i = hand.findIndex((c) => c.kind === 'effect' && c.effect === effect);
  if (i < 0) throw new Error('Carte à effet absente');
  state.specialPile.push(...hand.splice(i, 1));
  if (state.drawPile.length === 0 && state.discard.length) reshuffle(state, rng ?? Math.random);
  const c = state.drawPile.pop();
  if (c) {
    hand.push(c);
    state.origins[c.id] = 'market';
  }
}

/** Commande servie : la carte rendue au joueur qui a servi (pas celle qu'on vient de recevoir). */
export function settleOrder(state: GameState, player: number, give: string): void {
  const order = pendingOrder(state);
  if (!order || order.player !== player) throw new Error('Aucune commande à régler');
  const me = state.players[player].hand;
  const i = me.findIndex((c) => c.id === give);
  if (i < 0) throw new Error('Cette carte n’est pas dans ta main');
  if (give === order.cardId || (me[i].kind === 'dish' && imageIdOf(me[i].id) === imageIdOf(order.cardId!))) throw new Error('Rends une autre carte que le plat servi');
  if (me[i].kind === 'vaisselle' && vaisselleLocked(state, player)) throw new Error('Après une dénonciation, la Vaisselle reste chez toi jusqu’au prochain tour');
  const [card] = me.splice(i, 1);
  state.players[order.target!].hand.push(card);
  state.origins[card.id] = 'swap';
  if (card.kind === 'vaisselle') state.stats.vaisselleMoves += 1;
  order.given = give;
}

/** Inspection : ce joueur doit-il encore montrer une carte avant de choisir ? */
export const mustShow = (state: GameState, player: number) =>
  state.event === 'inspection' && state.phase === 'choose' && !state.frozen.includes(player) && state.shown[player] === undefined;

/**
 * INSPECTION (Plat du jour du Duel) : au début du tour, chacun montre une carte de sa main
 * (pas la Vaisselle, déjà visible). La carte reste dans sa main.
 */
export function showCard(state: GameState, player: number, cardId: string): GameEvent[] {
  if (!mustShow(state, player)) throw new Error('Pas de carte à montrer maintenant');
  const card = state.players[player].hand.find((c) => c.id === cardId);
  if (!card) throw new Error('Cette carte n’est pas dans ta main');
  if (card.kind === 'vaisselle') throw new Error('La Vaisselle est déjà visible : montre une autre carte');
  state.shown[player] = cardId;
  return [{ type: 'show', player, card }];
}

/** Vérifie qu'un choix est autorisé (renvoie un message d'erreur, ou null). */
export function checkChoice(state: GameState, player: number, choice: Choice): string | null {
  if (state.phase !== 'choose') return 'Ce n’est pas le moment de choisir';
  if (state.frozen.includes(player)) return 'Ta main est posée face cachée';
  if (mustShow(state, player)) return 'Inspection : montre d’abord une carte';
  if (pendingOrder(state)?.player === player) return 'Choisis d’abord la carte rendue pour ta commande';
  const need = passCountOf(state);
  const all = [{ cardId: choice.cardId, mode: choice.mode, target: choice.target, give: choice.give }, ...(choice.extra ?? [])];
  if (all.length !== need) return `Il faut donner ${need} carte${need > 1 ? 's' : ''}`;
  if (new Set(all.map((x) => x.cardId)).size !== all.length) return 'Une même carte ne peut pas être donnée deux fois';
  if (state.rules.split && need === 2 && leftOf(state, player) !== player && all.filter((x) => x.mode === 'pass').length !== 1 && !(state.event === 'fromagesBloques'))
    return 'Une carte va à ton voisin, l’autre au Marché';
  const hand = state.players[player]?.hand ?? [];
  for (const x of all) {
    const card = hand.find((c) => c.id === x.cardId);
    if (!card) return 'Cette carte n’est pas dans ta main';
    if (x.mode === 'market' && card.kind === 'vaisselle') return 'La Vaisselle ne va jamais au Marché !';
    if (card.kind === 'vaisselle' && vaisselleLocked(state, player)) return 'Après une dénonciation, la Vaisselle reste chez toi jusqu’au prochain tour';
    if (card.kind === 'vaisselle' && leftOf(state, player) === player) return 'Personne à qui passer la Vaisselle : elle reste dans ta main';
    if (x.mode === 'pass' && state.event === 'fromagesBloques' && card.kind === 'dish' && card.course === 'fromage') return 'Plateau de fromages : les fromages ne se passent pas, ils vont au Marché';
    if (x.mode === 'effect') {
      if (card.kind !== 'effect') return 'Seule une carte à effet peut être jouée';
      if (card.effect === 'rupture') return 'Rupture de stock se joue quand on te passe commande';
      if (card.effect === 'express') return 'Livraison express se joue au moment de commander';
      if (card.effect !== 'demitour') {
        if (x.target === undefined || x.target === player || !state.players[x.target]) return 'Choisis le joueur visé';
        if (card.effect !== 'controle' && state.frozen.includes(x.target)) return 'Ce joueur a posé sa main face cachée';
      }
      if (card.effect === 'chapardeur') {
        const give = hand.find((c) => c.id === x.give);
        if (!give || all.some((y) => y.cardId === x.give)) return 'Choisis la carte que tu rendras au joueur volé';
        if (give.kind === 'vaisselle') return 'On ne rend pas la Vaisselle avec le Chapardeur';
      }
    } else if (x.mode !== 'pass' && x.mode !== 'market') return 'Action inconnue';
  }
  return null;
}

/** CHOIX SECRET : les cartes à donner, chacune passée, au Marché ou jouée. On peut changer d'avis avant la révélation. */
export function submitChoice(state: GameState, player: number, choice: Choice): void {
  const err = checkChoice(state, player, choice);
  if (err) throw new Error(err);
  state.choices[player] = { ...choice, extra: choice.extra?.map((x) => ({ ...x })) };
}

export const allChosen = (state: GameState) => activePlayers(state).every((i) => state.choices[i]);

/** Joueurs qui recevront au moins une carte venant du Marché (ou d'une carte à effet) ce tour-ci. */
export function marketReceivers(state: GameState): number[] {
  const out = new Set<number>();
  for (const i of activePlayers(state)) {
    const ch = state.choices[i];
    if (!ch) continue;
    if ([ch, ...(ch.extra ?? [])].some((x) => x.mode !== 'pass')) out.add(leftOf(state, i));
  }
  return [...out];
}

/** Carte visible du dessus de la défausse (Marché ouvert), avant les dépôts du tour. */
export const visibleDiscard = (state: GameState) => state.discard[state.discard.length - 1] ?? null;

/**
 * RÉVÉLATION : tous les échanges ont lieu en même temps.
 * - Passer : la carte va au voisin.
 * - Marché : la carte va face visible à la défausse ; le voisin reçoit la carte du dessus de
 *   la pioche, ou (Marché ouvert) la carte qui était visible sur la défausse s'il la choisit
 *   (`takes`). Une seule carte visible par tour : en cas de conflit, l'ordre de service est tiré au hasard.
 * - Carte à effet jouée : elle part sur la pile spéciale, le voisin pioche (comme au Marché),
 *   puis l'effet s'applique après l'échange.
 * Chaque carte reçue prend la place de la carte donnée : tout le monde garde 8 cartes.
 */
export function resolveExchange(state: GameState, rng: Rng, takes: Record<number, 'pioche' | 'defausse'> = {}): GameEvent[] {
  if (state.phase !== 'choose') throw new Error('Pas d’échange en cours');
  if (!allChosen(state)) throw new Error('Tout le monde n’a pas encore choisi');
  const events: GameEvent[] = [];
  const active = activePlayers(state);
  let visible = state.rules.openMarket ? visibleDiscard(state) : null;
  const tookVisible = new Set<number>();

  // 1. Chacun retire ses cartes (en mémorisant leur place dans la main).
  const slots: Record<number, { index: number; card: Card; mode: Choice['mode']; target?: number; give?: string }[]> = {};
  for (const i of active) {
    const ch = state.choices[i];
    const p = state.players[i];
    slots[i] = [{ cardId: ch.cardId, mode: ch.mode, target: ch.target, give: ch.give }, ...(ch.extra ?? [])].map((x) => {
      const index = p.hand.findIndex((c) => c.id === x.cardId);
      // Seul au Dernier service (Duel) : personne à qui passer, la carte va au Marché.
      const mode = x.mode === 'pass' && leftOf(state, i) === i ? 'market' : x.mode;
      return { index, card: p.hand[index], mode, target: x.target, give: x.give };
    });
  }
  // 2. Les cartes du Marché arrivent face visible sur la défausse ;
  //    les cartes à effet jouées vont sur la pile spéciale (sorties du jeu).
  //    Les cartes posées en même temps s'empilent dans un ordre tiré au hasard : la carte
  //    qui reste visible ne favorise personne (sinon ce serait toujours celle du dernier joueur).
  const toMarket = shuffle(rng, active.flatMap((i) => slots[i].filter((x) => x.mode === 'market').map((x) => x.card)));
  state.discard.push(...toMarket);
  for (const i of active) for (const x of slots[i]) if (x.mode === 'effect') state.specialPile.push(x.card);

  // 3. Chaque voisin reçoit ses cartes, aux emplacements de celles qu'il a données.
  let reshuffled = false;
  const moves: Move[] = [];
  const incoming: Record<number, Card[]> = Object.fromEntries(active.map((i) => [i, []]));
  // Ordre de service tiré au hasard : personne n'est toujours servi en premier au Marché ouvert.
  for (const i of shuffle(rng, [...active])) {
    const to = leftOf(state, i);
    for (const x of slots[i]) {
      const move: Move = { player: i, mode: x.mode, card: x.card, to, target: x.target, give: x.give };
      let card = x.card;
      if (x.mode !== 'pass') {
        // La carte visible a pu repartir dans la pioche si la défausse a été remélangée.
        if (visible && !state.discard.includes(visible)) visible = null;
        if (visible && takes[to] === 'defausse' && !tookVisible.has(to)) {
          // Marché ouvert : le receveur prend la carte qui était visible.
          card = visible;
          state.discard.splice(state.discard.lastIndexOf(visible), 1);
          visible = null;
          tookVisible.add(to);
          move.fromDiscard = true;
        } else {
          const d = drawCard(state, rng);
          reshuffled ||= d.reshuffled;
          card = d.card;
          // Maraîchère : elle pioche 2 cartes, garde la meilleure et remet l'autre sous la pioche.
          if (chefReady(state, to, 'maraichere') && (state.drawPile.length || state.discard.length)) {
            state.chefUsed[to] = state.roundNumber;
            const e = drawCard(state, rng);
            reshuffled ||= e.reshuffled;
            const useful = (c: Card) => c.kind === 'dish' && state.players[to].regions.includes(c.region) && !state.players[to].hand.some((h) => h.id === c.id);
            const [keep, back] = useful(e.card) && !useful(card) ? [e.card, card] : [card, e.card];
            card = keep;
            state.drawPile.unshift(back);
          }
        }
        move.drawn = card;
        state.origins[card.id] = move.fromDiscard ? 'choice' : 'market';
      } else {
        state.origins[card.id] = 'pass';
        if (card.kind === 'vaisselle') state.stats.vaisselleMoves += 1;
      }
      incoming[to].push(card);
      moves.push(move);
    }
  }
  for (const i of active) slots[i].forEach((x, k) => (state.players[i].hand[x.index] = incoming[i][k]));

  // 4. Effets des cartes jouées, dans l'ordre des joueurs.
  for (const m of moves) {
    if (m.mode !== 'effect' || m.card.kind !== 'effect') continue;
    const me = state.players[m.player];
    if (m.card.effect === 'demitour') state.direction = state.direction === 1 ? -1 : 1;
    if (m.target === undefined) continue;
    const other = state.players[m.target];
    if (m.card.effect === 'troc') [me.hand, other.hand] = [other.hand, me.hand];
    if (m.card.effect === 'controle') state.blockedUntil[m.target] = state.turn + 1;
    if (m.card.effect === 'degustation') m.peek = shuffle(rng, [...other.hand]).slice(0, 3);
    if (m.card.effect === 'torchon') {
      // Coup de torchon : la Vaisselle file chez le chef visé, qui rend une carte au hasard à son ancien porteur.
      const h = vaisselleHolder(state);
      if (h !== null && h !== m.target) {
        const from = state.players[h].hand;
        const vi = from.findIndex((c) => c.kind === 'vaisselle');
        const gi = randInt(rng, other.hand.length);
        swapCards(from, vi, other.hand, gi);
        state.stats.vaisselleMoves += 1;
      }
    }
    if (m.card.effect === 'chapardeur') {
      // On vole une carte au hasard et on rend la carte choisie à l'avance (ou une au hasard si elle a disparu).
      let gi = me.hand.findIndex((c) => c.id === m.give);
      if (gi < 0) gi = me.hand.findIndex((c) => c.kind !== 'vaisselle');
      const si = randInt(rng, other.hand.length);
      m.stolen = other.hand[si];
      state.origins[m.stolen.id] = 'swap';
      swapCards(me.hand, gi, other.hand, si);
    }
  }

  events.push({ type: 'exchange', moves });
  // 5. Pioche vide après l'échange : on remélange la défausse tout de suite.
  if (state.drawPile.length === 0 && state.discard.length > 0) {
    reshuffle(state, rng);
    reshuffled = true;
  }
  if (reshuffled) events.push({ type: 'reshuffle' });

  const shown = Object.keys(state.shown).length ? Object.fromEntries(Object.entries(state.shown).map(([p, id]) => [p, cardById(id)])) : undefined;
  state.history.push({ turn: state.turn, denunciation: state.denunciation ?? undefined, moves, reshuffled, shown });
  state.choices = {};
  state.shown = {};
  state.denunciation = null;
  state.phase = 'announce';
  return events;
}

/** Menu valide d'un joueur (sans regarder s'il a le droit d'annoncer), ou null. */
export function announceableMenu(state: GameState, player: number): Menu | null {
  const p = state.players[player];
  return state.rules.mode === 'unMenu' ? evaluateOneMenu(p.hand, p.regions, p.bonus, state.event !== 'sansBaguette') : evaluateMenu(p.hand, p.regions);

}

/** Peut-on crier « À TABLE ! » ? (pas avec la Vaisselle, ni sous Contrôle sanitaire, ni deux fois). */
export function checkAnnounce(state: GameState, player: number): string | null {
  if (state.phase !== 'announce') return 'Ce n’est pas le moment d’annoncer';
  if (state.frozen.includes(player)) return 'Tu as déjà annoncé';
  if (state.players[player].hand.some((c) => c.kind === 'vaisselle')) return 'Impossible d’annoncer avec la Vaisselle';
  if ((state.blockedUntil[player] ?? 0) >= state.turn) return 'Contrôle sanitaire : pas d’annonce pour l’instant';
  if (!state.rules.blindAnnounce && !announceableMenu(state, player)) return 'Ton menu n’est pas complet';
  return null;
}

/**
 * ANNONCES « À TABLE ! » (simultanées, après l'échange), main posée face cachée.
 * - Personne : tour suivant.
 * - Première annonce : les annonceurs figent leur main ; les autres jouent le Dernier service
 *   (un dernier tour d'échange en sautant les mains figées), puis peuvent annoncer à leur tour.
 * - Révélation : les mains non valides (bluffs ratés) perdent une étoile et prennent la Vaisselle.
 *   Le meilleur menu gagne ; à égalité, les premiers annonceurs passent devant ceux du Dernier
 *   service, puis le plus proche du porteur de la Vaisselle dans le sens du jeu.
 *   Si aucune main n'est valide, la manche continue.
 */
export function resolveAnnouncements(state: GameState, announcers: number[], rng: Rng): GameEvent[] {
  if (state.phase !== 'announce') throw new Error('Ce n’est pas le moment d’annoncer');
  const unique = [...new Set(announcers)].sort((a, b) => a - b);
  for (const a of unique) {
    const err = checkAnnounce(state, a);
    if (err) throw new Error(`${state.players[a].name} : ${err}`);
  }

  if (!state.lastService) {
    if (unique.length === 0) {
      if (state.turn >= state.maxTurns) return finishRound(state, [], null, null, 'none', [], []);
      state.turn += 1;
      state.phase = 'choose';
      return [{ type: 'noAnnounce' }];
    }
    state.frozen = unique;
    if (state.rules.lastService && activePlayers(state).length >= (state.rules.split ? 1 : 2)) {
      // Dernier service pour les autres.
      state.lastService = true;
      state.turn += 1;
      state.phase = 'choose';
      return [{ type: 'announce', announcers: unique }, { type: 'lastService', announcers: unique }];
    }
    return [{ type: 'announce', announcers: unique }, ...reveal(state, unique, [], rng)];
  }
  const first = [...state.frozen];
  return [...(unique.length ? [{ type: 'announce' as const, announcers: unique }] : []), ...reveal(state, first, unique, rng)];
}

/** On retourne les mains posées face cachée. */
function reveal(state: GameState, first: number[], late: number[], rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  const all = [...first, ...late];
  const menus = all.map((p) => ({ p, menu: announceableMenu(state, p), late: late.includes(p) }));
  const bluffers = menus.filter((m) => !m.menu).map((m) => m.p);

  // Bluff raté : une étoile de moins et la Vaisselle (pour le premier dans l'ordre).
  // Sans annonce bluffée (v5), un menu cassé pendant le Dernier service ne rapporte rien, sans pénalité.
  if (!state.rules.blindAnnounce) bluffers.length = 0;
  for (const b of bluffers) state.players[b].etoiles = Math.max(0, state.players[b].etoiles - 1);
  if (bluffers.length) {
    const holder = vaisselleHolder(state);
    const b = bluffers[0];
    if (holder !== null && holder !== b) {
      const from = state.players[holder].hand;
      const to = state.players[b].hand;
      swapCards(from, from.findIndex((c) => c.kind === 'vaisselle'), to, randInt(rng, to.length));
      state.stats.vaisselleMoves += 1;
    }
    events.push({ type: 'bluff', players: bluffers });
  }

  const valid = menus.filter((m) => m.menu) as { p: number; menu: Menu; late: boolean }[];
  if (!valid.length) {
    // Personne n'avait vraiment de menu : la manche continue.
    state.frozen = [];
    state.lastService = false;
    if (state.turn >= state.maxTurns) return [...events, ...finishRound(state, all, null, null, 'none', bluffers, late)];
    state.turn += 1;
    state.phase = 'choose';
    return [...events, { type: 'noAnnounce' }];
  }
  const best = Math.max(...valid.map((m) => m.menu.rank));
  let tied = valid.filter((m) => m.menu.rank === best);
  const coWinners = state.rules.allServedStar && valid.length > 1 ? valid.map((m) => m.p) : state.rules.shareTies && tied.length > 1 ? tied.map((m) => m.p) : undefined;
  if (tied.some((m) => !m.late)) tied = tied.filter((m) => !m.late);
  let winner = tied[0];
  let tieBreak: RoundResult['tieBreak'] = 'none';
  if (tied.length > 1) {
    const holder = vaisselleHolder(state);
    const n = state.players.length;
    if (holder !== null) {
      // Distance depuis le porteur de la Vaisselle, dans le sens du jeu : la plus petite gagne.
      const dist = (p: number) => ((((p - holder) * state.direction) % n) + n) % n;
      winner = tied.reduce((a, b) => (dist(b.p) < dist(a.p) ? b : a));
      tieBreak = 'vaisselle';
    } else {
      winner = pick(rng, tied);
      tieBreak = 'hasard';
    }
  }
  return [...events, ...finishRound(state, all, winner.p, winner.menu, tieBreak, bluffers, late, coWinners)];
}

function finishRound(
  state: GameState,
  announcers: number[],
  winner: number | null,
  menu: Menu | null,
  tieBreak: RoundResult['tieBreak'],
  bluffers: number[],
  late: number[],
  coWinners?: number[],
): GameEvent[] {
  const result: RoundResult = {
    winner,
    menu,
    announcers,
    hands: Object.fromEntries(announcers.map((a) => [a, [...state.players[a].hand]])),
    regions: state.players.map((p) => [...p.regions]),
    bonus: state.players.map((p) => [...p.bonus]),
    turns: state.turn,
    tieBreak,
    thanksToMarket: winner !== null && state.players[winner].hand.some((c) => state.origins[c.id] === 'market' || state.origins[c.id] === 'choice'),
    bluffers,
    lateAnnouncers: late,
    coWinners,
  };
  state.lastRound = result;
  state.frozen = [];
  state.lastService = false;
  const events: GameEvent[] = [{ type: 'roundWon', result }];
  if (winner !== null) {
    // « Guide Michelin » : 2 étoiles pour le gagnant. Égalité partagée : une étoile pour chacun.
    const gain = state.event === 'doubleEtoile' ? 2 : 1;
    const stars = coWinners ?? [winner];
    for (const p of stars) state.players[p].etoiles += gain;
    const done = stars.filter((p) => state.players[p].etoiles >= state.etoilesToWin);
    if (done.length) {
      // Plusieurs chefs atteignent le but en même temps : le plus étoilé, sinon le gagnant de la manche.
      const top = Math.max(...done.map((p) => state.players[p].etoiles));
      const champ = done.includes(winner) && state.players[winner].etoiles === top ? winner : done.find((p) => state.players[p].etoiles === top)!;
      state.phase = 'gameOver';
      state.winner = champ;
      events.push({ type: 'gameWon', player: champ });
      return events;
    }
  }
  state.phase = 'roundOver';
  return events;
}
