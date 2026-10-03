// Page /sim : N parties IA contre IA et diagnostic d'équilibrage.
import { useEffect, useRef, useState } from 'react';
import type { Difficulty } from '../engine';
import { createSimulation, type SimStats } from './simulate';

export function SimPage() {
  const [games, setGames] = useState(1000);
  const [players, setPlayers] = useState(4);
  const [difficulty, setDifficulty] = useState<Difficulty>('moyen');
  const [progress, setProgress] = useState<number | null>(null);
  const [stats, setStats] = useState<SimStats | null>(null);
  const [ms, setMs] = useState(0);
  const cancel = useRef(false);

  useEffect(() => () => void (cancel.current = true), []);

  function run() {
    cancel.current = false;
    const sim = createSimulation({ games, players, difficulty, seed: (Date.now() >>> 0) % 1e9 });
    const t0 = performance.now();
    setStats(null);
    setProgress(0);
    // Par paquets, pour garder la page réactive et afficher la progression.
    const step = () => {
      if (cancel.current) return setProgress(null);
      sim.run(Math.max(5, Math.round(games / 100)));
      setProgress(sim.progress);
      setStats(sim.stats());
      if (sim.done) {
        setMs(performance.now() - t0);
        setProgress(null);
      } else setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  const f = (x: number, d = 1) => x.toFixed(d);
  const fair = 100 / players;

  return (
    <div className="screen sim">
      <h1>Simulation</h1>
      <p className="hint">Des ordinateurs jouent des parties complètes (300 points) entre eux.</p>

      <label className="field">
        <span>Nombre de parties</span>
        <input type="number" min={10} max={20000} step={100} value={games} onChange={(e) => setGames(Math.max(10, +e.target.value || 0))} />
      </label>
      <div className="field">
        <span>Joueurs</span>
        <div className="segmented">
          {[2, 3, 4].map((n) => (
            <button key={n} className={players === n ? 'on' : ''} onClick={() => setPlayers(n)}>
              <b>{n}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Niveau des IA</span>
        <div className="segmented">
          {(['facile', 'moyen', 'difficile'] as const).map((d) => (
            <button key={d} className={difficulty === d ? 'on' : ''} onClick={() => setDifficulty(d)}>
              <b>{d}</b>
            </button>
          ))}
        </div>
      </div>

      {progress === null ? (
        <button className="btn huge primary" onClick={run}>
          Lancer
        </button>
      ) : (
        <>
          <div className="progress">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
          <button className="btn big" onClick={() => (cancel.current = true)}>
            Arrêter
          </button>
        </>
      )}

      {stats && (
        <>
          <table className="scores stats">
            <tbody>
              <tr>
                <td>Parties / manches</td>
                <td>
                  {stats.games} / {stats.rounds} ({f(stats.avgRoundsPerGame)} par partie)
                </td>
              </tr>
              <tr>
                <td>Durée moyenne d’une manche</td>
                <td>{f(stats.avgTurns)} tours</td>
              </tr>
              <tr>
                <td>Passages du Boulet par manche</td>
                <td>{f(stats.avgBouletPasses, 2)}</td>
              </tr>
              <tr>
                <td>Boulet fini dans la pioche</td>
                <td>
                  {f(stats.pctBouletInPile)} % <small>({f(stats.pctBouletInPileWhenShuffled)} % quand il y était mélangé)</small>
                </td>
              </tr>
              <tr>
                <td>Victoire selon la position de départ</td>
                <td>
                  {stats.winRateByPosition.map((w, i) => (
                    <div key={i}>
                      {i === 0 ? '1er (commence)' : `${i + 1}e`} : <b className={Math.abs(w - fair) > fair * 0.3 ? 'bad' : ''}>{f(w)} %</b>
                    </div>
                  ))}
                  <small>équilibre : {f(fair)} %</small>
                </td>
              </tr>
              <tr>
                <td>Victoire du Boulet officiel (manche suivante)</td>
                <td>
                  <b>{f(stats.officialWinRate)} %</b> <small>sur {stats.officialRounds} manches · le garde jusqu’au bout {f(stats.officialStuckRate)} %</small>
                </td>
              </tr>
              <tr>
                <td>Points du porteur du Boulet</td>
                <td>
                  {f(stats.avgPointsHolder)} <small>vs {f(stats.avgPointsOtherLosers)} pour les autres perdants</small>
                </td>
              </tr>
            </tbody>
          </table>
          <h2>Diagnostic</h2>
          <ul className="warnings">
            {stats.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {ms > 0 && <p className="hint">Calculé en {f(ms / 1000, 1)} s</p>}
        </>
      )}
      <a className="sim-link" href="/">
        ← Retour au jeu
      </a>
    </div>
  );
}
