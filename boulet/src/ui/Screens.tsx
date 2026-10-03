// Écrans hors table : accueil, fin de manche, fin de partie.
import { motion } from 'framer-motion';
import { useState } from 'react';
import { gameWinners, type Difficulty, type GameState } from '../engine';
import { BouletArt } from './Art';
import { CardView } from './CardView';
import type { Setup } from './useGame';

const DIFFICULTIES: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'facile', label: 'Facile', hint: 'Les ordis jouent au hasard' },
  { id: 'moyen', label: 'Moyen', hint: 'Ils gardent leurs Jokers et visent le leader' },
  { id: 'difficile', label: 'Difficile', hint: 'Ils comptent les cartes…' },
];

export function Home({ initial, onStart, onRules }: { initial: Setup; onStart: (s: Setup) => void; onRules: () => void }) {
  const [setup, setSetup] = useState(initial);
  return (
    <div className="screen home">
      <motion.div className="logo" initial={{ rotate: -20, y: -40, opacity: 0 }} animate={{ rotate: 0, y: 0, opacity: 1 }}>
        <BouletArt size={120} />
        <h1>BOULET !</h1>
        <p className="tagline">Le jeu de défausse qui colle aux pieds</p>
      </motion.div>

      <label className="field">
        <span>Ton prénom</span>
        <input value={setup.name} maxLength={12} onChange={(e) => setSetup({ ...setup, name: e.target.value })} placeholder="Toi" />
      </label>

      <div className="field">
        <span>Nombre de joueurs</span>
        <div className="segmented">
          {[1, 2, 3].map((o) => (
            <button key={o} className={setup.opponents === o ? 'on' : ''} onClick={() => setSetup({ ...setup, opponents: o })}>
              <b>{o + 1}</b>
              <small>toi + {o} ordi{o > 1 ? 's' : ''}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Difficulté</span>
        <div className="segmented">
          {DIFFICULTIES.map((d) => (
            <button key={d.id} className={setup.difficulty === d.id ? 'on' : ''} onClick={() => setSetup({ ...setup, difficulty: d.id })}>
              <b>{d.label}</b>
            </button>
          ))}
        </div>
        <small className="hint">{DIFFICULTIES.find((d) => d.id === setup.difficulty)!.hint}</small>
      </div>

      <button className="btn huge primary" onClick={() => onStart(setup)}>
        Jouer
      </button>
      <button className="btn big" onClick={onRules}>
        Règles
      </button>
      <a className="sim-link" href="/sim">
        Mode simulation (équilibrage)
      </a>
    </div>
  );
}

function ScoreTable({ state, showRound }: { state: GameState; showRound: boolean }) {
  const r = state.results[state.results.length - 1];
  const order = state.players.map((_, i) => i).sort((a, b) => state.scores[a] - state.scores[b]);
  return (
    <table className="scores">
      <thead>
        <tr>
          <th>Joueur</th>
          {showRound && <th>Manche</th>}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {order.map((i) => (
          <tr key={i} className={i === r.winner ? 'winner' : ''}>
            <td>
              {i === r.winner && '🏆 '}
              {state.players[i].name}
              {r.bouletHolder === i && <BouletArt size={22} />}
            </td>
            {showRound && <td>+{r.points[i]}</td>}
            <td>
              <b>{state.scores[i]}</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RoundEnd({ state, onNext, onRules }: { state: GameState; onNext: () => void; onRules: () => void }) {
  const r = state.results[state.results.length - 1];
  const name = (i: number) => (i === 0 ? 'Tu' : state.players[i].name);
  return (
    <div className="screen round-end">
      <h1>Fin de la manche {r.roundNumber}</h1>
      <p className="big-line">{r.winner === 0 ? 'Bravo, tu as vidé ta main ! 🎉' : `${state.players[r.winner].name} a vidé sa main.`}</p>
      <ScoreTable state={state} showRound />

      <div className="leftovers">
        {state.players.map((p, i) =>
          i === r.winner || p.hand.length === 0 ? null : (
            <div key={i} className="leftover">
              <small>{p.name}</small>
              <div className="row tight">
                {p.hand.map((c) => (
                  <CardView key={c.id} card={c} size="sm" />
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      <div className="exchange-explain">
        <BouletArt size={48} />
        {r.bouletHolder === null ? (
          <p>Personne n’avait le Boulet : il retourne dans la pioche.</p>
        ) : (
          <p>
            <b>{name(r.bouletHolder)}</b> {r.bouletHolder === 0 ? 'deviens' : 'devient'} <b>Boulet officiel</b> :{' '}
            {r.bouletHolder === 0 ? 'tu commences' : 'il commence'} avec le Boulet, joue en premier et donne ses 2 meilleures cartes à{' '}
            {r.winner === 0 ? 'toi' : state.players[r.winner].name}, qui lui en rend 2.
          </p>
        )}
      </div>

      <button className="btn huge primary" onClick={onNext}>
        Manche suivante
      </button>
      <button className="btn big" onClick={onRules}>
        Règles
      </button>
    </div>
  );
}

export function GameOver({ state, onReplay, onMenu }: { state: GameState; onReplay: () => void; onMenu: () => void }) {
  const winners = gameWinners(state);
  const iWin = winners.includes(0);
  return (
    <div className="screen game-over">
      <motion.h1 initial={{ scale: 0.4 }} animate={{ scale: 1 }}>
        {iWin ? 'Victoire ! 🏆' : 'Partie terminée'}
      </motion.h1>
      <p className="big-line">
        {winners.map((i) => state.players[i].name).join(' et ')} {winners.length > 1 ? 'gagnent' : 'gagne'} avec{' '}
        {state.scores[winners[0]]} points.
      </p>
      <ScoreTable state={state} showRound={false} />
      <p className="hint">{state.results.length} manches jouées · le score le plus bas l’emporte</p>
      <button className="btn huge primary" onClick={onReplay}>
        Rejouer
      </button>
      <button className="btn big" onClick={onMenu}>
        Menu
      </button>
    </div>
  );
}
