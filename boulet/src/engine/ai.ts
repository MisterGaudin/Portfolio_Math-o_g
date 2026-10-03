// Intelligence artificielle des ordinateurs (3 niveaux).
// L'IA ne lit que l'information publique (défausse, nombre de cartes, historique)
// et sa propre main : elle ne triche pas.
import { cardPoints, createDeck, isBoulet } from './deck';
import { bouletHolder, legalPlays, playerAt, type PlayOption } from './game';
import { pick, type Rng } from './rng';
import { COLORS, type Action, type Card, type Color, type Difficulty, type GameState } from './types';

/** Choisit l'action du joueur courant (ou du gagnant pendant l'échange). */
export function chooseAction(state: GameState, rng: Rng): Action {
  const me = state.current;
  const level = state.players[me].difficulty;

  if (state.phase === 'exchange') return { type: 'exchange', cardIds: chooseExchange(state, me, level, rng) };

  const options = legalPlays(state);
  if (options.length === 0) return state.phase === 'afterDraw' ? { type: 'pass' } : { type: 'draw' };

  if (level === 'facile') {
    // Facile : un coup jouable au hasard ; s'il tombe sur un double, il refile le Boulet au hasard.
    const opt = pick(rng, options);
    return toAction(state, opt, randomColor(rng), opt.canGiveBoulet ? randomOpponent(state, me, rng) : undefined);
  }

  const ctx = buildContext(state, me, level);
  let best: { opt: PlayOption; score: number; color: Color; gift?: number } | null = null;
  for (const opt of options) {
    const color = opt.needsColor ? jokerColor(ctx, opt, level, rng) : lastColor(state, opt);
    const gift = opt.canGiveBoulet ? bouletTarget(ctx, level, rng) : undefined;
    const score = scoreOption(ctx, opt, color, gift !== undefined);
    if (!best || score > best.score) best = { opt, score, color, gift };
  }
  const chosen = best!;

  // Garder ses Jokers pour la fin : plutôt piocher que gâcher un Joker trop tôt.
  if (chosen.score < -15 && state.phase === 'play') return { type: 'draw' };
  if (chosen.score < -15 && state.phase === 'afterDraw') return { type: 'pass' };
  return toAction(state, chosen.opt, chosen.color, chosen.gift);
}

/* ------------------------------------------------------------------ */

interface Context {
  state: GameState;
  me: number;
  level: Difficulty;
  hand: Card[];
  hasBoulet: boolean;
  /** Nombre de cartes de chaque adversaire. */
  counts: number[];
  /** Adversaire ayant le moins de cartes. */
  closest: number;
  /** Couleurs qu'on sait absentes chez chaque joueur (niveau difficile). */
  lacks: Set<Color>[];
  /** Cartes encore inconnues par couleur (ni dans la défausse ni dans ma main). */
  unseen: Record<Color, number>;
}

function buildContext(state: GameState, me: number, level: Difficulty): Context {
  const hand = state.players[me].hand;
  const counts = state.players.map((p) => p.hand.length);
  let closest = -1;
  counts.forEach((c, i) => {
    if (i !== me && (closest === -1 || c < counts[closest])) closest = i;
  });
  const lacks = state.players.map(() => new Set<Color>());
  const unseen: Record<Color, number> = { rouge: 0, bleu: 0, vert: 0, jaune: 0 };

  if (level === 'difficile') {
    // Suivi des cartes : tout ce qui n'est ni dans la défausse ni dans ma main est « inconnu ».
    const known = new Set([...state.discard, ...hand].map((c) => c.id));
    for (const c of createDeck()) if (c.color && !known.has(c.id)) unseen[c.color] += 1;
    // Un joueur qui pioche sans rejouer face à une couleur ne l'a pas.
    const h = state.history;
    for (let i = 0; i < h.length; i++) {
      const e = h[i];
      if (e.type === 'draw' && e.reason === 'normal' && h[i + 1]?.type === 'pass') lacks[e.player].add(e.facingColor);
      else if (e.type === 'draw' && e.reason === 'plus2') lacks[e.player].clear();
      else if (e.type === 'exchange') lacks[e.to].clear();
    }
  }
  return { state, me, level, hand, hasBoulet: hand.some(isBoulet), counts, closest, lacks, unseen };
}

function scoreOption(ctx: Context, opt: PlayOption, color: Color, gives: boolean): number {
  const { state, me, hand, counts, level } = ctx;
  const cards = opt.cardIds.map((id) => hand.find((c) => c.id === id)!);
  const last = cards[cards.length - 1];
  const n = state.players.length;
  const left = hand.length - cards.length - (gives ? 1 : 0);
  if (left === 0) return 1000; // victoire immédiate

  let s = 0;
  // Se débarrasser des cartes qui coûtent cher en points.
  s += cards.reduce((sum, c) => sum + cardPoints(c), 0) / 5;
  // Les doubles vident la main deux fois plus vite…
  if (cards.length === 2) s += 6;
  // … et sont prioritaires quand on a le Boulet (seul moyen de s'en débarrasser).
  if (gives) s += 40;

  // Garder ses Jokers pour la fin.
  const normalLeft = hand.filter((c) => !isBoulet(c)).length;
  if (last.kind === 'joker' && normalLeft > 3) s -= 40;

  // Les +2 et Passe visent le joueur qui a le moins de cartes.
  const next = playerAt(state, me, 1);
  if (last.kind === 'plus2' || last.kind === 'skip' || (last.kind === 'reverse' && n === 2)) {
    s += next === ctx.closest || counts[next] <= 3 ? 15 : -6;
  } else if (last.kind === 'reverse') {
    const prev = playerAt(state, me, -1);
    s += counts[prev] > counts[next] ? 8 : -4;
  }

  // Rester souple : garder des cartes de la nouvelle couleur active.
  const after = hand.filter((c) => !opt.cardIds.includes(c.id));
  s += after.filter((c) => c.color === color).length * 2;

  if (level === 'difficile') {
    // Le joueur qui jouera après ce coup (tient compte des Passe / +2).
    const hitsNext = last.kind === 'plus2' || last.kind === 'skip' || (last.kind === 'reverse' && n === 2);
    const target = hitsNext ? playerAt(state, me, 1 + Math.min(cards.length, n - 1)) : next;
    if (target !== me) {
      if (ctx.lacks[target].has(color)) s += counts[target] <= 4 ? 12 : 4;
      // Ne jamais terminer un double qui laisserait le suivant gagner facilement.
      if (counts[target] <= 2 && !ctx.lacks[target].has(color)) s -= cards.length === 2 ? 30 : 10;
    }
    // Une couleur rare chez les autres est plus difficile à suivre.
    s -= ctx.unseen[color] / 6;
  }
  return s;
}

/** Couleur de Joker : au hasard (moyen) ou selon la main (difficile). */
function jokerColor(ctx: Context, opt: PlayOption, level: Difficulty, rng: Rng): Color {
  if (level !== 'difficile') return randomColor(rng);
  const after = ctx.hand.filter((c) => !opt.cardIds.includes(c.id));
  const next = playerAt(ctx.state, ctx.me, 1);
  let best: Color = COLORS[0];
  let bestScore = -Infinity;
  for (const color of COLORS) {
    let s = after.filter((c) => c.color === color).length * 10;
    if (ctx.lacks[next].has(color)) s += 5;
    s -= ctx.unseen[color] / 10;
    if (s > bestScore) [best, bestScore] = [color, s];
  }
  return best;
}

/** À qui refiler le Boulet ? (moyen : au hasard, difficile : au plus proche de finir). */
function bouletTarget(ctx: Context, level: Difficulty, rng: Rng): number {
  if (level === 'difficile') return ctx.closest;
  return randomOpponent(ctx.state, ctx.me, rng);
}

/** Échange : rendre 2 cartes au Boulet officiel. */
function chooseExchange(state: GameState, me: number, level: Difficulty, rng: Rng): number[] {
  const hand = [...state.players[me].hand];
  if (level === 'facile') {
    const a = pick(rng, hand);
    const b = pick(rng, hand.filter((c) => c.id !== a.id));
    return [a.id, b.id];
  }
  // On rend les gros chiffres (chers en points, sans pouvoir) et on garde Jokers et actions.
  const utility = (c: Card) => (c.kind === 'number' ? -(c.value ?? 0) : c.kind === 'joker' ? 100 : 50);
  return hand.sort((a, b) => utility(a) - utility(b)).slice(0, 2).map((c) => c.id);
}

/* ------------------------------------------------------------------ */

function toAction(state: GameState, opt: PlayOption, color: Color, gift?: number): Action {
  const action: Action = { type: 'play', cardIds: opt.cardIds };
  if (opt.needsColor) action.chosenColor = color;
  if (gift !== undefined && opt.canGiveBoulet && bouletHolder(state) === state.current) action.giveBouletTo = gift;
  return action;
}

function lastColor(state: GameState, opt: PlayOption): Color {
  const id = opt.cardIds[opt.cardIds.length - 1];
  return state.players[state.current].hand.find((c) => c.id === id)!.color!;
}

function randomColor(rng: Rng): Color {
  return pick(rng, COLORS);
}

function randomOpponent(state: GameState, me: number, rng: Rng): number {
  return pick(rng, state.players.map((_, i) => i).filter((i) => i !== me));
}
