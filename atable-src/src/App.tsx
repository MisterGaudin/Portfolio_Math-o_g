// Application : routage minimal (jeu ou /sim) et enchaînement des écrans.
import { useState } from 'react';
import { SimPage } from './sim/SimPage';
import { RulesModal } from './ui/Rules';
import { GameOver, Home, RoundEnd } from './ui/Screens';
import { Table } from './ui/Table';
import { tutorialScript, useTutorial } from './ui/tutorial';
import { useGame, type Setup } from './ui/useGame';

const SETUP_KEY = 'atable.setup';
const DEFAULT_SETUP: Setup = { opponents: 2, difficulty: 'moyen' };

function loadSetup(): Setup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (raw) return { ...DEFAULT_SETUP, ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible */
  }
  return DEFAULT_SETUP;
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
  const guide = useTutorial(game, game.isScripted && !!game.state);

  const start = (s: Setup) => {
    setSetup(s);
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(s));
    } catch {
      /* stockage indisponible */
    }
    game.start(s);
  };
  const openRules = (open: boolean) => {
    setRules(open);
    game.setPaused(open);
  };

  let screen;
  if (!game.state) screen = <Home initial={setup} onStart={start} onTutorial={() => game.startScripted(tutorialScript())} onRules={() => openRules(true)} />;
  else if (game.stage === 'gameOver') screen = <GameOver state={game.state} onReplay={() => start(setup)} onMenu={game.quit} />;
  else if (game.stage === 'roundEnd')
    screen = (
      <RoundEnd
        state={game.state}
        tutorial={game.isScripted}
        onNext={game.isScripted ? game.quit : game.state.phase === 'gameOver' ? game.goGameOver : game.goNextRound}
      />
    );
  else screen = <Table game={game} guide={guide} onRules={() => openRules(true)} onQuit={game.quit} />;

  return (
    <>
      {screen}
      <RulesModal open={rules} onClose={() => openRules(false)} />
    </>
  );
}
