// Note /100 du jeu par configuration (barème figé de src/sim/fun.ts) : npm run score -- [parties]
import { measure, naiveWinRate, ruleModules, rulesOf, score } from '../src/sim/fun';
import type { Rules } from '../src/engine';
const games = +(process.argv[2] ?? 300);
/** Variante à tester (JSON en 2e argument), sinon les règles par défaut. */
const rules = rulesOf(JSON.parse(process.argv[3] ?? '{}') as Partial<Rules>);
const res: Record<string, number> = {};
for (const n of (process.argv[4] ?? '2,3,4').split(',').map(Number)) {
  const st = measure(n, rules, games, process.env.SEED ? +process.env.SEED : undefined);
  const naive = naiveWinRate(n, rules, games);
  const sc = score(st, naive, rules, n);
  res[n] = sc.total;
  console.log(`\n=== ${n === 2 ? 'Duel' : n + ' joueurs'} : ${sc.total}/100 ===`);
  console.log(Object.entries(sc.parts).map(([k, v]) => `  ${k.padEnd(34)} ${v}`).join('\n'));
  console.log('  mesures', JSON.stringify(Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Math.round(v * 10) / 10]))), 'débutant', naive.toFixed(1));
  if (n === 4) console.log('  modules de règles', ruleModules(rules, n).length);
}
console.log(`\nMINIMUM : ${Math.min(...Object.values(res))}/100`);
