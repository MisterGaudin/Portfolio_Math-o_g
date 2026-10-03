// Moteur de règles de BOULET ! : déroulement d'une manche, coups légaux,
// effets des cartes, scoring et échange entre les manches.
//
// Convention : les fonctions `apply*` MODIFIENT l'état reçu (pour la vitesse des
// simulations). L'UI travaille sur une copie obtenue avec `cloneState`.
import { BOULET_ID, cardPoints, createDeck, handPoints, isBoulet, rankKey } from './deck';
import { randInt, shuffle, type Rng } from './rng';
import type { Action, Card, Color, GameConfig, GameEvent, GameState, PlayerInfo } from './types';

export class IllegalMoveError extends Error {}

export const DEFAULT_CONFIG = { targetScore: 300, handSize: 7 };

/* ------------------------------------------------------------------ */
/* Création de la partie et des manches                                */
/* ------------------------------------------------------------------ */

export function createGame(
  players: PlayerInfo[],
  rng: Rng,
  options: Partial<Omit<GameConfig, 'players'>> = {},
): GameState {
  if (players.length < 2 || players.length > 4) throw new Error('2 à 4 joueurs');
  const config: GameConfig = { ...DEFAULT_CONFIG, ...options, players };
  const state: GameState = {
    config,
    players: players.map((p) => ({ ...p, hand: [] })),
    drawPile: [],
    discard: [],
    activeColor: 'rouge',
    direction: 1,
    current: 0,
    phase: 'play',
    drawnCardId: null,
    roundNumber: 0,
    starter: 0,
    officialBoulet: null,
    scores: players.map(() => 0),
    turnCount: 0,
    bouletPasses: 0,
    history: [],
    results: [],
    pendingExchange: null,
  };
  startRound(state, rng);
  return state;
}

/** Copie profonde de l'état (l'UI ne modifie jamais l'état affiché). */
export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

/**
 * Démarre une nouvelle manche : distribution, gestion du Boulet officiel et
 * de l'échange « style Président ». Si un échange est nécessaire, la manche
 * reste en phase `exchange` jusqu'à ce que le gagnant rende ses 2 cartes.
 */
function startRound(state: GameState, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  const n = state.players.length;
  const previous = state.results[state.results.length - 1];
  const official = previous ? previous.bouletHolder : null;

  state.roundNumber += 1;
  state.direction = 1;
  state.turnCount = 0;
  state.bouletPasses = 0;
  state.history = [];
  state.discard = [];
  state.drawnCardId = null;
  state.pendingExchange = null;
  state.officialBoulet = official;

  const all = createDeck();
  const boulet = all.find(isBoulet)!;
  const pile = shuffle(rng, all.filter((c) => !isBoulet(c)));
  for (const p of state.players) p.hand = pile.splice(0, state.config.handSize);

  if (official === null) {
    // Manche 1, ou Boulet resté dans la pioche : on le remélange dans la pioche.
    pile.splice(randInt(rng, pile.length + 1), 0, boulet);
    state.drawPile = pile;
    state.starter = randInt(rng, n);
    state.current = state.starter;
    flipStartCard(state, rng);
    state.phase = 'play';
    return events;
  }

  // Le Boulet officiel commence avec le Boulet en plus de ses 7 cartes.
  state.drawPile = pile;
  flipStartCard(state, rng);
  state.players[official].hand.push(boulet);
  state.starter = official;

  // Il donne automatiquement ses 2 cartes les plus fortes (en points) au gagnant.
  const winner = previous.winner;
  const given = strongestCards(state.players[official].hand, 2);
  moveCards(state, official, winner, given.map((c) => c.id));
  events.push({ type: 'exchange', from: official, to: winner, cards: given });
  state.history.push(...events);

  // Le gagnant doit maintenant lui rendre 2 cartes de son choix.
  state.pendingExchange = { official, winner, received: given };
  state.phase = 'exchange';
  state.current = winner;
  return events;
}

/** Les `count` cartes de plus forte valeur en points (hors Boulet). */
export function strongestCards(hand: readonly Card[], count: number): Card[] {
  return [...hand]
    .filter((c) => !isBoulet(c))
    .sort((a, b) => cardPoints(b) - cardPoints(a) || a.id - b.id)
    .slice(0, count);
}

/** Retourne la première carte de la défausse (jamais le Boulet ni un Joker). */
function flipStartCard(state: GameState, rng: Rng) {
  for (;;) {
    const card = state.drawPile.shift()!;
    if (card.kind === 'boulet' || card.kind === 'joker') {
      // On la remet dans la pioche et on en retourne une autre.
      state.drawPile.splice(randInt(rng, state.drawPile.length + 1), 0, card);
      continue;
    }
    state.discard.push(card);
    state.activeColor = card.color!;
    return;
  }
}

/** Manche suivante (après l'écran de fin de manche). */
export function nextRound(state: GameState, rng: Rng): GameEvent[] {
  if (state.phase !== 'roundOver') throw new IllegalMoveError('La manche n’est pas terminée');
  return startRound(state, rng);
}

/* ------------------------------------------------------------------ */
/* Lecture de l'état                                                   */
/* ------------------------------------------------------------------ */

export function topCard(state: GameState): Card {
  return state.discard[state.discard.length - 1];
}

/** Une carte peut-elle être posée sur la défausse ? */
export function canPlayOn(card: Card, top: Card, activeColor: Color): boolean {
  if (card.kind === 'boulet') return false;
  if (card.kind === 'joker') return true;
  return card.color === activeColor || rankKey(card) === rankKey(top);
}

export function isPlayable(state: GameState, card: Card): boolean {
  return canPlayOn(card, topCard(state), state.activeColor);
}

export function bouletHolder(state: GameState): number | null {
  const i = state.players.findIndex((p) => p.hand.some(isBoulet));
  return i === -1 ? null : i;
}

/** Index du joueur situé `steps` places plus loin dans le sens du jeu. */
export function playerAt(state: GameState, from: number, steps: number): number {
  const n = state.players.length;
  return (((from + state.direction * steps) % n) + n) % n;
}

/**
 * Vérifie un coup « poser ». Renvoie un message d'erreur en français, ou null
 * si le coup est légal.
 */
export function checkPlay(state: GameState, player: number, action: Extract<Action, { type: 'play' }>): string | null {
  if (state.phase !== 'play' && state.phase !== 'afterDraw') return 'Ce n’est pas le moment de jouer';
  if (player !== state.current) return 'Ce n’est pas ton tour';
  const hand = state.players[player].hand;
  const ids = action.cardIds;
  if (ids.length !== 1 && ids.length !== 2) return 'Pose 1 carte, ou 2 pour un double';
  if (ids.length === 2 && ids[0] === ids[1]) return 'Cartes identiques';
  if (state.phase === 'afterDraw' && (ids.length !== 1 || ids[0] !== state.drawnCardId))
    return 'Après une pioche, tu ne peux poser que la carte piochée';

  const cards = ids.map((id) => hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) return 'Carte absente de ta main';
  const played = cards as Card[];
  if (played.some(isBoulet)) return 'Le Boulet ne se pose jamais sur la pile !';
  if (played.length === 2 && rankKey(played[0]) !== rankKey(played[1]))
    return 'Un double, c’est 2 cartes de même valeur';
  if (!isPlayable(state, played[0])) return 'Cette carte ne va pas sur la pile';
  if (played[played.length - 1].kind === 'joker' && !action.chosenColor) return 'Choisis une couleur pour le Joker';

  const hasBoulet = hand.some(isBoulet);
  if (action.giveBouletTo !== undefined) {
    if (played.length !== 2) return 'On ne donne le Boulet qu’en posant un double';
    if (!hasBoulet) return 'Tu n’as pas le Boulet';
    const t = action.giveBouletTo;
    if (t === player || t < 0 || t >= state.players.length) return 'Destinataire du Boulet invalide';
  }

  // Interdiction de finir avec le Boulet : il ne doit pas rester seul en main.
  const remaining = hand.length - played.length - (action.giveBouletTo !== undefined ? 1 : 0);
  if (hasBoulet && action.giveBouletTo === undefined && remaining === 1)
    return 'Tu ne peux pas finir avec le Boulet en main : pioche !';
  return null;
}

/** Un coup « poser » candidat (la couleur du Joker est choisie ensuite). */
export interface PlayOption {
  cardIds: number[];
  /** Vrai si la dernière carte est un Joker (il faudra choisir une couleur). */
  needsColor: boolean;
  /** Vrai si ce double peut s'accompagner du don du Boulet. */
  canGiveBoulet: boolean;
  /** Vrai si le coup n'est légal QU'en donnant le Boulet (dernières cartes). */
  mustGiveBoulet: boolean;
}

/** Tous les coups « poser » légaux du joueur courant. */
export function legalPlays(state: GameState): PlayOption[] {
  const player = state.current;
  const hand = state.players[player].hand;
  const options: PlayOption[] = [];
  const hasBoulet = hand.some(isBoulet);
  const someOther = player === 0 ? 1 : 0;

  const tryAdd = (ids: number[]) => {
    const last = hand.find((c) => c.id === ids[ids.length - 1])!;
    const base = { type: 'play' as const, cardIds: ids, chosenColor: 'rouge' as Color };
    const plain = checkPlay(state, player, base) === null;
    const withGift = ids.length === 2 && hasBoulet && checkPlay(state, player, { ...base, giveBouletTo: someOther }) === null;
    if (plain || withGift)
      options.push({
        cardIds: ids,
        needsColor: last.kind === 'joker',
        canGiveBoulet: withGift,
        mustGiveBoulet: !plain && withGift,
      });
  };

  if (state.phase === 'afterDraw') {
    if (state.drawnCardId !== null) tryAdd([state.drawnCardId]);
    return options;
  }
  if (state.phase !== 'play') return options;

  for (const c of hand) if (isPlayable(state, c)) tryAdd([c.id]);
  for (const a of hand) {
    if (!isPlayable(state, a)) continue;
    for (const b of hand) if (a.id !== b.id && !isBoulet(b) && rankKey(a) === rankKey(b)) tryAdd([a.id, b.id]);
  }
  return options;
}

/* ------------------------------------------------------------------ */
/* Application des coups                                               */
/* ------------------------------------------------------------------ */

/**
 * Applique l'action du joueur `player` et renvoie les événements produits.
 * Lève IllegalMoveError si le coup est interdit.
 */
export function applyAction(state: GameState, player: number, action: Action, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  switch (action.type) {
    case 'play': {
      const err = checkPlay(state, player, action);
      if (err) throw new IllegalMoveError(err);
      doPlay(state, player, action, rng, events);
      break;
    }
    case 'draw': {
      if (state.phase !== 'play' || player !== state.current) throw new IllegalMoveError('Tu ne peux pas piocher maintenant');
      doDraw(state, player, rng, events);
      break;
    }
    case 'pass': {
      if (state.phase !== 'afterDraw' || player !== state.current)
        throw new IllegalMoveError('Tu ne peux passer qu’après avoir pioché');
      events.push({ type: 'pass', player });
      endTurn(state, playerAt(state, player, 1));
      break;
    }
    case 'exchange': {
      doExchange(state, player, action.cardIds, events);
      break;
    }
  }
  state.history.push(...events);
  return events;
}

function doPlay(state: GameState, player: number, action: Extract<Action, { type: 'play' }>, rng: Rng, events: GameEvent[]) {
  const p = state.players[player];
  const cards = action.cardIds.map((id) => p.hand.find((c) => c.id === id)!);
  p.hand = p.hand.filter((c) => !action.cardIds.includes(c.id));
  state.discard.push(...cards);
  const last = cards[cards.length - 1];
  // La couleur de la dernière carte posée (ou celle choisie pour un Joker) devient active.
  state.activeColor = last.kind === 'joker' ? action.chosenColor! : last.color!;
  state.drawnCardId = null;
  events.push({ type: 'play', player, cards, color: state.activeColor });

  if (action.giveBouletTo !== undefined) {
    moveCards(state, player, action.giveBouletTo, [BOULET_ID]);
    state.bouletPasses += 1;
    events.push({ type: 'boulet', from: player, to: action.giveBouletTo });
  }

  // Fin de manche immédiate : les effets de la dernière carte ne s'appliquent pas.
  if (p.hand.length === 0) {
    state.turnCount += 1;
    endRound(state, player, events);
    return;
  }

  const n = state.players.length;
  const times = cards.length; // un double applique l'effet 2 fois
  let skips = 0;
  switch (last.kind) {
    case 'plus2': {
      // Le suivant pioche 2 (ou 4 pour un double) et passe son tour. Pas de cumul.
      const victim = playerAt(state, player, 1);
      drawCards(state, victim, 2 * times, 'plus2', rng, events);
      events.push({ type: 'skip', player: victim });
      skips = 1;
      break;
    }
    case 'skip':
      skips = Math.min(times, n - 1);
      break;
    case 'reverse':
      if (n === 2) {
        // À 2 joueurs, l'Inversion agit comme une Passe.
        skips = 1;
      } else {
        if (times % 2 === 1) state.direction = state.direction === 1 ? -1 : 1;
        events.push({ type: 'reverse', direction: state.direction });
      }
      break;
    default:
      break;
  }
  if (last.kind === 'skip' || (last.kind === 'reverse' && n === 2)) {
    for (let k = 1; k <= skips; k++) events.push({ type: 'skip', player: playerAt(state, player, k) });
  }
  endTurn(state, playerAt(state, player, 1 + skips));
}

function doDraw(state: GameState, player: number, rng: Rng, events: GameEvent[]) {
  const before = state.players[player].hand.length;
  drawCards(state, player, 1, 'normal', rng, events);
  const hand = state.players[player].hand;
  if (hand.length === before) {
    // Pioche et défausse épuisées : on ne peut rien faire, le tour passe.
    events.push({ type: 'pass', player });
    endTurn(state, playerAt(state, player, 1));
    return;
  }
  const drawn = hand[hand.length - 1];
  state.phase = 'afterDraw';
  state.drawnCardId = drawn.id;
  if (legalPlays(state).length === 0) {
    // Carte injouable (ou interdite à cause du Boulet) : le tour s'arrête.
    events.push({ type: 'pass', player });
    endTurn(state, playerAt(state, player, 1));
  }
}

function doExchange(state: GameState, player: number, cardIds: number[], events: GameEvent[]) {
  const ex = state.pendingExchange;
  if (state.phase !== 'exchange' || !ex) throw new IllegalMoveError('Pas d’échange en cours');
  if (player !== ex.winner) throw new IllegalMoveError('C’est au gagnant de rendre les cartes');
  const hand = state.players[player].hand;
  if (cardIds.length !== 2 || cardIds[0] === cardIds[1] || !cardIds.every((id) => hand.some((c) => c.id === id)))
    throw new IllegalMoveError('Choisis 2 cartes de ta main');
  const cards = cardIds.map((id) => hand.find((c) => c.id === id)!);
  moveCards(state, player, ex.official, cardIds);
  events.push({ type: 'exchange', from: player, to: ex.official, cards });

  // L'échange est fait : le Boulet officiel ouvre la manche.
  state.pendingExchange = null;
  state.current = ex.official;
  state.phase = 'play';
}

/** Déplace des cartes d'une main à une autre. */
function moveCards(state: GameState, from: number, to: number, ids: number[]) {
  const src = state.players[from];
  const moved = src.hand.filter((c) => ids.includes(c.id));
  src.hand = src.hand.filter((c) => !ids.includes(c.id));
  state.players[to].hand.push(...moved);
}

/** Pioche une carte, en remélangeant la défausse (sauf le dessus) si besoin. */
function drawOne(state: GameState, rng: Rng, events: GameEvent[]): Card | null {
  if (state.drawPile.length === 0) {
    if (state.discard.length <= 1) return null;
    const top = state.discard.pop()!;
    const recycled = shuffle(rng, state.discard);
    state.discard = [top];
    state.drawPile = recycled;
    events.push({ type: 'reshuffle', count: recycled.length });
  }
  return state.drawPile.shift() ?? null;
}

function drawCards(state: GameState, player: number, count: number, reason: 'normal' | 'plus2', rng: Rng, events: GameEvent[]) {
  let drawn = 0;
  const facingCard = topCard(state);
  for (let i = 0; i < count; i++) {
    const c = drawOne(state, rng, events);
    if (!c) break;
    state.players[player].hand.push(c);
    drawn++;
  }
  events.push({ type: 'draw', player, count: drawn, reason, facingColor: state.activeColor, facingCard });
}

/** Termine le tour du joueur courant et donne la main à `next`. */
function endTurn(state: GameState, next: number) {
  state.turnCount += 1;
  state.current = next;
  state.phase = 'play';
  state.drawnCardId = null;
  // Sécurité : blocage total (plus aucune carte à piocher et personne ne peut jouer).
  if (state.turnCount > 3000) endRound(state, fewestCards(state), []);
}

function fewestCards(state: GameState): number {
  let best = 0;
  state.players.forEach((p, i) => {
    if (p.hand.length < state.players[best].hand.length) best = i;
  });
  return best;
}

/** Fin de manche : les perdants marquent les points des cartes restées en main. */
function endRound(state: GameState, winner: number, events: GameEvent[]) {
  const points = state.players.map((p, i) => (i === winner ? 0 : handPoints(p.hand)));
  points.forEach((pts, i) => (state.scores[i] += pts));
  state.results.push({
    roundNumber: state.roundNumber,
    winner,
    points,
    bouletHolder: bouletHolder(state),
    turns: state.turnCount,
    bouletPasses: state.bouletPasses,
    starter: state.starter,
    officialBoulet: state.officialBoulet,
  });
  events.push({ type: 'roundEnd', winner });
  state.drawnCardId = null;
  state.phase = state.scores.some((s) => s >= state.config.targetScore) ? 'gameOver' : 'roundOver';
}

/** Gagnant(s) de la partie : score le plus BAS. */
export function gameWinners(state: GameState): number[] {
  const min = Math.min(...state.scores);
  return state.scores.map((s, i) => (s === min ? i : -1)).filter((i) => i >= 0);
}
