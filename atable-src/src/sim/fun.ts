// Mesure du « fun » et barème /100 (voir README) : le barème est FIGÉ, calibré sur la v4
// (4 joueurs ≈ 72, 3 joueurs ≈ 67, Duel ≈ 57) avant toute modification des règles.
import {
  activePlayers, aiAnnounce, aiChooseAll, aiDenounce, aiReveal, aiRupture, botChef, botOrder, checkOrder, vaisselleLocked, leftOf, missingDishes, pendingOrder, settleOrder, aiShow, aiTake, announceableMenu, checkAnnounce,
  createGame, createRng, denounce, marketReceivers, menuProgress, mustShow, nextRound, passCountOf, placeOrder, playBotTurn,
  resolveAnnouncements, resolveExchange, showCard, shuffle, submitChoice, visibleDiscard, dayEventsFor,
  type Difficulty, type GameState, type Rules,
} from '../engine';
import { DEFAULT_RULES } from '../engine/game';

const LEVELS: Difficulty[] = ['facile', 'moyen', 'difficile'];

/** Plats réunis (sur 4) pour la région d'un joueur, Baguette comprise. */
export function progressOf(s: GameState, p: number): number {
  const pl = s.players[p];
  const best = Math.max(...menuProgress(pl.hand, pl.regions, pl.bonus).map((m) => m.have.size));
  return Math.min(4, best + (best === 3 && pl.hand.some((c) => c.kind === 'baguette') ? 1 : 0));
}
const ownCards = (s: GameState, p: number) => s.players[p].hand.filter((c) => c.kind === 'dish' && s.players[p].regions.includes(c.region)).map((c) => c.id);

export interface FunStats {
  turnsPerRound: number; roundsPerGame: number; turnsPerGame: number; pctRoundsOver25: number;
  pctProgressTurns: number; pctAgency: number; pctTight: number; maxStagnation: number;
  pctNearMiss: number; pctClose: number; pctComeback: number; pctSweep: number; pctFirstRoundWinner: number; leadChanges: number;
  interactionsPerPlayerTurn: number; denunciationsPerRound: number; ordersPerTurn: number;
  seatMaxDev: number; hardMinusEasy: number;
}

/** Simule des parties entre IA (niveaux mélangés) et relève les indicateurs de fun. */
export function measure(n: number, rules: Partial<Rules>, games = 300, seed = 4242): FunStats {
  const rng = createRng(seed);
  const a = { rounds: 0, turns: 0, over25: 0, games: 0, gameRounds: 0, pt: 0, gain: 0, agency: 0, tight: 0, stag: 0, near: 0, close: 0, comeback: 0, sweep: 0, frw: 0, lead: 0, inter: 0, den: 0, orders: 0, botTurns: 0 };
  const seats = Array(n).fill(0);
  const lvWins: Record<string, number> = {}, lvSeats: Record<string, number> = {};
  for (let g = 0; g < games; g++) {
    const levels = shuffle(rng, Array.from({ length: n }, (_, i) => LEVELS[(i + g) % 3]));
    for (const lv of levels) lvSeats[lv] = (lvSeats[lv] ?? 0) + 1;
    const s = createGame(levels.map((d, i) => ({ name: `J${i}`, isHuman: false, difficulty: d, age: 8 + Math.floor(rng() * 70) })), rng, { rules });
    const streak = Array(n).fill(0);
    const starsHist: number[][] = [];
    let leader = -1, frw = -1, guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 20000) {
      if (s.phase === 'roundOver') { nextRound(s, rng); streak.fill(0); continue; }
      const before = s.players.map((_, p) => progressOf(s, p));
      const ownBefore = s.players.map((_, p) => new Set(ownCards(s, p)));
      const round = s.roundNumber, hist = s.history.length, ordersBefore = s.orders.length;
      for (const p of activePlayers(s)) {
        const me = s.players[p];
        const junk = me.hand.filter((c) => !(c.kind === 'dish' && me.regions.includes(c.region)) && c.kind !== 'baguette').length;
        if (junk <= passCountOf(s) + 1) a.tight++;
      }
      playBotTurn(s, rng);
      a.botTurns++;
      const newOrders = s.orders.length >= ordersBefore ? s.orders.length - ordersBefore : 0;
      a.orders += newOrders;
      a.inter += newOrders;
      for (const r of s.history.slice(hist)) {
        if (r.denunciation) { a.den++; a.inter++; }
        for (const m of r.moves) if (m.mode === 'effect') a.inter++;
      }
      const phase = s.phase as string;
      if (s.roundNumber === round && phase !== 'roundOver' && phase !== 'gameOver') {
        for (let p = 0; p < n; p++) {
          a.pt++;
          const now = progressOf(s, p);
          if (now > before[p]) {
            a.gain++;
            streak[p] = 0;
            const fresh = ownCards(s, p).filter((id) => !ownBefore[p].has(id));
            if (fresh.some((id) => ['order', 'choice', 'swap'].includes(s.origins[id]))) a.agency++;
          } else { streak[p]++; a.stag = Math.max(a.stag, streak[p]); }
        }
        continue;
      }
      const r = s.lastRound!;
      a.rounds++; a.turns += r.turns;
      if (r.turns > 25) a.over25++;
      if (r.winner !== null && s.players.some((_, p) => p !== r.winner && progressOf(s, p) >= 3)) a.near++;
      if (frw < 0 && r.winner !== null) frw = r.winner;
      const stars = s.players.map((p) => p.etoiles);
      starsHist.push(stars);
      const top = Math.max(...stars);
      const ls = stars.map((x, i) => (x === top ? i : -1)).filter((i) => i >= 0);
      if (ls.length === 1) { if (leader >= 0 && ls[0] !== leader) a.lead++; leader = ls[0]; }
      if (phase === 'gameOver') {
        const w = s.winner!;
        a.games++; a.gameRounds += s.roundNumber; seats[w]++;
        lvWins[levels[w]] = (lvWins[levels[w]] ?? 0) + 1;
        if (w === frw) a.frw++;
        const others = stars.filter((_, i) => i !== w);
        if (Math.max(...others) >= s.etoilesToWin - 1) a.close++;
        if (Math.max(...others) === 0) a.sweep++;
        if (starsHist.some((st) => st.some((x, i) => i !== w && x > st[w]))) a.comeback++;
      }
    }
  }
  const pct = (x: number, d: number) => (100 * x) / Math.max(1, d);
  const lv = (k: string) => pct(lvWins[k] ?? 0, lvSeats[k] ?? 1);
  return {
    turnsPerRound: a.turns / a.rounds, roundsPerGame: a.gameRounds / a.games, turnsPerGame: a.turns / a.games, pctRoundsOver25: pct(a.over25, a.rounds),
    pctProgressTurns: pct(a.gain, a.pt), pctAgency: pct(a.agency, a.gain), pctTight: pct(a.tight, a.botTurns * n), maxStagnation: a.stag,
    pctNearMiss: pct(a.near, a.rounds), pctClose: pct(a.close, a.games), pctComeback: pct(a.comeback, a.games), pctSweep: pct(a.sweep, a.games),
    pctFirstRoundWinner: pct(a.frw, a.games), leadChanges: a.lead / a.games,
    interactionsPerPlayerTurn: a.inter / (a.botTurns * n), denunciationsPerRound: a.den / a.rounds, ordersPerTurn: a.orders / a.botTurns,
    seatMaxDev: Math.max(...seats.map((w) => Math.abs(pct(w, a.games) - 100 / n))), hardMinusEasy: lv('difficile') - lv('facile'),
  };
}

/**
 * Débutant « naïf » : garde sa région, passe le reste, prend la carte visible si elle l'aide,
 * annonce dès qu'il peut, commande au hasard si les règles le permettent. Il ne dénonce jamais.
 * Renvoie son % de victoires contre des IA difficiles.
 */
export function naiveWinRate(n: number, rules: Partial<Rules>, games = 300): number {
  let wins = 0;
  for (let g = 0; g < games; g++) {
    const rng = createRng(1000 + g);
    const s = createGame(Array.from({ length: n }, (_, i) => ({ name: 'J' + i, isHuman: i === 0, difficulty: 'difficile' as Difficulty, age: 8 + Math.floor(rng() * 70) })), rng, { rules });
    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 5000) {
      if (s.phase === 'roundOver') { nextRound(s, rng); continue; }
      for (const p of activePlayers(s)) if (mustShow(s, p)) showCard(s, p, aiShow(s, p, rng)!);
      for (let p = 1; p < n; p++) { const d = aiDenounce(s, p); if (d) { denounce(s, p, d.target, d.region, rng, undefined, { reveal: aiReveal(s, p) }); break; } }
      for (const p of activePlayers(s)) botChef(s, p, rng);
      for (let k = 0; k < 3; k++) naiveOrder(s, rng);
      for (const p of activePlayers(s)) if (p !== 0) botOrder(s, p, rng);
      for (const p of activePlayers(s)) if (p !== 0) submitChoice(s, p, aiChooseAll(s, p, rng));
      const me = s.players[0];
      let take: 'pioche' | 'defausse' = 'pioche';
      if (activePlayers(s).includes(0)) {
        submitChoice(s, 0, naiveChoice(s, 0));
        const v = visibleDiscard(s);
        if (v && v.kind === 'dish' && me.regions.includes(v.region)) take = 'defausse';
      }
      resolveExchange(s, rng, Object.fromEntries(marketReceivers(s).map((p) => [p, p === 0 ? take : aiTake(s, p)])));
      const ann = activePlayers(s).filter((p) => p !== 0 && aiAnnounce(s, p, rng));
      const mine = activePlayers(s).includes(0) && announceableMenu(s, 0) && !checkAnnounce(s, 0);
      resolveAnnouncements(s, mine ? [0, ...ann] : ann, rng);
    }
    if (s.winner === 0) wins++;
  }
  return (100 * wins) / games;
}

/** Cartes données par le débutant : la Vaisselle, puis tout ce qui n'est pas de sa région (passé), les effets au Marché. */
export function naiveChoice(s: GameState, p: number) {
  const me = s.players[p];
  const order = [
    ...me.hand.filter((c) => c.kind === 'vaisselle' && !vaisselleLocked(s, p) && leftOf(s, p) !== p),
    ...me.hand.filter((c) => c.kind === 'dish' && !me.regions.includes(c.region)),
    ...me.hand.filter((c) => c.kind === 'effect'),
    ...me.hand.filter((c) => c.kind === 'dish' && me.regions.includes(c.region) && me.bonus[0] === c.course),
    ...me.hand.filter((c) => c.kind === 'dish' && me.regions.includes(c.region)),
    ...me.hand.filter((c) => c.kind === 'baguette'),
  ];
  const cards = [...new Set(order)].slice(0, passCountOf(s));
  const picks = cards.map((c) => ({ cardId: c.id, mode: (c.kind === 'effect' || (s.event === 'fromagesBloques' && c.kind === 'dish' && c.course === 'fromage') ? 'market' : 'pass') as 'pass' | 'market' }));
  // Règle « une au voisin, une au Marché » : la 2e carte part au Marché.
  if (s.rules.split && picks.length === 2) {
    const cheese = (id: string) => s.event === 'fromagesBloques' && me.hand.some((c) => c.id === id && c.kind === 'dish' && c.course === 'fromage');
    picks[0].mode = cheese(picks[0].cardId) ? 'market' : 'pass';
    picks[1].mode = picks[0].mode === 'market' && !cheese(picks[1].cardId) ? 'pass' : 'market';
  }
  return { ...picks[0], extra: picks.slice(1) };
}

/** Commande du débutant (règle « service ») : un plat qui lui manque, à un adversaire au hasard ; il rend la Vaisselle s'il l'a. */
function naiveOrder(s: GameState, rng: () => number): void {
  if (s.rules.commande !== 'service' || checkOrder(s, 0)) return;
  const missing = missingDishes(s, 0);
  const others = activePlayers(s).filter((i) => i !== 0);
  if (!missing.length || !others.length) return;
  // Un débutant ne redemande pas la même chose au même chef dans le tour.
  const options = missing.flatMap((cardId) => others.map((target) => ({ cardId, target }))).filter((o) => !s.orders.some((x) => x.player === 0 && x.turn === s.turn && x.target === o.target && x.cardId === o.cardId));
  if (!options.length) return;
  placeOrder(s, 0, { ...options[Math.floor(rng() * options.length)], refuse: (t) => aiRupture(s, t, rng) }, rng);
  if (pendingOrder(s)) {
    const me = s.players[0];
    const give = me.hand.find((c) => c.kind === 'vaisselle' && !vaisselleLocked(s, 0)) ?? me.hand.find((c) => c.kind === 'dish' && !me.regions.includes(c.region)) ?? me.hand.find((c) => c.kind !== 'dish' || !me.regions.includes(c.region))!;
    try { settleOrder(s, 0, give.id); } catch { settleOrder(s, 0, me.hand.find((c) => c.kind !== 'vaisselle' && c.id !== s.orders[s.orders.length - 1].cardId)!.id); }
  }
}

/** Nombre de « modules » de règles à expliquer (accessibilité). */
export function ruleModules(rules: Rules, n: number): string[] {
  const m = ['plat secret (= 1 plat de ta région)', 'donner des cartes (voisin ou Marché)', 'menus Gastronomique / Maison (Baguette)', 'Vaisselle (pas d’annonce)', 'dénonciation (juste / fausse)', 'étoiles'];
  if (rules.openMarket) m.push('Marché ouvert');
  if (rules.blindAnnounce) m.push('annonce face cachée + bluff puni');
  if (rules.lastService) m.push('Dernier service');
  if (rules.revealToDenounce) m.push('carte montrée + récompense');
  if (rules.denounceLimit === 'protege') m.push('protection');
  if (rules.commande !== 'aucune') m.push(rules.commande === 'service' ? 'commande servie (chaque tour)' : 'commande');
  if (rules.vaisselleToLeader) m.push('Vaisselle au chef en tête');
  if (rules.baguetteToLast) m.push('Baguette au dernier');
  if (rules.allServedStar && rules.lastService) m.push('étoile pour tout menu servi');
  if (rules.duelOrders && n === 2) m.push('Duel : 2 commandes par tour');
  if (rules.chefs) m.push('carte Chef (son pouvoir)', 'pouvoirs des autres chefs');
  if (rules.dishOfDay) m.push('Plat du jour (événements)');
  const fx = Object.entries(rules.effects).filter(([, k]) => (k ?? 0) > 0).map(([e]) => e);
  const duel = rules.duel && n === 2;
  for (const e of fx) m.push(duel && e === 'demitour' ? 'effet degustation' : `effet ${e}`);
  if (duel && rules.dishOfDay && dayEventsFor({ players: Array(n).fill(null), rules } as never).includes('inspection')) m.push('Inspection (Duel)');
  if (rules.passCount !== 2) m.push(`${rules.passCount} cartes données`);
  return m;
}

export interface Score { total: number; parts: Record<string, number> }
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Barème /100 (figé). Chaque critère est une fonction des mesures ; les critères
 * « thème » et « rejouabilité » dépendent du contenu du jeu.
 */
export function score(st: FunStats, naive: number, rules: Rules, n: number): Score {
  const fair = 100 / n;
  const modules = ruleModules(rules, n).length;
  const variety = (rules.dishOfDay ? 1 : 0) + (Object.values(rules.effects).some((k) => (k ?? 0) > 0) ? 1 : 0);
  const secPerTurn = 15 + 5 * n + 6 * st.ordersPerTurn;
  const minutes = (st.turnsPerGame * secPerTurn) / 60 + st.roundsPerGame;
  const parts: Record<string, number> = {
    'Thème (5)': 5,
    'Rejouabilité (10)': 6 + variety,
    'Accessibilité (10)': 10 * clamp(1 - (modules - 3) * 0.025),
    'Durée et rythme (10)': 5 * clamp((55 - minutes) / 25) + 3 * clamp(1 - st.pctRoundsOver25 / 15) + 2 * clamp((st.pctProgressTurns - 5) / 15),
    'Tension (15)': 7 * clamp(st.pctNearMiss / 85) + 5 * clamp(st.pctClose / 65) + 3 * clamp(st.pctComeback / 60),
    'Interaction (15)': 4 + 7 * clamp(st.interactionsPerPlayerTurn / 0.3) + 4 * clamp(st.denunciationsPerRound / 0.3),
    'Retournements et équilibre (10)': 3 * clamp(1 - st.seatMaxDev / 10) + 3 * clamp(1 - st.pctSweep / 30) + 2 * clamp(1 - (st.pctFirstRoundWinner - fair) / 40) + 2 * clamp(st.leadChanges),
    'Part du talent (10)': 5 * clamp(st.hardMinusEasy / 25) + 5 * clamp((fair + 20 - naive) / 20),
    'Décisions (15)': 5 * clamp((st.pctProgressTurns - 5) / 15) + 5 * clamp(st.pctAgency / 30) + 5 * clamp(st.pctTight / 30),
  };
  for (const k of Object.keys(parts)) parts[k] = Math.round(parts[k] * 10) / 10;
  return { total: Math.round(Object.values(parts).reduce((x, y) => x + y, 0)), parts };
}

export const rulesOf = (r: Partial<Rules>): Rules => ({ ...DEFAULT_RULES, ...r });
export { playBotTurn };
