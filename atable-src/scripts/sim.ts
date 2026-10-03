// Simulation en ligne de commande : npm run sim -- [parties] [niveau] [variante] [joueurs…]
// Exemples : npm run sim            (1000 parties, moyen, règle officielle, à 2, 3 et 4 joueurs)
//            npm run sim -- 500 difficile deuxRegions 4
import type { MenuDuJourRule } from '../src/engine';
import { simulate, type SimDifficulty } from '../src/sim/simulate';

const [games = '1000', difficulty = 'moyen', variant = 'standard', ...players] = process.argv.slice(2);
const counts = players.length ? players.map(Number) : [2, 3, 4];
const f = (x: number, d = 1) => x.toFixed(d);

for (const n of counts) {
  const t0 = Date.now();
  const s = simulate({ games: +games, players: n, difficulty: difficulty as SimDifficulty, seed: 2026, menuDuJour: variant as MenuDuJourRule });
  console.log(`\nÀ TABLE ! — ${s.games} parties à ${n} joueurs (${difficulty}, Menu du Jour : ${variant}) en ${Date.now() - t0} ms`);
  console.log(`Manches                   : ${s.rounds} (${f(s.avgRoundsPerGame)} par partie)`);
  console.log(`Tours moyens par manche   : ${f(s.avgTurns)}  (>15 tours : ${f(s.pctLongRounds)} %, sans fin : ${f(s.pctCapped)} %)`);
  console.log(`Menus gagnants            : Gastro ${f(s.menus.gastronomique)} %  Maison ${f(s.menus.maison)} %  Volé ${f(s.menus.vole)} %  Jour ${f(s.menus.jour)} %`);
  console.log(`Dénonciations             : ${f(s.denunciationsPerRound, 2)} par manche, ${f(s.pctDenunciationsCorrect)} % réussies`);
  console.log(`Passages de la Vaisselle  : ${f(s.avgVaisselleMoves, 2)} par manche`);
  console.log(`Gagnées grâce au Marché   : ${f(s.pctThanksToMarket)} %  (coups au Marché : ${f(s.pctMarketMoves)} %)`);
  console.log(`Départages                : ${f(s.pctTieBreaks)} %`);
  console.log(`Victoires par place       : ${s.gameWinBySeat.map((w, i) => `#${i + 1} ${f(w)} %`).join('  ')}`);
  if (difficulty === 'mixte') console.log(`Victoires par niveau      : ${Object.entries(s.gameWinByDifficulty).map(([d, w]) => `${d} ${f(w!)} %`).join('  ')}`);
  for (const w of s.warnings) console.log(`  ⚠ ${w}`);
}
