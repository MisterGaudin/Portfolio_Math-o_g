// Simulation en ligne de commande : npm run sim -- [parties] [joueurs] [difficulté]
// Exemple : npm run sim -- 1000 4 difficile
import { simulate } from '../src/sim/simulate';
import type { Difficulty } from '../src/engine';

const [games = '1000', players = '4', difficulty = 'moyen'] = process.argv.slice(2);
const t0 = Date.now();
const s = simulate({ games: +games, players: +players, difficulty: difficulty as Difficulty, seed: 2026 });
const f = (x: number, d = 1) => x.toFixed(d);

console.log(`\nBOULET ! — ${s.games} parties, ${s.players} joueurs (${difficulty}) en ${Date.now() - t0} ms`);
console.log(`Manches simulées           : ${s.rounds} (${f(s.avgRoundsPerGame)} par partie)`);
console.log(`Durée moyenne d'une manche : ${f(s.avgTurns)} tours`);
console.log(`Passages du Boulet/manche  : ${f(s.avgBouletPasses, 2)}`);
console.log(`Boulet fini dans la pioche : ${f(s.pctBouletInPile)} % (${f(s.pctBouletInPileWhenShuffled)} % quand il y était mélangé)`);
console.log(`Victoires par position     : ${s.winRateByPosition.map((w, i) => `#${i + 1} ${f(w)} %`).join('  ')}`);
console.log(`Boulet officiel            : gagne ${f(s.officialWinRate)} % (${s.officialRounds} manches), le garde ${f(s.officialStuckRate)} %`);
console.log(`Points du porteur du Boulet: ${f(s.avgPointsHolder)} vs ${f(s.avgPointsOtherLosers)} pour les autres perdants`);
console.log('\nDiagnostic :');
for (const w of s.warnings) console.log(` • ${w}`);
