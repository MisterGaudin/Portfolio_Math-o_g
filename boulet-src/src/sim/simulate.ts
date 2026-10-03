// Simulation IA contre IA pour tester l'équilibrage des règles.
// Pur TypeScript : utilisé par la page /sim et par `npm run sim`.
import { applyAction, chooseAction, createGame, createRng, nextRound, type Difficulty, type GameState, type Rng } from '../engine';

export interface SimOptions {
  games: number;
  players: number;
  difficulty: Difficulty;
  seed: number;
}

export interface SimStats {
  games: number;
  rounds: number;
  players: number;
  avgRoundsPerGame: number;
  avgTurns: number;
  avgBouletPasses: number;
  /** % de manches où le Boulet termine dans la pioche. */
  pctBouletInPile: number;
  /** Même chose, uniquement pour les manches où il est parti de la pioche. */
  pctBouletInPileWhenShuffled: number;
  /** Taux de victoire (par manche) selon la position par rapport au premier joueur (0 = commence). */
  winRateByPosition: number[];
  /** Taux de victoire du Boulet officiel dans la manche qui suit. */
  officialWinRate: number;
  officialRounds: number;
  /** % de manches où le Boulet officiel a encore le Boulet à la fin. */
  officialStuckRate: number;
  /** Points moyens marqués par celui qui finit avec le Boulet / par les autres perdants. */
  avgPointsHolder: number;
  avgPointsOtherLosers: number;
  warnings: string[];
}

interface Acc {
  games: number;
  rounds: number;
  turns: number;
  passes: number;
  inPile: number;
  shuffledRounds: number;
  inPileShuffled: number;
  wins: number[];
  officialRounds: number;
  officialWins: number;
  officialStuck: number;
  holderPts: number;
  holderN: number;
  otherPts: number;
  otherN: number;
}

/** Simulation incrémentale : `run(k)` joue k parties (pour garder l'UI fluide). */
export function createSimulation(opts: SimOptions) {
  const rng: Rng = createRng(opts.seed);
  const acc: Acc = {
    games: 0,
    rounds: 0,
    turns: 0,
    passes: 0,
    inPile: 0,
    shuffledRounds: 0,
    inPileShuffled: 0,
    wins: Array(opts.players).fill(0),
    officialRounds: 0,
    officialWins: 0,
    officialStuck: 0,
    holderPts: 0,
    holderN: 0,
    otherPts: 0,
    otherN: 0,
  };

  const playOne = () => {
    const players = Array.from({ length: opts.players }, (_, i) => ({
      name: `Bot ${i + 1}`,
      isHuman: false,
      difficulty: opts.difficulty,
    }));
    const s: GameState = createGame(players, rng);
    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 200000) {
      if (s.phase === 'roundOver') nextRound(s, rng);
      else applyAction(s, s.current, chooseAction(s, rng), rng);
    }
    acc.games += 1;
    for (const r of s.results) {
      const n = opts.players;
      acc.rounds += 1;
      acc.turns += r.turns;
      acc.passes += r.bouletPasses;
      if (r.bouletHolder === null) acc.inPile += 1;
      if (r.officialBoulet === null) {
        acc.shuffledRounds += 1;
        if (r.bouletHolder === null) acc.inPileShuffled += 1;
      } else {
        acc.officialRounds += 1;
        if (r.winner === r.officialBoulet) acc.officialWins += 1;
        if (r.bouletHolder === r.officialBoulet) acc.officialStuck += 1;
      }
      acc.wins[(r.winner - r.starter + n) % n] += 1;
      r.points.forEach((pts, i) => {
        if (i === r.winner) return;
        if (i === r.bouletHolder) {
          acc.holderPts += pts;
          acc.holderN += 1;
        } else {
          acc.otherPts += pts;
          acc.otherN += 1;
        }
      });
    }
  };

  return {
    get done() {
      return acc.games >= opts.games;
    },
    get progress() {
      return acc.games / opts.games;
    },
    run(count: number) {
      for (let i = 0; i < count && acc.games < opts.games; i++) playOne();
    },
    stats: (): SimStats => computeStats(acc, opts.players),
  };
}

export function simulate(opts: SimOptions): SimStats {
  const sim = createSimulation(opts);
  sim.run(opts.games);
  return sim.stats();
}

const pct = (a: number, b: number) => (b === 0 ? 0 : (100 * a) / b);

function computeStats(acc: Acc, n: number): SimStats {
  const stats: SimStats = {
    games: acc.games,
    rounds: acc.rounds,
    players: n,
    avgRoundsPerGame: acc.rounds / Math.max(1, acc.games),
    avgTurns: acc.turns / Math.max(1, acc.rounds),
    avgBouletPasses: acc.passes / Math.max(1, acc.rounds),
    pctBouletInPile: pct(acc.inPile, acc.rounds),
    pctBouletInPileWhenShuffled: pct(acc.inPileShuffled, acc.shuffledRounds),
    winRateByPosition: acc.wins.map((w) => pct(w, acc.rounds)),
    officialWinRate: pct(acc.officialWins, acc.officialRounds),
    officialRounds: acc.officialRounds,
    officialStuckRate: pct(acc.officialStuck, acc.officialRounds),
    avgPointsHolder: acc.holderPts / Math.max(1, acc.holderN),
    avgPointsOtherLosers: acc.otherPts / Math.max(1, acc.otherN),
    warnings: [],
  };
  stats.warnings = diagnose(stats);
  return stats;
}

/** Signale les règles qui semblent déséquilibrées d'après les statistiques. */
export function diagnose(s: SimStats): string[] {
  const w: string[] = [];
  if (s.rounds < 50) return ['Pas assez de manches simulées pour conclure.'];
  const fair = 100 / s.players;

  const first = s.winRateByPosition[0];
  if (first > fair * 1.3)
    w.push(
      `Avantage au premier joueur : il gagne ${first.toFixed(1)} % des manches (équilibre : ${fair.toFixed(1)} %). ` +
        `Piste : faire commencer le joueur à gauche du donneur, ou distribuer 8 cartes au premier.`,
    );
  const last = s.winRateByPosition[s.players - 1];
  if (last < fair * 0.7)
    w.push(`Le dernier à jouer est désavantagé (${last.toFixed(1)} % de victoires).`);

  if (s.officialRounds > 20) {
    if (s.officialWinRate < fair * 0.5)
      w.push(
        `Le Boulet officiel ne gagne que ${s.officialWinRate.toFixed(1)} % des manches suivantes (équilibre : ${fair.toFixed(1)} %) : ` +
          `l'échange + le Boulet forment un cercle vicieux. Piste : n'échanger qu'1 carte, ou ne pas lui imposer le Boulet.`,
      );
    else if (s.officialWinRate > fair * 1.15)
      w.push(
        `Le Boulet officiel gagne ${s.officialWinRate.toFixed(1)} % des manches suivantes : commencer en premier compense trop la punition.`,
      );
    if (s.officialStuckRate > 60)
      w.push(
        `Le Boulet officiel garde le Boulet jusqu'au bout dans ${s.officialStuckRate.toFixed(0)} % des cas : ` +
          `les doubles sont trop rares pour s'en débarrasser. Piste : autoriser le don sur une carte action, ou un « double » couleur.`,
      );
  }
  if (s.pctBouletInPileWhenShuffled > 40)
    w.push(
      `Quand il est mélangé dans la pioche, le Boulet y reste ${s.pctBouletInPileWhenShuffled.toFixed(0)} % du temps : ` +
        `ces manches se jouent quasiment sans Boulet. Piste : le placer dans la moitié haute de la pioche.`,
    );
  if (s.avgBouletPasses < 0.3)
    w.push(`Le Boulet ne circule presque pas (${s.avgBouletPasses.toFixed(2)} passage par manche) : la règle du double est peu utilisée.`);
  if (s.avgBouletPasses > 3) w.push(`Le Boulet passe de main en main trop souvent (${s.avgBouletPasses.toFixed(1)} fois par manche) : effet « patate chaude ».`);
  if (s.avgTurns > 90) w.push(`Manches longues (${s.avgTurns.toFixed(0)} tours en moyenne) : risque d'ennui pour les enfants.`);
  if (s.avgTurns < 15) w.push(`Manches très courtes (${s.avgTurns.toFixed(0)} tours) : peu de place pour la stratégie.`);
  // Hors les 50 points du Boulet lui-même, le porteur ne devrait pas être écrasé par sa main.
  if (s.avgPointsHolder - 50 > s.avgPointsOtherLosers * 1.5)
    w.push(
      `Le porteur du Boulet finit avec une main bien plus lourde (${(s.avgPointsHolder - 50).toFixed(0)} pts hors Boulet, ` +
        `contre ${s.avgPointsOtherLosers.toFixed(0)}) : il est bloqué trop longtemps.`,
    );
  if (w.length === 0) w.push('Aucun déséquilibre flagrant détecté. 👍');
  return w;
}
