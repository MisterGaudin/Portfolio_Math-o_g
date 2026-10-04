import { simulate } from '../src/sim/simulate';
for (const n of [2, 3, 4]) {
  const s = simulate({ games: 400, players: n, difficulty: 'mixte', seed: 61 });
  const m = simulate({ games: 400, players: n, difficulty: 'moyen', seed: 62 });
  console.log(n, `tours ${s.avgTurns.toFixed(1)} | G/M ${s.menus.gastronomique.toFixed(0)}/${s.menus.maison.toFixed(0)} | F/M/D ${['facile','moyen','difficile'].map((d) => (s.gameWinByDifficulty as Record<string, number>)[d].toFixed(0)).join('/')} | dén ${s.denunciationsPerRound.toFixed(2)} | places ${m.gameWinBySeat.map((x) => x.toFixed(0)).join('/')} | sans fin ${s.pctCapped.toFixed(1)}% / ${m.pctCapped.toFixed(1)}% | >50 tours ${m.pctLongRounds.toFixed(0)}%`);
}
