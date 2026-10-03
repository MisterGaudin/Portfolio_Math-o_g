// Écrans hors table : accueil, révélation de fin de manche, Grand Chef.
import { motion } from 'framer-motion';
import { useState } from 'react';
import { REGION_BY_ID } from '../config/cards';
import { MENU_LABELS, type Difficulty, type GameState } from '../engine';
import { RegionCardView } from './CardView';
import { Toques } from './Table';
import type { Setup } from './useGame';

const LEVELS: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'facile', label: 'Facile', hint: 'Joue au hasard, ne dénonce jamais' },
  { id: 'moyen', label: 'Moyen', hint: 'Garde sa région, refile la Vaisselle' },
  { id: 'difficile', label: 'Difficile', hint: 'Te surveille, bluffe et dénonce' },
];

export function Home({ initial, onStart, onTutorial, onRules }: { initial: Setup; onStart: (s: Setup) => void; onTutorial: () => void; onRules: () => void }) {
  const [setup, setSetup] = useState(initial);
  return (
    <div className="home">
      <motion.div className="logo" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <span className="logo-plate">🍽️</span>
        <h1>À TABLE !</h1>
        <p>Le jeu des spécialités de nos régions</p>
      </motion.div>

      <div className="panel">
        <h3>Adversaires</h3>
        <div className="segmented">
          {[1, 2, 3].map((n) => (
            <button key={n} className={setup.opponents === n ? 'active' : ''} onClick={() => setSetup({ ...setup, opponents: n })}>
              {'🤖'.repeat(n)}
              <small>{n} ordi{n > 1 ? 's' : ''}</small>
            </button>
          ))}
        </div>
        <h3>Difficulté</h3>
        <div className="segmented">
          {LEVELS.map((l) => (
            <button key={l.id} className={setup.difficulty === l.id ? 'active' : ''} onClick={() => setSetup({ ...setup, difficulty: l.id })}>
              {l.label}
            </button>
          ))}
        </div>
        <p className="muted center-text">{LEVELS.find((l) => l.id === setup.difficulty)?.hint}</p>
      </div>

      <button className="btn btn-gold big block" onClick={() => onStart(setup)}>
        Passer à table ▸
      </button>
      <div className="row">
        <button className="btn grow" onClick={onTutorial}>
          🎓 Tutoriel
        </button>
        <button className="btn grow" onClick={onRules}>
          📖 Règles
        </button>
      </div>
      <a className="sim-link" href={`${import.meta.env.BASE_URL}sim`}>
        Mode simulation (IA contre IA)
      </a>
    </div>
  );
}

/** Petites phrases pour la révélation des régions. */
function reveal(name: string, region: string, isMe: boolean) {
  const r = REGION_BY_ID[region].name;
  const article = /^[AEIOUÉ]/.test(r) ? 'l’' : ['Sud-Ouest', 'Nord', 'Lyonnais'].includes(r) ? 'le ' : 'la ';
  return isMe ? `Toi, tu étais ${article}${r}.` : `Ah, c’était ${name} ${article}${r} !`;
}

export function RoundEnd({ state, onNext, tutorial }: { state: GameState; onNext: () => void; tutorial?: boolean }) {
  const r = state.lastRound!;
  const over = state.phase === 'gameOver';
  return (
    <div className="screen">
      <h2>Fin de la manche {state.roundNumber}</h2>
      {r.winner !== null && r.menu ? (
        <p className="big-line">
          🏆 <b>{state.players[r.winner].name}</b> {r.winner === 0 ? 'remportes' : 'remporte'} la Toque ({MENU_LABELS[r.menu.type]})
        </p>
      ) : (
        <p className="big-line">Le service est fermé : personne ne gagne cette manche.</p>
      )}
      <h3>On révèle les régions…</h3>
      <div className="reveal-list">
        {state.players.map((p, i) => (
          <motion.div key={i} className="reveal-row" initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.25 + i * 0.35 }}>
            <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ delay: 0.25 + i * 0.35, duration: 0.4 }}>
              <RegionCardView region={r.regions[i]} size="small" />
            </motion.div>
            <div>
              <div>{reveal(p.name, r.regions[i], i === 0)}</div>
              <Toques n={p.toques} max={state.toquesToWin} />
            </div>
          </motion.div>
        ))}
      </div>
      {tutorial && <p className="big-line">Mamie a changé de région après ta dénonciation ! Tutoriel terminé : à toi de jouer pour de vrai.</p>}
      <button className="btn btn-gold big block" onClick={onNext}>
        {tutorial ? 'Terminer le tutoriel ✓' : over ? 'Qui est le Grand Chef ? 👑' : 'Manche suivante ▸'}
      </button>
    </div>
  );
}

export function GameOver({ state, onReplay, onMenu }: { state: GameState; onReplay: () => void; onMenu: () => void }) {
  const w = state.winner!;
  const human = w === 0;
  return (
    <div className="screen gameover">
      <motion.div className="crown" initial={{ y: -80, rotate: -20 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 120 }}>
        🧑‍🍳
      </motion.div>
      <h1>GRAND CHEF</h1>
      <p className="big-line">{human ? 'Bravo, c’est toi ! Les cuisines de France te saluent.' : `${state.players[w].name} décroche les 3 Toques.`}</p>
      <div className="reveal-list">
        {[...state.players]
          .map((p, i) => ({ p, i }))
          .sort((a, b) => b.p.toques - a.p.toques)
          .map(({ p, i }) => (
            <div key={i} className={`reveal-row${i === w ? ' winner' : ''}`}>
              <b>{p.name}</b>
              <Toques n={p.toques} max={state.toquesToWin} />
            </div>
          ))}
      </div>
      <button className="btn btn-gold big block" onClick={onReplay}>
        Rejouer ▸
      </button>
      <button className="btn block" onClick={onMenu}>
        Menu
      </button>
    </div>
  );
}
