// Intelligence des ordinateurs, en 3 niveaux.
// L'IA ne lit que ce qu'un vrai joueur saurait : sa main, sa région, les cartes
// reçues, la défausse (Marché) et les dénonciations publiques.
import { countRegion, evaluateMenu } from './deck';
import { leftOf } from './game';
import { pick, type Rng } from './rng';
import type { Card, Choice, DishCard, GameState, RegionId } from './types';

/** Multiplicateur appliqué à une région quand un joueur s'en débarrasse. */
const DUMP_FACTOR = 0.3;
/** Seuil de confiance au-delà duquel l'IA difficile dénonce. */
export const DENOUNCE_CONFIDENCE = 0.7;
/** Probabilité, à chaque tour, de continuer à attendre le Gastronomique. */
const PATIENCE = 0.75;
/** Après ce nombre de tours sans annonce, l'IA renouvelle ses cartes au Marché. */
const STALL_TURNS = 6;

export type Beliefs = Record<number, Record<RegionId, number>>;

/**
 * Ce que `observer` peut déduire de la région secrète des autres joueurs.
 * - un joueur qui envoie une carte au Marché (public) n'est sans doute pas de cette région ;
 * - pareil pour une carte qu'il NOUS passe ;
 * - une fausse accusation écarte la région accusée ;
 * - une accusation juste remet tout à zéro (le joueur a pioché une nouvelle région).
 * Renvoie, pour chaque autre joueur, une probabilité par région possible.
 */
export function beliefs(state: GameState, observer: number): Beliefs {
  const n = state.players.length;
  const own = state.players[observer].region;
  const out: Beliefs = {};
  for (let q = 0; q < n; q++) {
    if (q === observer) continue;
    let weights: Record<RegionId, number> = {};
    let excluded = new Set<RegionId>([own]);
    const reset = (alsoExclude?: RegionId) => {
      weights = Object.fromEntries(state.regionsInPlay.map((r) => [r, 1]));
      excluded = new Set([own, ...(alsoExclude ? [alsoExclude] : [])]);
    };
    reset();
    const denunciations = [...state.history.map((h) => ({ d: h.denunciation, moves: h.moves })), { d: state.denunciation ?? undefined, moves: [] }];
    for (const { d, moves } of denunciations) {
      if (d && d.target === q) {
        if (d.correct) reset(d.region);
        else excluded.add(d.region);
      }
      for (const m of moves) {
        if (m.player !== q || m.card.kind !== 'dish') continue;
        if (m.mode === 'market' || m.to === observer) weights[m.card.region] *= DUMP_FACTOR;
      }
    }
    const candidates = state.regionsInPlay.filter((r) => !excluded.has(r));
    const total = candidates.reduce((s, r) => s + weights[r], 0) || 1;
    out[q] = Object.fromEntries(candidates.map((r) => [r, weights[r] / total]));
  }
  return out;
}

/** Région la plus probable d'un joueur, avec sa probabilité. */
export function mostLikely(b: Record<RegionId, number>): { region: RegionId | null; p: number } {
  let region: RegionId | null = null;
  let p = 0;
  for (const [r, v] of Object.entries(b)) if (v > p) [region, p] = [r, v];
  return { region, p };
}

const isDish = (c: Card): c is DishCard => c.kind === 'dish';

/** DÉNONCIATION : seule l'IA difficile dénonce, quand sa confiance dépasse 70 %. */
export function aiDenounce(state: GameState, player: number): { target: number; region: RegionId } | null {
  const me = state.players[player];
  if (me.difficulty !== 'difficile') return null;
  const b = beliefs(state, player);
  let best: { target: number; region: RegionId; p: number } | null = null;
  for (const [q, dist] of Object.entries(b)) {
    const { region, p } = mostLikely(dist);
    if (region && p > DENOUNCE_CONFIDENCE && (!best || p > best.p)) best = { target: +q, region, p };
  }
  return best && { target: best.target, region: best.region };
}

/** CHOIX SECRET de l'ordinateur : quelle carte, et passer ou Marché. */
export function aiChoose(state: GameState, player: number, rng: Rng): Choice {
  const me = state.players[player];
  const hand = me.hand;
  const own = me.region;

  // Facile : une carte au hasard qui n'est pas de sa région, toujours passée.
  if (me.difficulty === 'facile') {
    const notMine = hand.filter((c) => !(isDish(c) && c.region === own));
    return { cardId: pick(rng, notMine.length ? notMine : hand).id, mode: 'pass' };
  }

  // Moyen et Difficile : on refile toujours la Vaisselle.
  const vaisselle = hand.find((c) => c.kind === 'vaisselle');
  if (vaisselle) return { cardId: vaisselle.id, mode: 'pass' };

  const hard = me.difficulty === 'difficile';
  const left = leftOf(state, player);
  const leftBelief = beliefs(state, player)[left] ?? {};
  const k = Object.keys(leftBelief).length || 1;
  // Une carte est « utile au voisin » tant que rien ne prouve le contraire
  // (il s'est déjà débarrassé de cette région au Marché ou en nous la passant).
  // Si la manche s'éternise, on considère que plus rien n'intéresse personne (on relance via le Marché).
  const stalled = state.turn > STALL_TURNS;
  const usefulToLeft = (c: DishCard) => !stalled && (leftBelief[c.region] ?? 0) > 0.5 / k;
  // Difficile : la région probable du voisin (nettement au-dessus de la moyenne).
  const top = mostLikely(leftBelief);
  const risky = (c: Card) => c.kind === 'baguette' || (isDish(c) && top.region === c.region && top.p > 1.2 / k);

  // Une carte « en double » (même type de plat qu'une autre carte de la main) ne peut
  // servir à aucun menu : c'est elle qu'on lâche en priorité.
  const doubles = (c: DishCard) => hand.filter((x) => x !== c && isDish(x) && x.course === c.course).length;
  const worst = (cards: DishCard[]) => {
    const max = Math.max(...cards.map(doubles));
    return pick(rng, cards.filter((c) => doubles(c) === max));
  };

  let junk = hand.filter(isDish).filter((c) => c.region !== own);
  // Difficile : bluff, on garde une carte d'une autre région pour brouiller les pistes
  // (de préférence une qui bouche un trou du menu).
  if (hard && junk.length >= 2) {
    const bluff = [...junk].sort((a, b) => doubles(a) - doubles(b) || a.id.localeCompare(b.id))[0];
    junk = junk.filter((c) => c !== bluff);
  }

  let choice: Choice;
  if (junk.length) {
    // Une carte inutile pour soi ET pour le voisin part au Marché (sinon elle ferait
    // des allers-retours) ; sinon on passe une carte inutile à gauche.
    const harmless = junk.filter((c) => !usefulToLeft(c));
    choice = harmless.length ? { cardId: worst(harmless).id, mode: 'market' } : { cardId: worst(junk).id, mode: 'pass' };
  } else {
    // Que des cartes utiles : on lâche la Baguette en premier (on vise le Gastronomique),
    // sinon une carte de sa région, en dernier recours.
    const baguette = hand.find((c) => c.kind === 'baguette');
    choice = { cardId: (baguette ?? pick(rng, hand)).id, mode: 'pass' };
  }

  // Difficile : ne jamais passer au voisin une carte qui pourrait compléter sa région probable.
  if (hard && choice.mode === 'pass') {
    const card = hand.find((c) => c.id === choice.cardId)!;
    if (risky(card)) choice = { ...choice, mode: 'market' };
  }
  return choice;
}

/** ANNONCE : l'ordinateur crie-t-il « À TABLE ! » ? */
export function aiAnnounce(state: GameState, player: number, rng: Rng): boolean {
  const me = state.players[player];
  const menu = evaluateMenu(me.hand, me.region, state.menuDuJour);
  if (!menu) return false;
  if (me.difficulty === 'facile' || menu.type === 'gastronomique') return true;
  // Moyen / Difficile : avec 3 cartes de sa région, on tente d'attendre le Gastronomique
  // (avec une patience limitée, sinon la manche pourrait ne jamais finir).
  if (countRegion(me.hand, me.region) === 3) return rng() > PATIENCE;
  return true;
}
