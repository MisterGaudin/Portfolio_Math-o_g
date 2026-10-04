// Page /sim : N parties IA contre IA à 2, 3 et 4 joueurs, statistiques et diagnostic.
import { useState } from 'react';
import { DEFAULT_RULES, MENU_LABELS, type MenuType, type Rules } from '../engine';
import { simulate, type SimDifficulty, type SimStats } from './simulate';

const LIMITS: { id: Rules['denounceLimit']; label: string }[] = [
  { id: 'protege', label: 'Un joueur démasqué est protégé (règle du jeu)' },
  { id: 'unique', label: 'Une seule dénonciation par joueur et par manche' },
  { id: 'aucune', label: 'Aucune limite' },
];

export function SimPage() {
  const [games, setGames] = useState(1000);
  const [difficulty, setDifficulty] = useState<SimDifficulty>('moyen');
  const [limit, setLimit] = useState<Rules['denounceLimit']>(DEFAULT_RULES.denounceLimit);
  const [headStart, setHeadStart] = useState(DEFAULT_RULES.headStart);
  const [results, setResults] = useState<SimStats[]>([]);
  const [running, setRunning] = useState<number | null>(null);

  function run() {
    setResults([]);
    const seed = (Date.now() >>> 0) % 1e9;
    // Une configuration à la fois, pour garder la page réactive.
    const step = (n: number, acc: SimStats[]) => {
      if (n > 4) return setRunning(null);
      setRunning(n);
      setTimeout(() => {
        const s = simulate({ games, players: n, difficulty, seed: seed + n, rules: { denounceLimit: limit, headStart } });
        const next = [...acc, s];
        setResults(next);
        step(n + 1, next);
      }, 30);
    };
    step(2, []);
  }

  const f = (x: number, d = 1) => x.toFixed(d);
  const rows: { label: string; value: (s: SimStats) => string }[] = [
    { label: 'Manches simulées', value: (s) => `${s.rounds} (${f(s.avgRoundsPerGame)}/partie)` },
    { label: 'Tours moyens par manche', value: (s) => f(s.avgTurns) },
    { label: 'Manches > 50 tours', value: (s) => `${f(s.pctLongRounds)} %` },
    ...(['gastronomique', 'maison', 'vole'] as MenuType[]).map((m) => ({ label: `Gagnées en ${MENU_LABELS[m]}`, value: (s: SimStats) => `${f(s.menus[m])} %` })),
    { label: 'Dénonciations par manche', value: (s) => f(s.denunciationsPerRound, 2) },
    { label: 'Dénonciations réussies', value: (s) => (s.denunciationsPerRound ? `${f(s.pctDenunciationsCorrect)} %` : '—') },
    { label: 'Passages de la Vaisselle / manche', value: (s) => f(s.avgVaisselleMoves, 2) },
    { label: 'Manches gagnées grâce au Marché', value: (s) => `${f(s.pctThanksToMarket)} %` },
    { label: 'Coups joués au Marché', value: (s) => `${f(s.pctMarketMoves)} %` },
    { label: 'Manches au départage', value: (s) => `${f(s.pctTieBreaks)} %` },
    { label: 'Victoires selon la place', value: (s) => s.gameWinBySeat.map((w, i) => `#${i + 1} ${f(w, 0)}`).join(' · ') + ' %' },
    ...(difficulty === 'mixte'
      ? [{ label: 'Victoires par place, selon le niveau', value: (s: SimStats) => Object.entries(s.gameWinByDifficulty).map(([d, w]) => `${d} ${f(w!, 0)} %`).join(' · ') }]
      : []),
  ];

  return (
    <div className="screen sim">
      <h1>Simulation</h1>
      <p className="muted">Des ordinateurs jouent des parties complètes (jusqu’à 3 Étoiles) entre eux, à 2, 3 et 4 joueurs.</p>
      <label className="field">
        <span>Nombre de parties</span>
        <input type="number" min={10} max={20000} step={100} value={games} onChange={(e) => setGames(Math.max(10, +e.target.value || 0))} />
      </label>
      <div className="field">
        <span>Niveau des IA</span>
        <div className="segmented">
          {(['facile', 'moyen', 'difficile', 'mixte'] as SimDifficulty[]).map((d) => (
            <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Dénonciations</span>
        <select value={limit} onChange={(e) => setLimit(e.target.value as Rules['denounceLimit'])}>
          {LIMITS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Coup de pouce à la donne (cartes garanties par région)</span>
        <select value={headStart} onChange={(e) => setHeadStart(+e.target.value)}>
          {[0, 1, 2].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'Aucun (donne au hasard)' : `${n} carte${n > 1 ? 's' : ''} de chaque région`}
              {n === DEFAULT_RULES.headStart ? ' — règle du jeu' : ''}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-gold block" disabled={running !== null} onClick={run}>
        {running !== null ? `Simulation à ${running} joueurs…` : `Lancer ${games} parties × 3`}
      </button>

      {results.length > 0 && (
        <div className="sim-table-wrap">
          <table className="sim-table">
            <thead>
              <tr>
                <th />
                {results.map((s) => (
                  <th key={s.players}>{s.players} joueurs</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {results.map((s) => (
                    <td key={s.players}>{r.value(s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results.length > 0 && (
        <div className="panel">
          <h3>Diagnostic</h3>
          {results.every((s) => s.warnings.length === 0) && <p>Rien d’anormal détecté.</p>}
          {results.map((s) =>
            s.warnings.map((w) => (
              <p key={s.players + w} className="warn">
                ⚠ <b>{s.players} joueurs :</b> {w}
              </p>
            )),
          )}
        </div>
      )}
      <a className="sim-link" href={import.meta.env.BASE_URL}>
        ← Retour au jeu
      </a>
    </div>
  );
}
