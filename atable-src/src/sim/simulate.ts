// Simulation IA contre IA : statistiques d'équilibrage et diagnostic des règles.
import { createGame, createRng, nextRound, playBotTurn, shuffle, type Difficulty, type MenuType, type Phase, type Rules } from '../engine';

export type SimDifficulty = Difficulty | 'mixte';

export interface SimOptions {
  games: number;
  players: number;
  difficulty: SimDifficulty;
  seed?: number;
  /** Réglages de règles à tester. */
  rules?: Partial<Rules>;
}

export interface SimStats {
  games: number;
  players: number;
  difficulty: SimDifficulty;
  rounds: number;
  avgRoundsPerGame: number;
  avgTurns: number;
  /** Part des manches de plus de 50 tours. */
  pctLongRounds: number;
  /** Manches arrêtées par la sécurité (aucun gagnant). */
  pctCapped: number;
  /** Répartition des menus gagnants, en % des manches gagnées. */
  menus: Record<MenuType, number>;
  denunciationsPerRound: number;
  pctDenunciationsCorrect: number;
  avgVaisselleMoves: number;
  pctThanksToMarket: number;
  /** Part des coups joués au Marché. */
  pctMarketMoves: number;
  pctTieBreaks: number;
  /** % de parties gagnées selon la place (0 = premier joueur). */
  gameWinBySeat: number[];
  /** % de manches gagnées selon la place. */
  roundWinBySeat: number[];
  /** En mode mixte : % de parties gagnées par place tenue par ce niveau (attendu : 100 / joueurs). */
  gameWinByDifficulty: Partial<Record<Difficulty, number>>;
  warnings: string[];
}

const LEVELS: Difficulty[] = ['facile', 'moyen', 'difficile'];

/** Simule `games` parties complètes (jusqu'au Grand Chef). */
export function simulate(opts: SimOptions): SimStats {
  const { games, players: n, difficulty } = opts;
  const rng = createRng(opts.seed ?? 2026);
  const menus: Record<MenuType, number> = { gastronomique: 0, maison: 0, vole: 0 };
  const gameWins = Array(n).fill(0);
  const roundWins = Array(n).fill(0);
  const byLevel: Partial<Record<Difficulty, { games: number; wins: number }>> = {};
  let rounds = 0, won = 0, turns = 0, long = 0, capped = 0;
  let denunciations = 0, correct = 0, vaisselle = 0, market = 0, ties = 0, marketMoves = 0, moves = 0;

  for (let g = 0; g < games; g++) {
    // En mode mixte, les niveaux sont répartis au hasard autour de la table à chaque partie
    // (sinon on mesurerait l'effet des voisins plutôt que celui du niveau).
    const levels: Difficulty[] = difficulty === 'mixte' ? shuffle(rng, Array.from({ length: n }, (_, i) => LEVELS[(i + g) % 3])) : Array(n).fill(difficulty);
    const s = createGame(levels.map((d, i) => ({ name: `IA ${i + 1}`, isHuman: false, difficulty: d })), rng, { rules: opts.rules });
    // Nombre de places tenues par chaque niveau (pour un taux de victoire par place).
    for (const d of levels) (byLevel[d] ??= { games: 0, wins: 0 }).games += 1;

    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 100000) {
      if (s.phase === 'roundOver') {
        nextRound(s, rng);
        continue;
      }
      playBotTurn(s, rng);
      const last = s.history[s.history.length - 1];
      if (last) {
        moves += last.moves.length;
        marketMoves += last.moves.filter((m) => m.mode === 'market').length;
      }
      const phase = s.phase as Phase;
      if (phase === 'roundOver' || phase === 'gameOver') {
        const r = s.lastRound!;
        rounds++;
        turns += r.turns;
        if (r.turns > 50) long++;
        denunciations += s.stats.denunciations;
        correct += s.stats.correctDenunciations;
        vaisselle += s.stats.vaisselleMoves;
        if (r.winner === null) capped++;
        else {
          won++;
          roundWins[r.winner]++;
          menus[r.menu!.type]++;
          if (r.thanksToMarket) market++;
          if (r.tieBreak !== 'none') ties++;
        }
      }
    }
    if (s.winner !== null) {
      gameWins[s.winner]++;
      byLevel[levels[s.winner]]!.wins++;
    }
  }

  const pct = (a: number, b: number) => (b ? (100 * a) / b : 0);
  const stats: SimStats = {
    games,
    players: n,
    difficulty,
    rounds,
    avgRoundsPerGame: rounds / games,
    avgTurns: turns / rounds,
    pctLongRounds: pct(long, rounds),
    pctCapped: pct(capped, rounds),
    menus: Object.fromEntries(Object.entries(menus).map(([k, v]) => [k, pct(v, won)])) as Record<MenuType, number>,
    denunciationsPerRound: denunciations / rounds,
    pctDenunciationsCorrect: pct(correct, denunciations),
    avgVaisselleMoves: vaisselle / rounds,
    pctThanksToMarket: pct(market, won),
    pctMarketMoves: pct(marketMoves, moves),
    pctTieBreaks: pct(ties, won),
    gameWinBySeat: gameWins.map((w) => pct(w, games)),
    roundWinBySeat: roundWins.map((w) => pct(w, won)),
    gameWinByDifficulty:
      difficulty === 'mixte' ? Object.fromEntries(Object.entries(byLevel).sort(([a], [b]) => LEVELS.indexOf(a as Difficulty) - LEVELS.indexOf(b as Difficulty)).map(([d, v]) => [d, pct(v!.wins, v!.games)])) : {},
    warnings: [],
  };
  stats.warnings = diagnose(stats);
  return stats;
}

/** Repère les règles qui semblent déséquilibrées. */
export function diagnose(s: SimStats): string[] {
  const w: string[] = [];
  const f = (x: number) => x.toFixed(0);
  if (s.menus.vole > 40) w.push(`Le menu Volé gagne ${f(s.menus.vole)} % des manches : viser ses propres régions rapporte peu.`);
  if (s.avgTurns > 40) w.push(`Manches longues : ${s.avgTurns.toFixed(1)} tours en moyenne (objectif ≈ 10-30).`);
  if (s.avgTurns < 3) w.push(`Manches très courtes : ${s.avgTurns.toFixed(1)} tours en moyenne, le hasard de la donne décide trop.`);
  if (s.pctCapped > 1) w.push(`${f(s.pctCapped)} % des manches n'ont jamais fini (arrêt de sécurité).`);
  if (s.pctLongRounds > 20) w.push(`${f(s.pctLongRounds)} % des manches dépassent 50 tours.`);
  const expected = 100 / s.players;
  s.gameWinBySeat.forEach((v, i) => {
    if (s.games >= 200 && Math.abs(v - expected) > Math.max(5, expected * 0.25))
      w.push(`Place n°${i + 1} : ${f(v)} % de victoires pour ${f(expected)} % attendus.`);
  });
  if (s.denunciationsPerRound > 0.05 && s.pctDenunciationsCorrect < 35) w.push(`Les dénonciations échouent souvent (${f(s.pctDenunciationsCorrect)} % de réussite) : c'est risqué de dénoncer.`);
  if (s.denunciationsPerRound > 0.05 && s.pctDenunciationsCorrect > 85) w.push(`Les dénonciations réussissent presque toujours (${f(s.pctDenunciationsCorrect)} %) : les régions sont trop faciles à deviner.`);
  if (s.pctTieBreaks > 25) w.push(`${f(s.pctTieBreaks)} % des manches se jouent au départage.`);
  if (s.pctThanksToMarket > 60) w.push(`Le Marché fait gagner ${f(s.pctThanksToMarket)} % des manches : il pèse peut-être trop.`);
  return w;
}
