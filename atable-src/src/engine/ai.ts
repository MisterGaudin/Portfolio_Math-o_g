// Intelligence des ordinateurs, en 3 niveaux.
// L'IA ne lit que ce qu'un vrai joueur saurait : sa main, ses 2 régions, les cartes
// reçues, la défausse (Marché) et les dénonciations publiques.
import { announceableMenu, checkAnnounce, checkDenounce, leftOf, ordersAllowed, passCountOf, visibleDiscard } from './game';
import { COURSES } from '../config/cards';
import { menuProgress } from './deck';
import { pick, type Rng } from './rng';
import type { Card, Choice, DishCard, GameState, Pick, RegionId } from './types';

/** Multiplicateur appliqué à une région quand un joueur s'en débarrasse. */
const DUMP_FACTOR = 0.3;
/** Seuil de confiance au-delà duquel l'IA difficile dénonce. */
export const DENOUNCE_CONFIDENCE = 0.7;
/** Probabilité, à chaque tour, de continuer à attendre le Gastronomique. */
const PATIENCE = 0;
/** Après ce nombre de tours sans annonce, l'IA renouvelle ses cartes au Marché. */
const STALL_TURNS = 12;

/** Pour chaque autre joueur : probabilité que chaque région soit l'une de ses 2 régions. */
export type Beliefs = Record<number, Record<RegionId, number>>;

/**
 * Ce que `observer` peut déduire des régions secrètes des autres joueurs.
 * - un joueur qui envoie une carte au Marché (public) n'a sans doute pas cette région ;
 * - pareil pour une carte qu'il NOUS passe ;
 * - une fausse accusation écarte la région accusée ;
 * - une accusation juste écarte la région démasquée et brouille les indices
 *   (le joueur a pioché une nouvelle région à la place).
 * Chaque joueur a 2 régions : la probabilité d'une région R tient compte de toutes
 * les paires possibles (R, autre région).
 */
export function beliefs(state: GameState, observer: number): Beliefs {
  const n = state.players.length;
  const own = state.players[observer].regions;
  const out: Beliefs = {};
  for (let q = 0; q < n; q++) {
    if (q === observer) continue;
    const weights: Record<RegionId, number> = Object.fromEntries(state.regionsInPlay.map((r) => [r, 1]));
    let excluded = new Set<RegionId>(own);
    const steps = [...state.history.map((h) => ({ d: h.denunciation, moves: h.moves })), { d: state.denunciation ?? undefined, moves: [] }];
    for (const { d, moves } of steps) {
      if (d && d.target === q) {
        if (d.correct) {
          // Nouvelle région inconnue : les indices d'avant ne valent plus qu'à moitié.
          for (const r of Object.keys(weights)) weights[r] = Math.sqrt(weights[r]);
          excluded = new Set([...own, d.region]);
        } else excluded.add(d.region);
      }
      for (const m of moves) {
        if (m.player !== q || m.card.kind !== 'dish') continue;
        if (m.mode === 'market' || m.to === observer) weights[m.card.region] *= DUMP_FACTOR;
      }
    }
    // Cartes Région partagées : la région des autres peut être la mienne.
    if (state.rules.mode === 'unMenu' && state.rules.regionCards === 'partagees') for (const r of own) if (!steps.some((x) => x.d?.target === q && x.d.region === r)) excluded.delete(r);
    const candidates = state.regionsInPlay.filter((r) => !excluded.has(r));
    const total = candidates.reduce((sum, r) => sum + weights[r], 0);
    if (state.rules.regionsPerPlayer === 1) {
      out[q] = Object.fromEntries(candidates.map((r) => [r, weights[r] / (total || 1)]));
      continue;
    }
    const squares = candidates.reduce((sum, r) => sum + weights[r] ** 2, 0);
    const pairs = (total * total - squares) / 2 || 1;
    // P(R fait partie de ses 2 régions) = somme des poids des paires contenant R.
    out[q] = Object.fromEntries(candidates.map((r) => [r, Math.min(1, (weights[r] * (total - weights[r])) / pairs)]));
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

/** DÉNONCIATION : seule l'IA difficile dénonce, avec la Vaisselle, quand sa confiance dépasse 70 %. */
export function aiDenounce(state: GameState, player: number): { target: number; region: RegionId } | null {
  const me = state.players[player];
  if (me.difficulty !== 'difficile' || checkDenounce(state, player)) return null;
  const b = beliefs(state, player);
  let best: { target: number; region: RegionId; p: number } | null = null;
  for (const [q, dist] of Object.entries(b)) {
    if (state.rules.denounceLimit === 'protege' && state.unmasked.includes(+q)) continue;
    const { region, p } = mostLikely(dist);
    if (region && p > DENOUNCE_CONFIDENCE && (!best || p > best.p)) best = { target: +q, region, p };
  }
  return best && { target: best.target, region: best.region };
}

/** CHOIX SECRET de l'ordinateur : quelle carte, et passer ou Marché. */
export function aiChoose(state: GameState, player: number, rng: Rng): Choice {
  const me = state.players[player];
  const hand = me.hand;
  const own = me.regions;
  const mine = (c: Card) => isDish(c) && own.includes(c.region);

  // Facile : une carte au hasard qui n'est pas de ses régions, passée à gauche
  // (et de temps en temps au Marché, sinon la pioche ne tournerait jamais).
  const others = state.players.map((_, i) => i).filter((i) => i !== player);
  const reachable = others.filter((i) => !state.frozen.includes(i));
  // Carte rendue par le Chapardeur : la plus inutile (jamais la Vaisselle ni une carte utile).
  const giveFor = (except: string) => {
    const cands = hand.filter((c) => c.id !== except && c.kind !== 'vaisselle' && !(isDish(c) && own.includes(c.region) && !isBonus(c)));
    return (cands.length ? pick(rng, cands) : hand.find((c) => c.id !== except && c.kind !== 'vaisselle'))?.id;
  };
  const isBonus = (c: DishCard) => me.bonus[own.indexOf(c.region)] === c.course;
  /** Joue une carte à effet avec une cible raisonnable. */
  const playEffect = (card: Card & { kind: 'effect' }): Choice | null => {
    if (card.effect === 'demitour') return { cardId: card.id, mode: 'effect' };
    if (card.effect === 'controle') {
      // Contrôle sanitaire : sur le joueur le plus étoilé (ou un joueur au hasard).
      const top = Math.max(...others.map((i) => state.players[i].etoiles));
      return { cardId: card.id, mode: 'effect', target: pick(rng, others.filter((i) => state.players[i].etoiles === top)) };
    }
    if (!reachable.length) return null;
    if (card.effect === 'chapardeur') {
      // Chapardeur : de préférence chez quelqu'un qui a répondu « oui » à notre commande.
      const lead = state.orders.filter((o) => o.player === player).flatMap((o) => o.yes).filter((i) => reachable.includes(i));
      const give = giveFor(card.id);
      if (!give) return null;
      return { cardId: card.id, mode: 'effect', target: pick(rng, lead.length ? lead : reachable), give };
    }
    return { cardId: card.id, mode: 'effect', target: pick(rng, reachable) };
  };
  const finish = (ch: Choice): Choice => {
    // « Plateau de fromages » : les fromages ne se passent pas, ils vont au Marché.
    const card = hand.find((c) => c.id === ch.cardId);
    if (ch.mode === 'pass' && state.event === 'fromagesBloques' && card?.kind === 'dish' && card.course === 'fromage') return { ...ch, mode: 'market' };
    return ch;
  };
  if (me.difficulty === 'facile') {
    const notMine = hand.filter((c) => !mine(c));
    const card = pick(rng, notMine.length ? notMine : hand);
    // Carte à effet : une fois sur deux, on la joue (au hasard).
    if (card.kind === 'effect' && rng() < 0.5) {
      const ch = playEffect(card);
      if (ch) return ch;
    }
    return finish({ cardId: card.id, mode: card.kind !== 'vaisselle' && rng() < 0.3 ? 'market' : 'pass' });
  }

  // Moyen et Difficile : on refile toujours la Vaisselle.
  const vaisselle = hand.find((c) => c.kind === 'vaisselle');
  if (vaisselle) return { cardId: vaisselle.id, mode: 'pass' };

  // Cartes à effet : Demi-tour, Contrôle sanitaire et Chapardeur se jouent tout de suite ;
  // le Troc seulement si notre main est mauvaise (sinon au Marché, pour ne pas le donner).
  const progress = Math.max(0, ...menuProgress(hand, own, me.bonus).map((p) => p.have.size));
  for (const card of hand) {
    if (card.kind !== 'effect') continue;
    if (card.effect === 'troc' && progress > 2) return { cardId: card.id, mode: 'market' };
    const ch = playEffect(card);
    if (ch) return ch;
    return { cardId: card.id, mode: 'market' };
  }
  // Baguettes en trop : une seule peut servir.
  const breads = hand.filter((c) => c.kind === 'baguette');
  if (breads.length > 1) return { cardId: breads[1].id, mode: 'market' };

  const hard = me.difficulty === 'difficile';
  const left = leftOf(state, player);
  const leftBelief = beliefs(state, player)[left] ?? {};
  // Probabilité « moyenne » d'une région (le voisin en a 2 parmi les candidates).
  const uniform = state.rules.regionsPerPlayer / (Object.keys(leftBelief).length || 1);
  // Une carte est « utile au voisin » tant que rien ne prouve le contraire
  // (il s'est déjà débarrassé de cette région au Marché ou en nous la passant).
  // Si la manche s'éternise, on considère que plus rien n'intéresse personne (on relance via le Marché).
  const stalled = state.turn > STALL_TURNS;
  const usefulToLeft = (c: DishCard) => !stalled && (leftBelief[c.region] ?? 0) > 0.5 * uniform;
  // Difficile : une région probable du voisin (nettement au-dessus de la moyenne).
  const risky = (c: Card) => c.kind === 'baguette' || (isDish(c) && (leftBelief[c.region] ?? 0) > 1.5 * uniform);

  // Une carte « en double » (même type de plat qu'une autre carte de la main) ne peut
  // servir à aucun menu : c'est elle qu'on lâche en priorité.
  const doubles = (c: DishCard) => hand.filter((x) => x !== c && isDish(x) && x.course === c.course).length;
  const worst = (cards: DishCard[]) => {
    const max = Math.max(...cards.map(doubles));
    return pick(rng, cards.filter((c) => doubles(c) === max));
  };

  // Inutile : une autre région, un double d'un plat de sa région déjà en main,
  // ou (variante « un menu ») le plat déjà fourni par la carte Région.
  let junk = hand
    .filter(isDish)
    .filter((c, i) => !own.includes(c.region) || me.bonus[own.indexOf(c.region)] === c.course || hand.findIndex((x) => isDish(x) && x.region === c.region && x.course === c.course) !== i);
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
    // sinon une carte de la région la moins avancée, en dernier recours.
    const baguette = hand.find((c) => c.kind === 'baguette');
    const weakest = [...own].sort((a, b) => countOf(hand, a) - countOf(hand, b))[0];
    const fallback = hand.filter((c) => isDish(c) && c.region === weakest);
    choice = { cardId: (baguette ?? pick(rng, fallback.length ? fallback : hand)).id, mode: 'pass' };
  }

  // Difficile : ne jamais passer au voisin une carte qui pourrait compléter sa région probable.
  if (hard && choice.mode === 'pass') {
    const card = hand.find((c) => c.id === choice.cardId)!;
    if (risky(card)) choice = { ...choice, mode: 'market' };
  }
  return finish(choice);
}

const countOf = (hand: readonly Card[], region: RegionId) => hand.filter((c) => isDish(c) && c.region === region).length;

/** Choix complet : autant de cartes que la règle « passCount » l'exige, choisies une à une. */
export function aiChooseAll(state: GameState, player: number, rng: Rng): Choice {
  const picks: Pick[] = [];
  const view = { ...state, players: state.players.map((p) => ({ ...p, hand: [...p.hand] })) };
  for (let k = 0; k < passCountOf(state); k++) {
    const ch = aiChoose(view, player, rng);
    picks.push({ cardId: ch.cardId, mode: ch.mode, target: ch.target, give: ch.give });
    // La carte rendue par le Chapardeur doit rester en main : on ne la donne pas.
    view.players[player].hand = view.players[player].hand.filter((c) => c.id !== ch.cardId && c.id !== ch.give);
  }
  return { ...picks[0], extra: picks.slice(1) };
}

/** Plats qui manquent à l'ordinateur pour terminer sa région la plus avancée. */
export function missingDishes(state: GameState, player: number): string[] {
  const me = state.players[player];
  const best = menuProgress(me.hand, me.regions, me.bonus).sort((a, b) => b.have.size - a.have.size)[0];
  if (!best) return [];
  return COURSES.filter((c) => !best.have.has(c)).map((c) => `${best.region}-${c}`);
}

/** Marché ouvert : prendre la carte visible de la défausse si elle nous manque. */
export function aiTake(state: GameState, player: number): 'pioche' | 'defausse' {
  const top = visibleDiscard(state);
  if (!top || top.kind !== 'dish' || state.players[player].difficulty === 'facile') return 'pioche';
  return missingDishes(state, player).includes(top.id.replace(/-\d+$/, '')) ? 'defausse' : 'pioche';
}

/** Carte montrée pour dénoncer : la plus inutile. */
export function aiReveal(state: GameState, player: number): string | undefined {
  const me = state.players[player];
  const junk = me.hand.filter((c) => c.kind !== 'vaisselle' && !(isDish(c) && me.regions.includes(c.region) && me.bonus[me.regions.indexOf(c.region)] !== c.course));
  return (junk[0] ?? me.hand.find((c) => c.kind !== 'vaisselle'))?.id;
}

/** COMMANDE : l'IA difficile commande un plat qui lui manque quand elle a un Chapardeur pour aller le chercher. */
export function aiOrder(state: GameState, player: number): string | null {
  const me = state.players[player];
  if (me.difficulty !== 'difficile' || state.rules.commande !== 'plat') return null;
  if (state.orders.filter((o) => o.player === player).length >= ordersAllowed(state)) return null;
  if (!me.hand.some((c) => c.kind === 'effect' && c.effect === 'chapardeur')) return null;
  return missingDishes(state, player)[0] ?? null;
}

/** ANNONCE : l'ordinateur crie-t-il « À TABLE ! » ? (Il ne bluffe jamais.) */
export function aiAnnounce(state: GameState, player: number, rng: Rng): boolean {
  const me = state.players[player];
  if (checkAnnounce(state, player)) return false;
  const menu = announceableMenu(state, player);
  if (!menu) return false;
  if (me.difficulty === 'facile' || menu.type !== 'maison') return true;
  // Moyen / Difficile : avec la Baguette, on tente d'attendre le Gastronomique
  // (avec une patience limitée, sinon la manche pourrait ne jamais finir).
  return rng() > PATIENCE;
}
