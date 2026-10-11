// Note /100 du jeu par configuration (barème figé de src/sim/fun.ts) : npm run score -- [parties]
import { measure, naiveWinRate, ruleModules, rulesOf, score } from '../src/sim/fun';
const games = +(process.argv[2] ?? 300);
const rules = rulesOf({});
const res: Record<string, number> = {};
for (const n of [2, 3, 4]) {
  const st = measure(n, rules, games);
  const naive = naiveWinRate(n, rules, games);
  const sc = score(st, naive, rules, n);
  res[n] = sc.total;
  console.log(`\n=== ${n === 2 ? 'Duel' : n + ' joueurs'} : ${sc.total}/100 ===`);
  console.log(Object.entries(sc.parts).map(([k, v]) => `  ${k.padEnd(34)} ${v}`).join('\n'));
  console.log('  mesures', JSON.stringify(Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Math.round(v * 10) / 10]))), 'débutant', naive.toFixed(1));
  if (n === 4) console.log('  modules de règles', ruleModules(rules, n).length);
}
console.log(`\nMINIMUM : ${Math.min(...Object.values(res))}/100`);
