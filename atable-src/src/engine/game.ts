// Règles d'« À TABLE ! » : mise en place, dénonciation, échange simultané,
// annonces, départage et victoire. Toutes les fonctions modifient l'état reçu
// (l'UI travaille sur une copie, voir cloneState) et renvoient des événements.
import { ALL_REGION_IDS, buildDeck, evaluateMenu, VAISSELLE } from './deck';
import { pick, randInt, shuffle, type Rng } from './rng';
import type { Card, Choice, Denunciation, GameEvent, GameState, Menu, MenuDuJourRule, Move, PlayerSetup, RegionId, RoundResult } from './types';

export interface GameOptions {
  /** Toques nécessaires pour devenir Grand Chef (3 par défaut). */
  toquesToWin?: number;
  /** Au-delà de ce nombre de tours, la manche s'arrête sans gagnant (sécurité). */
  maxTurns?: number;
  /** Variante d'équilibrage du Menu du Jour (règle officielle : 'standard'). */
  menuDuJour?: MenuDuJourRule;
}

/** Mise en place imposée d'une manche (tutoriel et tests). */
export interface RoundPreset {
  regionsInPlay: RegionId[];
  /** Région secrète de chaque joueur. */
  regions: RegionId[];
  /** Mains de départ (4 cartes chacune). */
  hands: Card[][];
  /** Pioche : la PREMIÈRE carte du tableau est le dessus de la pioche. */
  drawPile: Card[];
}

export const DEFAULT_MAX_TURNS = 60;

/** Crée une partie et distribue la première manche. 2 à 4 joueurs. */
export function createGame(setups: PlayerSetup[], rng: Rng, opts: GameOptions = {}, preset?: RoundPreset): GameState {
  if (setups.length < 2 || setups.length > 4) throw new Error('Il faut 2 à 4 joueurs');
  const state: GameState = {
    players: setups.map((s) => ({ ...s, hand: [], region: '', toques: 0 })),
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
    menuDuJour: opts.menuDuJour ?? 'standard',
  };
  dealRound(state, rng, preset);
  return state;
}

/** Copie profonde de l'état (les cartes sont immuables, on peut les partager). */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hand: [...p.hand] })),
    regionsInPlay: [...s.regionsInPlay],
    regionReserve: [...s.regionReserve],
    drawPile: [...s.drawPile],
    discard: [...s.discard],
    choices: { ...s.choices },
    history: [...s.history],
    origins: { ...s.origins },
    stats: { ...s.stats },
  };
}

/**
 * Distribue une manche :
 * 1. régions en jeu = nombre de joueurs + 2 leurres, au hasard ;
 * 2. une carte Région secrète par joueur, le reste forme la réserve ;
 * 3. 4 cartes par joueur, la Vaisselle TOUJOURS dans une main au hasard ;
 * 4. le reste forme la pioche, la défausse est vide.
 */
export function dealRound(state: GameState, rng: Rng, preset?: RoundPreset): void {
  const n = state.players.length;
  state.choices = {};
  state.denunciation = null;
  state.history = [];
  state.origins = {};
  state.discard = [];
  state.turn = 1;
  state.phase = 'choose';
  state.lastRound = null;
  state.stats = { vaisselleMoves: 0, denunciations: 0, correctDenunciations: 0, reshuffles: 0 };

  if (preset) {
    state.regionsInPlay = [...preset.regionsInPlay];
    state.regionReserve = preset.regionsInPlay.filter((r) => !preset.regions.includes(r));
    state.players.forEach((p, i) => {
      p.region = preset.regions[i];
      p.hand = [...preset.hands[i]];
    });
    state.drawPile = [...preset.drawPile].reverse(); // le dessus est la fin du tableau
  } else {
    state.regionsInPlay = shuffle(rng, [...ALL_REGION_IDS]).slice(0, n + 2);
    const secret = shuffle(rng, [...state.regionsInPlay]);
    state.players.forEach((p, i) => (p.region = secret[i]));
    state.regionReserve = secret.slice(n);

    const deck = shuffle(rng, buildDeck(state.regionsInPlay).filter((c) => c.kind !== 'vaisselle'));
    const unlucky = randInt(rng, n); // celui qui reçoit la Vaisselle
    state.players.forEach((p, i) => {
      p.hand = deck.splice(0, i === unlucky ? 3 : 4);
      if (i === unlucky) p.hand.splice(randInt(rng, 4), 0, VAISSELLE);
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
 * DÉNONCIATION : « Je te démasque : Alsace ! » (une seule par tour, avant les choix).
 * - Juste : l'accusé reçoit la Vaisselle, défausse sa carte Région et en pioche une
 *   nouvelle dans la réserve (l'ancienne retourne dans la réserve).
 * - Fausse : l'accusateur reçoit la Vaisselle.
 * Pour garder 4 cartes chacun, celui qui reçoit la Vaisselle rend en échange une
 * carte tirée au hasard (ou `swapCardId`, utilisé par le tutoriel) à son ancien porteur.
 * Les choix déjà faits ce tour-ci sont annulés (les mains ont pu changer).
 */
export function denounce(state: GameState, accuser: number, target: number, region: RegionId, rng: Rng, swapCardId?: string): GameEvent[] {
  if (state.phase !== 'choose') throw new Error('On ne peut dénoncer qu’avant de choisir sa carte');
  if (state.denunciation) throw new Error('Il y a déjà eu une dénonciation ce tour-ci');
  if (accuser === target || !state.players[accuser] || !state.players[target]) throw new Error('Accusation impossible');
  if (!state.regionsInPlay.includes(region)) throw new Error('Cette région n’est pas en jeu');

  const correct = state.players[target].region === region;
  const receiver = correct ? target : accuser;
  const holder = vaisselleHolder(state);
  let vaisselleTo: number | null = null;
  let vaisselleFrom: number | null = null;

  if (holder !== null && holder !== receiver) {
    const from = state.players[holder];
    const to = state.players[receiver];
    const vIndex = from.hand.findIndex((c) => c.kind === 'vaisselle');
    let gIndex = swapCardId ? to.hand.findIndex((c) => c.id === swapCardId) : -1;
    if (gIndex < 0) gIndex = randInt(rng, to.hand.length);
    const given = to.hand[gIndex];
    // Échange en place : la Vaisselle prend la place de la carte rendue.
    to.hand[gIndex] = from.hand[vIndex];
    from.hand[vIndex] = given;
    state.origins[VAISSELLE.id] = 'swap';
    state.origins[given.id] = 'swap';
    state.stats.vaisselleMoves += 1;
    vaisselleTo = receiver;
    vaisselleFrom = holder;
  }

  if (correct) {
    // L'accusé change de région : il en pioche une nouvelle, puis remet l'ancienne.
    const p = state.players[target];
    const fresh = pick(rng, state.regionReserve);
    state.regionReserve = [...state.regionReserve.filter((r) => r !== fresh), p.region];
    p.region = fresh;
    state.stats.correctDenunciations += 1;
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
 * Chaque carte reçue prend la place de la carte donnée : tout le monde garde 4 cartes.
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
  return evaluateMenu(p.hand, p.region, state.menuDuJour);
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
    regions: state.players.map((p) => p.region),
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
