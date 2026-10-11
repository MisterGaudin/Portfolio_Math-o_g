// Stratégie « naïve » d'un débutant contre les IA : garder sa région, passer le reste, prendre la défausse si utile.
import { activePlayers, aiAnnounce, aiChooseAll, aiDenounce, aiOrder, aiReveal, aiShow, aiTake, announceableMenu, checkAnnounce, createGame, createRng, denounce, marketReceivers, mustShow, nextRound, passCountOf, placeOrder, resolveAnnouncements, resolveExchange, showCard, submitChoice, visibleDiscard, type Difficulty } from '../src/engine';
for (const [n, lv] of [[2, 'difficile'], [2, 'moyen'], [3, 'difficile'], [4, 'difficile'], [4, 'moyen']] as [number, Difficulty][]) {
  let wins = 0; const G = 300;
  for (let g = 0; g < G; g++) {
    const rng = createRng(1000 + g);
    const s = createGame(Array.from({ length: n }, (_, i) => ({ name: 'J' + i, isHuman: i === 0, difficulty: lv })), rng);
    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 5000) {
      if (s.phase === 'roundOver') { nextRound(s, rng); continue; }
      for (const p of activePlayers(s)) if (mustShow(s, p)) showCard(s, p, aiShow(s, p, rng)!);
      for (let p = 1; p < n; p++) { const d = aiDenounce(s, p); if (d) { denounce(s, p, d.target, d.region, rng, undefined, { reveal: aiReveal(s, p) }); break; } }
      for (const p of activePlayers(s)) if (p !== 0) { const w = aiOrder(s, p); if (w) placeOrder(s, p, { cardId: w }); submitChoice(s, p, aiChooseAll(s, p, rng)); }
      const me = s.players[0];
      let take: 'pioche' | 'defausse' = 'pioche';
      if (activePlayers(s).includes(0)) {
        const cards = [...me.hand.filter((c) => c.kind === 'vaisselle'), ...me.hand.filter((c) => c.kind === 'dish' && !me.regions.includes(c.region)), ...me.hand.filter((c) => c.kind === 'effect'), ...me.hand.filter((c) => c.kind === 'dish' && me.regions.includes(c.region) && me.bonus[0] === c.course)].slice(0, passCountOf(s));
        const picks = cards.map((c) => ({ cardId: c.id, mode: (c.kind === 'effect' || (s.event === 'fromagesBloques' && c.kind === 'dish' && c.course === 'fromage') ? 'market' : 'pass') as 'pass' }));
        submitChoice(s, 0, { ...picks[0], extra: picks.slice(1) });
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
  console.log(`${n} joueurs vs ${lv} : débutant naïf gagne ${(100 * wins / G).toFixed(1)} % (attendu ${(100 / n).toFixed(0)} %)`);
}
