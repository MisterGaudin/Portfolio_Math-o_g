// Un débutant « naïf » (garde sa région, donne le reste, commande au hasard) contre des IA difficiles.
// npm run naive -- [parties]
import { naiveWinRate, rulesOf } from '../src/sim/fun';
const games = +(process.argv[2] ?? 300);
for (const n of [2, 3, 4]) console.log(`${n} joueurs : le débutant gagne ${naiveWinRate(n, rulesOf({}), games).toFixed(1)} % (attendu ${(100 / n).toFixed(0)} %)`);
