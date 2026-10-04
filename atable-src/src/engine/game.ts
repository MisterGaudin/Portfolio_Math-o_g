// Règles d'« À TABLE ! » : mise en place, dénonciation, échange simultané,
// annonces, départage et victoire. Toutes les fonctions modifient l'état reçu
// (l'UI travaille sur une copie, voir cloneState) et renvoient des événements.
import { COURSES, DAY_EVENTS, HAND_SIZE, REGION_BY_ID, type Course } from '../config/cards';
import { ALL_REGION_IDS, buildDeck, evaluateMenu, evaluateOneMenu, VAISSELLE } from './deck';
import { pick, randInt, shuffle, type Rng } from './rng';
import type { Card, Choice, DayEvent, Denunciation, GameEvent, GameState, Menu, Move, Order, PlayerSetup, RegionId, RoundResult, Rules } from './types';

export interface GameOptions {
  /** Étoiles nécessaires pour devenir Chef 3 étoiles (3 par défaut). */
  etoilesToWin?: number;
  /** Au-delà de ce nombre de tours, la manche s'arrête sans gagnant (sécurité). */
  maxTurns?: number;
  /** Réglages d'équilibrage (voir Rules). */
  rules?: Partial<Rules>;
}

/**
 * Règles du jeu par défaut : 1 région secrète par joueur (sa carte apporte déjà un plat,
 * il en reste 3 à trouver), 2 cartes données par tour, 8 cartes en main.
 */
export const DEFAULT_RULES: Rules = {
  denounceLimit: 'protege',
  headStart: 0,
  copies: 1,
  regionCount: 0,
  passCount: 2,
  mode: 'unMenu',
  regionsPerPlayer: 1,
  regionCards: 'uniques',
  baguettes: 1,
  effects: { demitour: 2, troc: 2, chapardeur: 2, controle: 2 },
  blindAnnounce: true,
  lastService: true,
  revealToDenounce: true,
  openMarket: true,
  commande: 'plat',
  dishOfDay: true,
};
/** Règles « de base » (v3), sans les ajouts de la version 4 : utile pour comparer en simulation. */
export const BASIC_RULES: Partial<Rules> = {
  effects: { demitour: 2, troc: 2 },
  blindAnnounce: false,
  lastService: false,
  revealToDenounce: false,
  openMarket: false,
  commande: 'aucune',
  dishOfDay: false,
};
/** Ancienne version « 2 menus » (2 régions, 8 cartes à réunir, 1 carte par tour). */
export const TWO_MENUS_RULES: Partial<Rules> = { ...BASIC_RULES, mode: 'deuxMenus', regionsPerPlayer: 2, passCount: 1, effects: {} };

export const DAY_EVENT_IDS = Object.keys(DAY_EVENTS) as DayEvent[];

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

/** Crée une partie et distribue la première manche. 2 à 4 joueurs. */
export function createGame(setups: PlayerSetup[], rng: Rng, opts: GameOptions = {}, preset?: RoundPreset): GameState {
  if (setups.length < 2 || setups.length > 4) throw new Error('Il faut 2 à 4 joueurs');
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
    rules: { ...DEFAULT_RULES, ...opts.rules },
    direction: 1,
    specialPile: [],
    frozen: [],
    lastService: false,
    blockedUntil: {},
    event: 'service',
    orders: [],
  };
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
    specialPile: [...s.specialPile],
    frozen: [...s.frozen],
    blockedUntil: { ...s.blockedUntil },
    orders: [...s.orders],
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
  state.direction = 1;
  state.specialPile = [];
  state.frozen = [];
  state.lastService = false;
  state.blockedUntil = {};
  state.orders = [];
  // Carte « Plat du jour » : un événement pour toute la manche.
  state.event = state.rules.dishOfDay && !preset ? pick(rng, DAY_EVENT_IDS) : 'service';
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

    const deck = shuffle(rng, buildDeck(state.regionsInPlay, state.rules.copies, state.rules.baguettes, state.rules.effects).filter((c) => c.kind !== 'vaisselle'));
    const unlucky = randInt(rng, n); // celui qui reçoit la Vaisselle
    // Coup de pouce éventuel : quelques cartes de ses propres régions dès le départ
    // (mises de côté pour tout le monde avant la donne au hasard).
    // Tirées au hasard (et jamais le plat que représente déjà la carte Région) : prendre
    // les premières du paquet repoussait les autres vers le fond, au profit des derniers joueurs.
    const boosts = state.players.map((p) =>
      p.regions.flatMap((r, k) => shuffle(rng, deck.filter((c) => c.kind === 'dish' && c.region === r && c.course !== p.bonus[k])).slice(0, state.rules.headStart)),
    );
    for (const c of boosts.flat()) deck.splice(deck.indexOf(c), 1);
    state.players.forEach((p, i) => {
      const boost = boosts[i];
      p.hand = [...boost, ...deck.splice(0, (i === unlucky ? HAND_SIZE - 1 : HAND_SIZE) - boost.length)];
      shuffle(rng, p.hand);
      if (i === unlucky) p.hand.splice(randInt(rng, HAND_SIZE), 0, VAISSELLE);
    });
    state.drawPile = deck;
  }
  for (const p of state.players) for (const c of p.hand) state.origins[c.id] = 'deal';
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
 *   Région par une carte de la réserve, puis il est protégé jusqu'à la fin de la manche.
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
  if (state.rules.denounceLimit === 'protege' && state.unmasked.includes(target)) throw new Error(`${state.players[target].name} a déjà été démasqué : il est protégé jusqu’à la fin de la manche`);
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
    if (state.rules.mode === 'unMenu') {
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
    state.unmasked.push(target);
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
export function placeOrder(state: GameState, player: number, query: { cardId?: string; course?: Course }): GameEvent[] {
  if (state.phase !== 'choose' || state.frozen.includes(player)) throw new Error('Ce n’est pas le moment de commander');
  if (state.choices[player]) throw new Error('Commande avant de choisir tes cartes');
  const used = state.orders.filter((o) => o.player === player).length;
  if (used >= ordersAllowed(state)) throw new Error('Tu as déjà passé ta commande cette manche');
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

/** Vérifie qu'un choix est autorisé (renvoie un message d'erreur, ou null). */
export function checkChoice(state: GameState, player: number, choice: Choice): string | null {
  if (state.phase !== 'choose') return 'Ce n’est pas le moment de choisir';
  if (state.frozen.includes(player)) return 'Ta main est posée face cachée';
  const need = passCountOf(state);
  const all = [{ cardId: choice.cardId, mode: choice.mode, target: choice.target, give: choice.give }, ...(choice.extra ?? [])];
  if (all.length !== need) return `Il faut donner ${need} carte${need > 1 ? 's' : ''}`;
  if (new Set(all.map((x) => x.cardId)).size !== all.length) return 'Une même carte ne peut pas être donnée deux fois';
  const hand = state.players[player]?.hand ?? [];
  for (const x of all) {
    const card = hand.find((c) => c.id === x.cardId);
    if (!card) return 'Cette carte n’est pas dans ta main';
    if (x.mode === 'market' && card.kind === 'vaisselle') return 'La Vaisselle ne va jamais au Marché !';
    if (x.mode === 'pass' && state.event === 'fromagesBloques' && card.kind === 'dish' && card.course === 'fromage') return 'Plateau de fromages : les fromages ne se passent pas, ils vont au Marché';
    if (x.mode === 'effect') {
      if (card.kind !== 'effect') return 'Seule une carte à effet peut être jouée';
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
      return { index, card: p.hand[index], mode: x.mode, target: x.target, give: x.give };
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
        }
        move.drawn = card;
        state.origins[card.id] = 'market';
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
    if (m.card.effect === 'chapardeur') {
      // On vole une carte au hasard et on rend la carte choisie à l'avance (ou une au hasard si elle a disparu).
      let gi = me.hand.findIndex((c) => c.id === m.give);
      if (gi < 0) gi = me.hand.findIndex((c) => c.kind !== 'vaisselle');
      const si = randInt(rng, other.hand.length);
      m.stolen = other.hand[si];
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

  state.history.push({ turn: state.turn, denunciation: state.denunciation ?? undefined, moves, reshuffled });
  state.choices = {};
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
    if (state.rules.lastService && activePlayers(state).length >= 2) {
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
  return [...events, ...finishRound(state, all, winner.p, winner.menu, tieBreak, bluffers, late)];
}

function finishRound(
  state: GameState,
  announcers: number[],
  winner: number | null,
  menu: Menu | null,
  tieBreak: RoundResult['tieBreak'],
  bluffers: number[],
  late: number[],
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
    thanksToMarket: winner !== null && state.players[winner].hand.some((c) => state.origins[c.id] === 'market'),
    bluffers,
    lateAnnouncers: late,
  };
  state.lastRound = result;
  state.frozen = [];
  state.lastService = false;
  const events: GameEvent[] = [{ type: 'roundWon', result }];
  if (winner !== null) {
    const w = state.players[winner];
    // « Guide Michelin » : 2 étoiles pour le gagnant.
    w.etoiles += state.event === 'doubleEtoile' ? 2 : 1;
    if (w.etoiles >= state.etoilesToWin) {
      state.phase = 'gameOver';
      state.winner = winner;
      events.push({ type: 'gameWon', player: winner });
      return events;
    }
  }
  state.phase = 'roundOver';
  return events;
}
