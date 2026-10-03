// Règles d'« À TABLE ! » : mise en place, dénonciation, échange simultané,
// annonces, départage et victoire. Toutes les fonctions modifient l'état reçu
// (l'UI travaille sur une copie, voir cloneState) et renvoient des événements.
import { HAND_SIZE, REGIONS_PER_PLAYER } from '../config/cards';
import { ALL_REGION_IDS, buildDeck, evaluateMenu, VAISSELLE } from './deck';
import { pick, randInt, shuffle, type Rng } from './rng';
import type { Card, Choice, Denunciation, GameEvent, GameState, Menu, Move, PlayerSetup, RegionId, RoundResult, Rules } from './types';

export interface GameOptions {
  /** Toques nécessaires pour devenir Grand Chef (3 par défaut). */
  toquesToWin?: number;
  /** Au-delà de ce nombre de tours, la manche s'arrête sans gagnant (sécurité). */
  maxTurns?: number;
  /** Réglages d'équilibrage (voir Rules). */
  rules?: Partial<Rules>;
}

export const DEFAULT_RULES: Rules = { denounceLimit: 'protege', headStart: 1 };

/** Mise en place imposée d'une manche (tutoriel et tests). */
export interface RoundPreset {
  /** Les 2 régions secrètes de chaque joueur. */
  regions: RegionId[][];
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
    players: setups.map((s) => ({ ...s, hand: [], regions: [], toques: 0 })),
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
    toquesToWin: opts.toquesToWin ?? 3,
    maxTurns: opts.maxTurns ?? DEFAULT_MAX_TURNS,
    denounceBanUntil: {},
    unmasked: [],
    rules: { ...DEFAULT_RULES, ...opts.rules },
  };
  dealRound(state, rng, preset);
  return state;
}

/** Copie profonde de l'état (les cartes sont immuables, on peut les partager). */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hand: [...p.hand], regions: [...p.regions] })),
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
      p.hand = [...preset.hands[i]];
    });
    state.drawPile = [...preset.drawPile].reverse(); // le dessus est la fin du tableau
  } else {
    const secret = shuffle(rng, [...ALL_REGION_IDS]);
    state.players.forEach((p) => (p.regions = secret.splice(0, REGIONS_PER_PLAYER)));
    state.regionReserve = secret;

    const deck = shuffle(rng, buildDeck(ALL_REGION_IDS).filter((c) => c.kind !== 'vaisselle'));
    const unlucky = randInt(rng, n); // celui qui reçoit la Vaisselle
    // Coup de pouce éventuel : quelques cartes de ses propres régions dès le départ
    // (mises de côté pour tout le monde avant la donne au hasard).
    const boosts = state.players.map((p) => p.regions.flatMap((r) => deck.filter((c) => c.kind === 'dish' && c.region === r).slice(0, state.rules.headStart)));
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

/** Passe à la manche suivante (après un écran de fin de manche). */
export function nextRound(state: GameState, rng: Rng): GameEvent[] {
  if (state.phase !== 'roundOver') throw new Error('La manche n’est pas terminée');
  state.roundNumber += 1;
  dealRound(state, rng);
  return [{ type: 'roundStart', round: state.roundNumber }];
}

/** Voisin de gauche : celui qui reçoit nos cartes. */
export const leftOf = (state: GameState, p: number) => (p + 1) % state.players.length;
/** Voisin de droite : celui qui nous passe ses cartes. */
export const rightOf = (state: GameState, p: number) => (p + state.players.length - 1) % state.players.length;

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
  if (state.phase !== 'choose') return 'On ne peut dénoncer qu’avant de choisir sa carte';
  if (state.denunciation) return 'Il y a déjà eu une dénonciation ce tour-ci';
  if (vaisselleHolder(state) !== accuser) return 'Il faut avoir la Vaisselle pour dénoncer';
  if ((state.denounceBanUntil[accuser] ?? 0) > state.turn) return 'Après une fausse accusation, il faut attendre un tour';
  if (state.rules.denounceLimit === 'unique' && state.history.some((h) => h.denunciation?.accuser === accuser))
    return 'Tu as déjà dénoncé quelqu’un cette manche';
  return null;
}

/**
 * DÉNONCIATION : « Je te démasque : Alsace ! » — réservée au porteur de la Vaisselle.
 * - Juste (c'est une des 2 régions de l'accusé) : l'accusé reçoit la Vaisselle. Il défausse
 *   la carte Région démasquée et en pioche une nouvelle dans la réserve (les régions non
 *   distribuées), puis l'ancienne y retourne. Ce que les autres ont appris ne sert donc
 *   plus à rien : impossible de le bloquer en ne lui passant jamais ses cartes.
 * - Fausse : l'accusateur garde la Vaisselle et ne peut pas dénoncer au tour suivant.
 * Pour garder 8 cartes chacun, l'accusé rend en échange de la Vaisselle une carte tirée
 * au hasard (ou `swapCardId`, utilisé par le tutoriel).
 * Les choix déjà faits ce tour-ci sont annulés (les mains ont pu changer).
 */
export function denounce(state: GameState, accuser: number, target: number, region: RegionId, rng: Rng, swapCardId?: string): GameEvent[] {
  const err = checkDenounce(state, accuser);
  if (err) throw new Error(err);
  if (accuser === target || !state.players[target]) throw new Error('Accusation impossible');
  if (state.rules.denounceLimit === 'protege' && state.unmasked.includes(target)) throw new Error(`${state.players[target].name} a déjà été démasqué : il est protégé jusqu’à la fin de la manche`);
  if (!state.regionsInPlay.includes(region)) throw new Error('Cette région n’est pas en jeu');

  const p = state.players[target];
  const correct = p.regions.includes(region);
  let vaisselleTo: number | null = null;
  let vaisselleFrom: number | null = null;

  if (correct) {
    // La Vaisselle passe à l'accusé, qui rend une carte à la place.
    const from = state.players[accuser];
    const vIndex = from.hand.findIndex((c) => c.kind === 'vaisselle');
    let gIndex = swapCardId ? p.hand.findIndex((c) => c.id === swapCardId) : -1;
    if (gIndex < 0) gIndex = randInt(rng, p.hand.length);
    const given = p.hand[gIndex];
    p.hand[gIndex] = from.hand[vIndex];
    from.hand[vIndex] = given;
    state.origins[VAISSELLE.id] = 'swap';
    state.origins[given.id] = 'swap';
    state.stats.vaisselleMoves += 1;
    vaisselleTo = target;
    vaisselleFrom = accuser;

    // Anti-jeu : la région démasquée est remplacée par une région de la réserve.
    const fresh = pick(rng, state.regionReserve);
    state.regionReserve = [...state.regionReserve.filter((r) => r !== fresh), region];
    p.regions = p.regions.map((r) => (r === region ? fresh : r));
    state.unmasked.push(target);
    state.stats.correctDenunciations += 1;
  } else {
    state.denounceBanUntil[accuser] = state.turn + 2;
  }
  state.stats.denunciations += 1;
  state.choices = {};
  const d: Denunciation = { accuser, target, region, correct, vaisselleTo, vaisselleFrom };
  state.denunciation = d;
  return [{ type: 'denounce', denunciation: d }];
}

/** Vérifie qu'un choix est autorisé (renvoie un message d'erreur, ou null). */
export function checkChoice(state: GameState, player: number, choice: Choice): string | null {
  if (state.phase !== 'choose') return 'Ce n’est pas le moment de choisir';
  const card = state.players[player]?.hand.find((c) => c.id === choice.cardId);
  if (!card) return 'Cette carte n’est pas dans ta main';
  if (choice.mode === 'market' && card.kind === 'vaisselle') return 'La Vaisselle ne va jamais au Marché !';
  if (choice.mode !== 'pass' && choice.mode !== 'market') return 'Action inconnue';
  return null;
}

/** CHOIX SECRET : 1 carte + « passer » ou « marché ». Un joueur peut changer d'avis tant que tout n'est pas révélé. */
export function submitChoice(state: GameState, player: number, choice: Choice): void {
  const err = checkChoice(state, player, choice);
  if (err) throw new Error(err);
  state.choices[player] = { ...choice };
}

export const allChosen = (state: GameState) => state.players.every((_, i) => state.choices[i]);

/**
 * RÉVÉLATION : tous les échanges ont lieu en même temps.
 * - Passer : la carte va au voisin de gauche.
 * - Marché : la carte va face visible à la défausse, le voisin de gauche reçoit
 *   la carte du dessus de la pioche (remélange de la défausse si la pioche est vide).
 * Chaque carte reçue prend la place de la carte donnée : tout le monde garde 8 cartes.
 */
export function resolveExchange(state: GameState, rng: Rng): GameEvent[] {
  if (state.phase !== 'choose') throw new Error('Pas d’échange en cours');
  if (!allChosen(state)) throw new Error('Tout le monde n’a pas encore choisi');
  const n = state.players.length;
  const events: GameEvent[] = [];

  // 1. Chacun retire sa carte (en mémorisant sa place dans la main).
  const slots = state.players.map((p, i) => {
    const index = p.hand.findIndex((c) => c.id === state.choices[i].cardId);
    return { index, card: p.hand[index], mode: state.choices[i].mode };
  });
  // 2. Les cartes du Marché arrivent d'abord, face visible, sur la défausse.
  slots.forEach((s) => s.mode === 'market' && state.discard.push(s.card));

  // 3. Chaque voisin de gauche reçoit sa carte, au même emplacement que celle qu'il a donnée.
  let reshuffled = false;
  const moves: Move[] = slots.map((s, i) => {
    const to = (i + 1) % n;
    const move: Move = { player: i, mode: s.mode, card: s.card, to };
    let incoming = s.card;
    if (s.mode === 'market') {
      const d = drawCard(state, rng);
      reshuffled ||= d.reshuffled;
      incoming = d.card;
      move.drawn = d.card;
      state.origins[incoming.id] = 'market';
    } else {
      state.origins[incoming.id] = 'pass';
      if (incoming.kind === 'vaisselle') state.stats.vaisselleMoves += 1;
    }
    return { move, incoming };
  }).map(({ move, incoming }) => {
    state.players[move.to].hand[slots[move.to].index] = incoming;
    return move;
  });

  events.push({ type: 'exchange', moves });
  // 4. Pioche vide après l'échange : on remélange la défausse tout de suite.
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

/** Menu d'un joueur s'il a le droit d'annoncer (pas de Vaisselle en main), sinon null. */
export function announceableMenu(state: GameState, player: number): Menu | null {
  const p = state.players[player];
  return evaluateMenu(p.hand, p.regions);
}

/**
 * ANNONCES « À TABLE ! » (simultanées, après l'échange).
 * Sans annonce : tour suivant. Sinon on révèle les mains : le meilleur menu gagne une Toque.
 * Égalité : le plus proche à gauche du porteur de la Vaisselle gagne (sinon, hasard).
 */
export function resolveAnnouncements(state: GameState, announcers: number[], rng: Rng): GameEvent[] {
  if (state.phase !== 'announce') throw new Error('Ce n’est pas le moment d’annoncer');
  const unique = [...new Set(announcers)].sort((a, b) => a - b);
  for (const a of unique) if (!announceableMenu(state, a)) throw new Error(`${state.players[a].name} n’a pas de menu valide`);

  if (unique.length === 0) {
    if (state.turn >= state.maxTurns) return finishRound(state, [], null, null, 'none');
    state.turn += 1;
    state.phase = 'choose';
    return [{ type: 'noAnnounce' }];
  }

  const menus = unique.map((p) => ({ p, menu: announceableMenu(state, p)! }));
  const best = Math.max(...menus.map((m) => m.menu.rank));
  const tied = menus.filter((m) => m.menu.rank === best);
  let winner = tied[0];
  let tieBreak: RoundResult['tieBreak'] = 'none';
  if (tied.length > 1) {
    const holder = vaisselleHolder(state);
    const n = state.players.length;
    if (holder !== null) {
      // Distance vers la gauche depuis le porteur de la Vaisselle : la plus petite gagne.
      const dist = (p: number) => (p - holder + n) % n;
      winner = tied.reduce((a, b) => (dist(b.p) < dist(a.p) ? b : a));
      tieBreak = 'vaisselle';
    } else {
      winner = pick(rng, tied);
      tieBreak = 'hasard';
    }
  }
  return [{ type: 'announce', announcers: unique }, ...finishRound(state, unique, winner.p, winner.menu, tieBreak)];
}

function finishRound(state: GameState, announcers: number[], winner: number | null, menu: Menu | null, tieBreak: RoundResult['tieBreak']): GameEvent[] {
  const result: RoundResult = {
    winner,
    menu,
    announcers,
    hands: Object.fromEntries(announcers.map((a) => [a, [...state.players[a].hand]])),
    regions: state.players.map((p) => [...p.regions]),
    turns: state.turn,
    tieBreak,
    thanksToMarket: winner !== null && state.players[winner].hand.some((c) => state.origins[c.id] === 'market'),
  };
  state.lastRound = result;
  const events: GameEvent[] = [{ type: 'roundWon', result }];
  if (winner !== null) {
    const w = state.players[winner];
    w.toques += 1;
    if (w.toques >= state.toquesToWin) {
      state.phase = 'gameOver';
      state.winner = winner;
      events.push({ type: 'gameWon', player: winner });
      return events;
    }
  }
  state.phase = 'roundOver';
  return events;
}
