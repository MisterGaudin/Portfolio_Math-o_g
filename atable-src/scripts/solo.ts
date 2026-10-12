/**
 * Banc d'essai d'un mode solo pour À TABLE !, avec les cartes existantes uniquement
 * (48 plats, Baguette, Vaisselle, 2 Chapardeur, 8 Plat du jour, jetons Étoile).
 *
 * Règle de base (« Coup de feu en cuisine ») :
 * - On révèle K plats : ce sont les commandes. Chacun compte comme un plat de son menu : il faut
 *   réunir les 3 autres plats de sa région (la Baguette en remplace un).
 * - Main de H cartes, étal de E cartes face visible.
 * - Chaque tour : prendre 1 carte (pioche ou étal), puis défausser pour revenir à H cartes.
 *   Menu complet en main (et pas de Vaisselle) : on le sert, +1 étoile, nouvelle commande.
 * - Vaisselle : bloque le service. S'en débarrasser coûte un tour (elle repart sous la pioche).
 * - Chapardeur : se défausse pour reprendre n'importe quelle carte de la défausse.
 * - Plat du jour (option « clients ») : mélangés dans la pioche ; quand on en pioche un, le client le
 *   plus ancien s'en va (sa commande est perdue). N clients perdus : partie perdue.
 * - Fin : pioche vide (ou trop de clients perdus). Victoire si on a T étoiles.
 *
 * Usage : npx vite-node scripts/solo.ts [parties]
 */
import { createRng, shuffle, type Rng } from '../src/engine/rng';
import { REGIONS } from '../src/config/cards';

type Course = 'entree' | 'plat' | 'fromage' | 'dessert';
type C = { k: 'dish'; r: string; c: Course; id: string } | { k: 'baguette' | 'vaisselle' | 'chapardeur' | 'jour'; id: string };
const COURSES: Course[] = ['entree', 'plat', 'fromage', 'dessert'];

interface Cfg {
  name: string;
  K: number; // commandes visibles
  H: number; // taille de main
  E: number; // cartes de l'étal
  T: number; // étoiles pour gagner
  clients: number; // Plat du jour dans la pioche (0 = pas de clients impatients)
  lostMax: number; // clients perdus avant la défaite
  passes: number; // nombre de fois qu'on peut retourner la défausse en pioche
  vaisselleTurn: boolean; // se débarrasser de la Vaisselle coûte un tour
  chapardeurs: number;
}

interface St {
  pile: C[];
  hand: C[];
  etal: C[];
  bin: C[];
  orders: (C & { k: 'dish' })[];
  stars: number;
  lost: number;
  turns: number;
  passesLeft: number;
  starTurns: number[];
  choices: number; // tours avec un vrai choix
  closeChoices: number; // tours où les 2 meilleures options sont proches
}

function deck(cfg: Cfg): C[] {
  const d: C[] = [];
  for (const r of REGIONS) for (const c of COURSES) d.push({ k: 'dish', r: r.id, c, id: `${r.id}-${c}` });
  d.push({ k: 'baguette', id: 'baguette' }, { k: 'vaisselle', id: 'vaisselle' });
  for (let i = 0; i < cfg.chapardeurs; i++) d.push({ k: 'chapardeur', id: `chap${i}` });
  for (let i = 0; i < cfg.clients; i++) d.push({ k: 'jour', id: `jour${i}` });
  return d;
}

const isDish = (c: C): c is C & { k: 'dish' } => c.k === 'dish';

/** Pioche une carte ; si vide et qu'il reste un passage, retourne la défausse. */
function draw(s: St, rng: Rng): C | undefined {
  if (!s.pile.length && s.passesLeft > 0) {
    s.passesLeft--;
    s.pile = shuffle(rng, s.bin.filter((c) => c.k !== 'jour'));
    s.bin = [];
  }
  return s.pile.pop();
}

function newOrder(s: St, rng: Rng) {
  // On révèle jusqu'à trouver un plat ; le reste repart sous la pioche.
  const skipped: C[] = [];
  let c = draw(s, rng);
  while (c && !isDish(c)) {
    skipped.push(c);
    c = draw(s, rng);
  }
  s.pile.unshift(...skipped);
  if (c && isDish(c)) s.orders.push(c);
}

function missing(hand: C[], o: C & { k: 'dish' }) {
  return COURSES.filter((c) => c !== o.c && !hand.some((h) => isDish(h) && h.r === o.r && h.c === c));
}
function canServe(hand: C[], o: C & { k: 'dish' }) {
  if (hand.some((h) => h.k === 'vaisselle')) return false;
  const m = missing(hand, o).length;
  return m === 0 || (m === 1 && hand.some((h) => h.k === 'baguette'));
}

function serveAll(s: St, _cfg: Cfg, rng: Rng) {
  let again = true;
  while (again) {
    again = false;
    for (const o of s.orders) {
      if (!canServe(s.hand, o)) continue;
      const m = missing(s.hand, o);
      s.hand = s.hand.filter((h) => !(isDish(h) && h.r === o.r) && !(m.length && h.k === 'baguette'));
      s.orders = s.orders.filter((x) => x !== o);
      s.stars++;
      s.starTurns.push(s.turns);
      newOrder(s, rng);
      again = true;
      break;
    }
  }
}

/** Valeur d'une main pour l'expert : progrès vers les commandes + petites réserves. */
function value(hand: C[], s: St, _cfg: Cfg): number {
  let v = 0;
  const hasBag = hand.some((h) => h.k === 'baguette');
  for (const o of s.orders) {
    const m = missing(hand, o).length; // 0..3
    const eff = Math.max(0, m - (hasBag ? 1 : 0));
    v += [10, 4.5, 1.8, 0][Math.min(3, eff)] + (3 - m) * 0.6;
  }
  for (const h of hand) {
    if (h.k === 'baguette') v += 1.2;
    if (h.k === 'chapardeur') v += 0.8;
    if (h.k === 'vaisselle') v -= 2.5;
    // plats d'une région sans commande : petite valeur (une future commande peut tomber dessus)
    if (isDish(h) && !s.orders.some((o) => o.r === h.r)) {
      const same = hand.filter((x) => isDish(x) && x.r === h.r).length;
      v += 0.05 + 0.12 * (same - 1);
    }
  }
  return v;
}

/** Meilleure défausse pour revenir à H cartes (l'expert garde la meilleure main). */
function bestDiscard(hand: C[], s: St, cfg: Cfg): { hand: C[]; v: number } {
  let best = { hand, v: -Infinity };
  if (hand.length <= cfg.H) return { hand, v: value(hand, s, cfg) };
  for (let i = 0; i < hand.length; i++) {
    if (cfg.vaisselleTurn && hand[i].k === 'vaisselle') continue;
    const h = hand.filter((_, j) => j !== i);
    const v = value(h, s, cfg);
    if (v > best.v) best = { hand: h, v };
  }
  return best;
}

type Policy = 'expert' | 'naive' | 'random';

/** Probabilité estimée que la pioche donne une carte utile (l'expert compte les cartes). */
function pileEV(s: St, cfg: Cfg): number {
  const unknown = [...s.pile];
  if (!unknown.length) return -Infinity;
  const sample = unknown.length > 14 ? unknown.slice(-14) : unknown;
  // Valeur moyenne en ajoutant une carte inconnue (approximation : sur toutes les cartes restantes).
  let tot = 0;
  for (const c of unknown) {
    if (c.k === 'jour') {
      tot += value(s.hand, s, cfg) - 3;
      continue;
    }
    tot += bestDiscard([...s.hand, c], s, cfg).v;
  }
  void sample;
  return tot / unknown.length;
}

function turn(s: St, cfg: Cfg, rng: Rng, pol: Policy) {
  // La partie s'arrête quand la pioche est vide (et qu'il ne reste plus de passage).
  if (!s.pile.length && !(s.passesLeft && s.bin.length)) return false;
  s.turns++;
  const hasV = s.hand.some((h) => h.k === 'vaisselle');
  type Opt = { kind: 'pile' | 'etal' | 'wash' | 'chap'; i?: number; v: number };
  const opts: Opt[] = [];
  if (pol === 'expert') {
    if (s.pile.length || s.passesLeft) opts.push({ kind: 'pile', v: pileEV(s, cfg) });
    s.etal.forEach((c, i) => opts.push({ kind: 'etal', i, v: bestDiscard([...s.hand, c], s, cfg).v }));
    if (hasV && cfg.vaisselleTurn) opts.push({ kind: 'wash', v: value(s.hand.filter((h) => h.k !== 'vaisselle'), s, cfg) });
    const chap = s.hand.find((h) => h.k === 'chapardeur');
    if (chap && s.bin.length) {
      const base = s.hand.filter((h) => h !== chap);
      let bv = -Infinity, bi = -1;
      s.bin.forEach((c, i) => {
        if (c.k === 'chapardeur' || c.k === 'jour') return;
        const v = bestDiscard([...base, c], s, { ...cfg, H: cfg.H }).v;
        if (v > bv) { bv = v; bi = i; }
      });
      opts.push({ kind: 'chap', i: bi, v: bv });
    }
  } else if (pol === 'naive') {
    // Débutant : prend une carte de l'étal qui va dans une commande, sinon pioche ; lave tout de suite.
    if (hasV && cfg.vaisselleTurn && rng() < 0.6) opts.push({ kind: 'wash', v: 1 });
    else {
      const i = s.etal.findIndex((c) => isDish(c) && s.orders.some((o) => o.r === c.r && !s.hand.some((h) => h.id === c.id)));
      if (i >= 0) opts.push({ kind: 'etal', i, v: 1 });
      else opts.push({ kind: 'pile', v: 1 });
    }
  } else {
    if (s.pile.length || s.passesLeft) opts.push({ kind: 'pile', v: rng() });
    s.etal.forEach((_, i) => opts.push({ kind: 'etal', i, v: rng() }));
    if (hasV && cfg.vaisselleTurn) opts.push({ kind: 'wash', v: rng() });
  }
  if (!opts.length) return false;
  const sorted = [...opts].sort((a, b) => b.v - a.v);
  const o = sorted[0];
  if (pol === 'expert' && opts.length > 1) {
    s.choices++;
    if (Math.abs(sorted[0].v - sorted[1].v) < 0.6) s.closeChoices++;
  }

  if (o.kind === 'wash') {
    const vi = s.hand.findIndex((h) => h.k === 'vaisselle');
    s.pile.unshift(s.hand.splice(vi, 1)[0]);
  } else {
    let c: C | undefined;
    if (o.kind === 'pile') c = draw(s, rng);
    else if (o.kind === 'etal') {
      c = s.etal.splice(o.i!, 1)[0];
      const n = draw(s, rng);
      if (n) {
        if (n.k === 'jour') clientLeaves(s, n, rng);
        else s.etal.push(n);
      }
    } else {
      const chap = s.hand.find((h) => h.k === 'chapardeur')!;
      s.hand = s.hand.filter((h) => h !== chap);
      c = s.bin.splice(o.i!, 1)[0];
      s.bin.push(chap);
    }
    if (!c) return false;
    if (c.k === 'jour') clientLeaves(s, c, rng);
    else s.hand.push(c);
    // Défausse
    while (s.hand.length > cfg.H) {
      let keep: C[];
      if (pol === 'expert') keep = bestDiscard(s.hand, s, cfg).hand;
      else {
        const cand = s.hand
          .map((h, i) => ({ h, i }))
          .filter((x) => !(cfg.vaisselleTurn && x.h.k === 'vaisselle'))
          .filter((x) => pol === 'random' || !(isDish(x.h) && s.orders.some((o) => o.r === (x.h as any).r)) || s.hand.every((h) => isDish(h) && s.orders.some((o) => o.r === h.r)));
        const useless = cand.filter((x) => pol !== 'naive' || (x.h.k !== 'baguette'));
        const pickFrom = useless.length ? useless : cand.length ? cand : s.hand.map((h, i) => ({ h, i }));
        const x = pickFrom[Math.floor(rng() * pickFrom.length)];
        keep = s.hand.filter((_, j) => j !== x.i);
      }
      const gone = s.hand.find((h) => !keep.includes(h))!;
      s.hand = keep;
      s.bin.push(gone);
    }
  }
  serveAll(s, cfg, rng);
  return true;
}

function clientLeaves(s: St, c: C, rng: Rng) {
  s.bin.push(c);
  const o = s.orders.shift();
  if (o) {
    s.lost++;
    newOrder(s, rng);
  }
}

function play(cfg: Cfg, rng: Rng, pol: Policy) {
  const s: St = { pile: shuffle(rng, deck(cfg)), hand: [], etal: [], bin: [], orders: [], stars: 0, lost: 0, turns: 0, passesLeft: cfg.passes, starTurns: [], choices: 0, closeChoices: 0 };
  // Mise en place : les Plat du jour ne sont pas dans les premières cartes (mélangés dans les 2/3 du bas).
  const jours = s.pile.filter((c) => c.k === 'jour');
  s.pile = s.pile.filter((c) => c.k !== 'jour');
  for (let i = 0; i < cfg.K; i++) newOrder(s, rng);
  for (let i = 0; i < cfg.H; i++) {
    let c = s.pile.pop()!;
    s.hand.push(c);
  }
  for (let i = 0; i < cfg.E; i++) s.etal.push(s.pile.pop()!);
  const third = Math.floor(s.pile.length / 3);
  const bottom = shuffle(rng, [...s.pile.slice(0, s.pile.length - third), ...jours]);
  s.pile = [...bottom, ...s.pile.slice(s.pile.length - third)];
  serveAll(s, cfg, rng);
  let guard = 0;
  while (s.stars < cfg.T && s.lost < cfg.lostMax && guard++ < 400) {
    if (!turn(s, cfg, rng, pol)) break;
  }
  return s;
}

function evaluate(cfg: Cfg, games: number) {
  const res: Record<Policy, { win: number; stars: number[]; turns: number; near: number; lateWin: number; choices: number; close: number; turnsArr: number[] }> = {} as any;
  for (const pol of ['expert', 'naive', 'random'] as Policy[]) {
    const r = { win: 0, stars: [] as number[], turns: 0, near: 0, lateWin: 0, choices: 0, close: 0, turnsArr: [] as number[] };
    for (let g = 0; g < games; g++) {
      const s = play(cfg, createRng(1000 + g), pol);
      const won = s.stars >= cfg.T;
      if (won) {
        r.win++;
        // victoire arrachée : la dernière étoile tombe alors qu'il restait peu (pioche < 8 ou 1 client de la défaite)
        if (s.pile.length + (s.passesLeft ? 99 : 0) < 8 || s.lost === cfg.lostMax - 1) r.lateWin++;
      } else if (s.stars === cfg.T - 1) r.near++;
      r.stars.push(s.stars);
      r.turns += s.turns;
      r.turnsArr.push(s.turns);
      r.choices += s.choices;
      r.close += s.closeChoices;
    }
    res[pol] = r;
  }
  return res;
}

/** Barème solo /100 (mêmes idées que le barème multijoueur, adaptées au jeu seul). */
function soloScore(_cfg: Cfg, res: ReturnType<typeof evaluate>, games: number, rules: number) {
  const e = res.expert, n = res.naive, r = res.random;
  const we = (100 * e.win) / games, wn = (100 * n.win) / games, wr = (100 * r.win) / games;
  const losses = games - e.win;
  const tri = (x: number, lo: number, best1: number, best2: number, hi: number) => (x <= lo || x >= hi ? 0 : x < best1 ? (x - lo) / (best1 - lo) : x <= best2 ? 1 : (hi - x) / (hi - best2));
  const turns = e.turns / games;
  const s = {
    // Défi : un bon joueur gagne entre 40 et 60 % (ni trop facile, ni frustrant).
    'Défi (15)': 15 * tri(we, 10, 40, 60, 92),
    // Talent : l'expert doit nettement battre le débutant, et le hasard ne doit presque jamais gagner.
    'Talent (20)': 12 * Math.min(1, Math.max(0, we - wn) / 30) + 8 * Math.min(1, Math.max(0, 20 - wr) / 20),
    // Débutant : il doit gagner de temps en temps (sinon il abandonne) : 10-30 %.
    'Accueil du débutant (10)': 10 * tri(wn, 0, 10, 30, 60),
    // Tension : défaites « à une étoile près » et victoires arrachées.
    'Tension (15)': 7.5 * Math.min(1, (losses ? e.near / losses : 0) / 0.5) + 7.5 * Math.min(1, (e.win ? e.lateWin / e.win : 0) / 0.35),
    // Décisions : part des tours avec un vrai choix, et part des choix serrés.
    'Décisions (20)': 8 * Math.min(1, e.choices / e.turns / 0.9) + 12 * Math.min(1, e.close / Math.max(1, e.choices) / 0.35),
    // Durée : 20 à 40 tours (≈ 10-15 minutes).
    'Durée (10)': 10 * tri(turns, 8, 20, 40, 70),
    // Simplicité : nombre de règles à retenir.
    'Simplicité (10)': 10 * Math.max(0, Math.min(1, (9 - rules) / 4)),
  };
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  return { total: Math.round(total), parts: s, we, wn, wr, turns };
}

const base: Cfg = { name: '', K: 3, H: 6, E: 3, T: 3, clients: 0, lostMax: 99, passes: 0, vaisselleTurn: true, chapardeurs: 2 };
const candidates: (Cfg & { rules: number })[] = [
  { ...base, name: 'CONTRÔLE pioche seule (pas d’étal, pas de Chapardeur)', H: 5, E: 0, chapardeurs: 0, rules: 3 },
  { ...base, name: 'F H5 (final)', H: 5, rules: 5 },
  { ...base, name: 'F H5 sans Vaisselle', H: 5, rules: 4, vaisselleTurn: false },
  { ...base, name: 'F H5 étal 2', H: 5, E: 2, rules: 5 },
  { ...base, name: 'F H5 étal 4', H: 5, E: 4, rules: 5 },
  { ...base, name: 'F H5 2 commandes', H: 5, K: 2, rules: 5 },
  { ...base, name: 'F H5 4 commandes 4 étoiles', H: 5, K: 4, T: 4, rules: 5 },
  { ...base, name: 'F H5 sans Chapardeur', H: 5, chapardeurs: 0, rules: 4 },
  ...[3, 4, 5, 6].flatMap((n) => [5, 6].map((h) => ({ ...base, name: `S2 clients x${n}, H${h}, 3 étoiles, 3 perdus`, H: h, clients: n, lostMax: 3, rules: 6 }))),
  ...[4, 5, 6].map((n) => ({ ...base, name: `S2 clients x${n}, H6, 4 étoiles, 3 perdus`, H: 6, T: 4, clients: n, lostMax: 3, rules: 6 })),
  ...[4, 5, 6, 8].map((n) => ({ ...base, name: `S2 clients x${n}, H6, 4 étoiles, 1 passage, 3 perdus`, H: 6, T: 4, clients: n, lostMax: 3, passes: 1, rules: 7 })),
  { ...base, name: 'S1 base (H6, 3 commandes, 3 étoiles)', rules: 5 },
  { ...base, name: 'S1 H5', H: 5, rules: 5 },
  { ...base, name: 'S1 H5, 4 étoiles', H: 5, T: 4, rules: 5 },
  { ...base, name: 'S1 H5, 5 étoiles', H: 5, T: 5, rules: 5 },
  { ...base, name: 'S1 H4, 4 étoiles', H: 4, T: 4, rules: 5 },
  { ...base, name: 'S2 clients (8 PdJ, 3 perdus = défaite), H5, 4 étoiles', H: 5, T: 4, clients: 8, lostMax: 3, rules: 6 },
  { ...base, name: 'S2 clients, H5, 5 étoiles', H: 5, T: 5, clients: 8, lostMax: 3, rules: 6 },
  { ...base, name: 'S2 clients, H6, 5 étoiles', H: 6, T: 5, clients: 8, lostMax: 3, rules: 6 },
  { ...base, name: 'S2 clients, H5, 5 étoiles, 2 commandes', H: 5, T: 5, K: 2, clients: 8, lostMax: 3, rules: 6 },
  { ...base, name: 'S2 clients, H5, 6 étoiles, 1 passage', H: 5, T: 6, clients: 8, lostMax: 3, passes: 1, rules: 7 },
  { ...base, name: 'S2 clients, H6, 6 étoiles, 1 passage', H: 6, T: 6, clients: 8, lostMax: 3, passes: 1, rules: 7 },
  { ...base, name: 'S2 clients, H5, 4 étoiles, étal 2', H: 5, T: 4, E: 2, clients: 8, lostMax: 3, rules: 6 },
];

const games = Number(process.argv[2] ?? 400);
const only = process.argv[3];
for (const cfg of candidates) {
  if (only && !cfg.name.includes(only)) continue;
  const res = evaluate(cfg, games);
  const sc = soloScore(cfg, res, games, cfg.rules);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(
    `${sc.total.toString().padStart(3)}/100  ${cfg.name}\n        expert ${sc.we.toFixed(0)}%  débutant ${sc.wn.toFixed(0)}%  hasard ${sc.wr.toFixed(0)}%  tours ${sc.turns.toFixed(1)}  étoiles expert ${avg(res.expert.stars).toFixed(2)}  ` +
      Object.entries(sc.parts).map(([k, v]) => `${k.split(' (')[0]} ${v.toFixed(1)}`).join(' · '),
  );
}
