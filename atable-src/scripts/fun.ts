// Mesures de « fun » en simulation : durée, tension, retours, interaction, temps morts, part du talent.
// npm run fun -- [parties]
import { createGame, createRng, menuProgress, nextRound, playBotTurn, shuffle, type Difficulty, type GameState, type Rules } from '../src/engine';

interface Cfg { name: string; n: number; levels: Difficulty[] | 'mixte'; rules?: Partial<Rules> }
const games = +(process.argv[2] ?? 400);
const LEVELS: Difficulty[] = ['facile', 'moyen', 'difficile'];

/** Plats déjà réunis (sur 4) pour la région d'un joueur. */
const progress = (s: GameState, p: number) => Math.max(...menuProgress(s.players[p].hand, s.players[p].regions, s.players[p].bonus).map((m) => m.have.size + (s.players[p].hand.some((c) => c.kind === 'baguette') && m.have.size === 3 ? 1 : 0)));

function run(cfg: Cfg) {
  const rng = createRng(4242);
  const acc = {
    rounds: 0, turns: 0, turnsSq: 0, gamesRounds: 0, longRounds: 0, shortRounds: 0,
    nearMiss: 0, lastService: 0, lateWin: 0, ties: 0,
    stagnation: 0, stagnationMax: 0, deadTurns: 0, playerTurns: 0, gainTurns: 0, lossTurns: 0,
    effects: 0, denunciations: 0, correctDen: 0, vMoves: 0, marketMoves: 0, moves: 0,
    leadChanges: 0, comeback: 0, firstRoundWinnerWins: 0, closeFinish: 0, sweep: 0,
    wins: {} as Record<string, number>, seats: {} as Record<string, number>, gamesPlayed: 0,
    junkFree: 0, tight: 0, levelSeats: {} as Record<string, number>,
  };
  for (let g = 0; g < games; g++) {
    const levels = cfg.levels === 'mixte' ? shuffle(rng, Array.from({ length: cfg.n }, (_, i) => LEVELS[(i + g) % 3])) : cfg.levels;
    const s = createGame(levels.map((d, i) => ({ name: `J${i}`, isHuman: false, difficulty: d })), rng, { rules: cfg.rules });
    for (const lv of levels) acc.levelSeats[lv] = (acc.levelSeats[lv] ?? 0) + 1;
    let leader = -1, firstRoundWinner = -1;
    const streak = Array(cfg.n).fill(0);
    let roundTurns = 0, guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 30000) {
      if (s.phase === 'roundOver') {
        nextRound(s, rng);
        streak.fill(0);
        roundTurns = 0;
        continue;
      }
      const before = s.players.map((_, p) => progress(s, p));
      const hist = s.history.length;
      const round = s.roundNumber;
      // Choix « libres » : au moins 2 cartes sans valeur (hors région) => décision facile.
      for (let p = 0; p < cfg.n; p++) {
        const me = s.players[p];
        const junk = me.hand.filter((c) => c.kind === 'dish' && !me.regions.includes(c.region)).length;
        if (junk >= 4) acc.junkFree++;
        if (junk <= 1) acc.tight++;
      }
      playBotTurn(s, rng);
      roundTurns++;
      const h = s.history.slice(hist);
      for (const r of h) {
        if (r.denunciation) { acc.denunciations++; if (r.denunciation.correct) acc.correctDen++; }
        for (const m of r.moves) { acc.moves++; if (m.mode === 'market') acc.marketMoves++; if (m.mode === 'effect') acc.effects++; if (m.card.kind === 'vaisselle' && m.mode === 'pass') acc.vMoves++; }
      }
      const phase = s.phase as string;
      if (s.roundNumber === round && phase !== 'roundOver' && phase !== 'gameOver') {
        for (let p = 0; p < cfg.n; p++) {
          const now = progress(s, p);
          acc.playerTurns++;
          if (now > before[p]) { acc.gainTurns++; streak[p] = 0; }
          else { if (now < before[p]) acc.lossTurns++; streak[p]++; acc.deadTurns++; acc.stagnationMax = Math.max(acc.stagnationMax, streak[p]); }
        }
        continue;
      }
      // Fin de manche.
      const r = s.lastRound!;
      acc.rounds++;
      acc.turns += r.turns; acc.turnsSq += r.turns ** 2;
      if (r.turns > 30) acc.longRounds++;
      if (r.turns <= 5) acc.shortRounds++;
      if (r.tieBreak !== 'none') acc.ties++;
      if (r.lateAnnouncers.length || (r.announcers.length && s.rules.lastService)) acc.lastService++;
      if (r.winner !== null && r.lateAnnouncers.includes(r.winner)) acc.lateWin++;
      // Suspense : au moins un perdant était à 1 plat du but (3/4).
      if (r.winner !== null && s.players.some((_, p) => p !== r.winner && progress(s, p) >= 3)) acc.nearMiss++;
      if (firstRoundWinner < 0 && r.winner !== null) firstRoundWinner = r.winner;
      const stars = s.players.map((p) => p.etoiles);
      const top = Math.max(...stars);
      const leaders = stars.map((x, i) => (x === top ? i : -1)).filter((i) => i >= 0);
      const newLeader = leaders.length === 1 ? leaders[0] : -1;
      if (newLeader >= 0 && leader >= 0 && newLeader !== leader) acc.leadChanges++;
      if (newLeader >= 0) leader = newLeader;
      if (phase === 'gameOver') {
        const w = s.winner!;
        acc.gamesPlayed++;
        acc.gamesRounds += s.roundNumber;
        acc.wins[levels[w]] = (acc.wins[levels[w]] ?? 0) + 1;
        acc.seats[w] = (acc.seats[w] ?? 0) + 1;
        if (w === firstRoundWinner) acc.firstRoundWinnerWins++;
        const others = stars.filter((_, i) => i !== w);
        if (Math.max(...others) >= 2) acc.closeFinish++;
        if (Math.max(...others) === 0) acc.sweep++;
      }
      (s as unknown as { _hist?: number[][] })._hist = [...((s as unknown as { _hist?: number[][] })._hist ?? []), stars];
      if (phase === 'gameOver') {
        const hs = (s as unknown as { _hist: number[][] })._hist;
        const w = s.winner!;
        if (hs.some((st) => st.some((x, i) => i !== w && x > st[w]))) acc.comeback++;
      }
    }
  }
  const pct = (x: number, d: number) => +(100 * x / Math.max(1, d)).toFixed(1);
  const avg = acc.turns / acc.rounds;
  return {
    config: cfg.name,
    'tours/manche': +avg.toFixed(1),
    'écart-type tours': +Math.sqrt(acc.turnsSq / acc.rounds - avg * avg).toFixed(1),
    'manches/partie': +(acc.gamesRounds / acc.gamesPlayed).toFixed(1),
    'tours/partie': +(acc.turns / acc.gamesPlayed).toFixed(0),
    '% manches >30 tours': pct(acc.longRounds, acc.rounds),
    '% manches ≤5 tours': pct(acc.shortRounds, acc.rounds),
    '% tours où on progresse': pct(acc.gainTurns, acc.playerTurns),
    '% tours où on recule': pct(acc.lossTurns, acc.playerTurns),
    'plus longue stagnation': acc.stagnationMax,
    '% choix faciles (≥4 cartes inutiles)': pct(acc.junkFree, acc.playerTurns + acc.rounds * cfg.n),
    '% choix serrés (≤1 carte inutile)': pct(acc.tight, acc.playerTurns + acc.rounds * cfg.n),
    '% manches avec un perdant à 3/4': pct(acc.nearMiss, acc.rounds),
    '% victoires au Dernier service': pct(acc.lateWin, acc.rounds),
    '% départages': pct(acc.ties, acc.rounds),
    'effets joués/manche': +(acc.effects / acc.rounds).toFixed(2),
    'dénonciations/manche': +(acc.denunciations / acc.rounds).toFixed(2),
    '% dénonciations justes': pct(acc.correctDen, acc.denunciations),
    'Vaisselle passée/manche': +(acc.vMoves / acc.rounds).toFixed(1),
    '% coups au Marché': pct(acc.marketMoves, acc.moves),
    'changements de leader/partie': +(acc.leadChanges / acc.gamesPlayed).toFixed(2),
    '% vainqueur mené à un moment': pct(acc.comeback, acc.gamesPlayed),
    '% gagnant de la 1re manche gagne': pct(acc.firstRoundWinnerWins, acc.gamesPlayed),
    '% fins serrées (2e à 2⭐)': pct(acc.closeFinish, acc.gamesPlayed),
    '% fessées (3-0)': pct(acc.sweep, acc.gamesPlayed),
    'victoires par niveau %': Object.fromEntries(Object.entries(acc.wins).map(([k, v]) => [k, pct(v, acc.levelSeats[k])])),
    'victoires par place %': Object.fromEntries(Object.entries(acc.seats).map(([k, v]) => [k, pct(v, acc.gamesPlayed)])),
  };
}

const configs: Cfg[] = [
  { name: 'Duel 2j moyen', n: 2, levels: ['moyen', 'moyen'] },
  { name: 'Duel 2j mixte', n: 2, levels: 'mixte' },
  { name: '3j moyen', n: 3, levels: ['moyen', 'moyen', 'moyen'] },
  { name: '3j mixte', n: 3, levels: 'mixte' },
  { name: '4j moyen', n: 4, levels: ['moyen', 'moyen', 'moyen', 'moyen'] },
  { name: '4j mixte', n: 4, levels: 'mixte' },
  { name: '4j difficile', n: 4, levels: ['difficile', 'difficile', 'difficile', 'difficile'] },
  { name: '4j 1 difficile vs 3 faciles', n: 4, levels: ['difficile', 'facile', 'facile', 'facile'] },
  { name: '4j règles v3 (sans v4)', n: 4, levels: 'mixte', rules: { effects: { demitour: 2, troc: 2 }, blindAnnounce: false, lastService: false, revealToDenounce: false, openMarket: false, commande: 'aucune', dishOfDay: false } },
];
const out = configs.map(run);
const keys = Object.keys(out[0]).filter((k) => k !== 'config');
console.log(['indicateur', ...out.map((o) => o.config)].join('\t'));
for (const k of keys) console.log([k, ...out.map((o) => JSON.stringify((o as Record<string, unknown>)[k]))].join('\t'));
