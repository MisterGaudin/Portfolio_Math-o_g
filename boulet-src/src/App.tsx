// Application : routage minimal (jeu ou /sim) et enchaînement des écrans.
import { useEffect, useState } from 'react';
import { SimPage } from './sim/SimPage';
import { RulesModal } from './ui/Rules';
import { GameOver, Home, RoundEnd } from './ui/Screens';
import { Table } from './ui/Table';
import { useGame, type Setup } from './ui/useGame';

const SETUP_KEY = 'boulet.setup';

function loadSetup(): Setup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (raw) return { name: '', opponents: 2, difficulty: 'moyen', ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible */
  }
  return { name: '', opponents: 2, difficulty: 'moyen' };
}

const isSimRoute = () => /\/sim\/?$/.test(window.location.pathname) || window.location.hash === '#/sim';

export default function App() {
  if (isSimRoute()) return <SimPage />;
  return <GameApp />;
}

function GameApp() {
  const game = useGame();
  const [setup, setSetup] = useState<Setup>(loadSetup);
  const [rules, setRules] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const phase = game.state?.phase;

  // Laisse voir la dernière carte posée avant d'afficher les scores.
  useEffect(() => {
    if (phase !== 'roundOver' && phase !== 'gameOver') return setShowResults(false);
    const t = setTimeout(() => setShowResults(true), 1400);
    return () => clearTimeout(t);
  }, [phase]);

  const start = (s: Setup) => {
    setSetup(s);
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(s));
    } catch {
      /* stockage indisponible */
    }
    game.start(s);
  };

  let screen;
  if (!game.state) screen = <Home initial={setup} onStart={start} onRules={() => setRules(true)} />;
  else if (showResults && phase === 'gameOver')
    screen = <GameOver state={game.state} onReplay={() => game.start(setup)} onMenu={game.quit} />;
  else if (showResults && phase === 'roundOver')
    screen = <RoundEnd state={game.state} onNext={game.goNextRound} onRules={() => setRules(true)} />;
  else
    screen = (
      <Table
        state={game.state}
        log={game.log}
        fx={game.fx}
        fresh={game.fresh}
        act={game.act}
        setPaused={game.setPaused}
        clearFx={game.clearFx}
        onRules={() => setRules(true)}
        onQuit={game.quit}
        rulesOpen={rules}
      />
    );

  return (
    <>
      {screen}
      <RulesModal open={rules} onClose={() => setRules(false)} />
    </>
  );
}
