// Contrôleur de partie côté UI : état immuable, tours de l'IA temporisés,
// journal des coups et effets spéciaux (animation BOULET !, vibration).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyAction,
  chooseAction,
  cloneState,
  createGame,
  createRng,
  nextRound,
  type Action,
  type Difficulty,
  type GameEvent,
  type GameState,
} from '../engine';
import { describeEvents, type LogEntry } from './log';

export interface Setup {
  name: string;
  opponents: number; // 1 à 3
  difficulty: Difficulty;
}

export interface BouletFx {
  key: number;
  from: number;
  to: number;
}

const BOT_NAMES = ['Bot 1', 'Bot 2', 'Bot 3'];

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [fx, setFx] = useState<BouletFx | null>(null);
  /** Dernières cartes arrivées dans la main humaine (pour l'animation de pioche). */
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  /** Pause de l'IA pendant qu'une fenêtre est ouverte. */
  const [paused, setPaused] = useState(false);
  const rng = useRef(createRng(Date.now() >>> 0));
  const logId = useRef(0);

  const pushLog = useCallback((s: GameState, events: GameEvent[]) => {
    const entries = describeEvents(s, events).map((e) => ({ ...e, id: ++logId.current }));
    if (entries.length) setLog((old) => [...old, ...entries].slice(-30));
    const gift = events.find((e) => e.type === 'boulet');
    if (gift && gift.type === 'boulet') {
      setFx({ key: Date.now(), from: gift.from, to: gift.to });
      // Grosse vibration quand le Boulet change de main (surtout s'il arrive chez nous).
      try {
        navigator.vibrate?.(gift.to === 0 ? [250, 80, 250, 80, 400] : [120, 60, 120]);
      } catch {
        /* vibration indisponible : tant pis */
      }
    }
  }, []);

  /** Envoie une action au moteur (sur une copie de l'état). */
  const act = useCallback(
    (player: number, action: Action): string | null => {
      if (!state) return 'Pas de partie';
      const next = cloneState(state);
      try {
        const before = new Set(next.players[0].hand.map((c) => c.id));
        const events = applyAction(next, player, action, rng.current);
        setFresh(new Set(next.players[0].hand.filter((c) => !before.has(c.id)).map((c) => c.id)));
        setState(next);
        pushLog(next, events);
        return null;
      } catch (err) {
        return (err as Error).message;
      }
    },
    [state, pushLog],
  );

  const start = useCallback((setup: Setup) => {
    const players = [
      { name: setup.name.trim() || 'Toi', isHuman: true, difficulty: setup.difficulty },
      ...BOT_NAMES.slice(0, setup.opponents).map((name) => ({ name, isHuman: false, difficulty: setup.difficulty })),
    ];
    const s = createGame(players, rng.current);
    setState(s);
    setFresh(new Set());
    setLog([{ id: ++logId.current, text: `Manche 1 — ${s.players[s.current].name} commence` }]);
  }, []);

  const goNextRound = useCallback(() => {
    if (!state) return;
    const next = cloneState(state);
    const events = nextRound(next, rng.current);
    setState(next);
    setFresh(new Set());
    setLog((old) => [...old, { id: ++logId.current, text: `— Manche ${next.roundNumber} —`, strong: true }]);
    pushLog(next, events);
  }, [state, pushLog]);

  const quit = useCallback(() => {
    setState(null);
    setLog([]);
  }, []);

  // Tour des ordinateurs : un coup toutes les 600 à 900 ms pour rester lisible.
  useEffect(() => {
    if (!state || paused) return;
    const active = ['play', 'afterDraw', 'exchange'].includes(state.phase);
    if (!active || state.players[state.current].isHuman) return;
    const delay = 600 + Math.random() * 300;
    const t = setTimeout(() => {
      const action = chooseAction(state, rng.current);
      act(state.current, action);
    }, delay);
    return () => clearTimeout(t);
  }, [state, paused, act]);

  // Outil de débogage (uniquement en développement) : manipuler l'état depuis la console.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __boulet: unknown }).__boulet = { state, setState };
  }, [state]);

  const clearFx = useCallback(() => setFx(null), []);
  return { state, log, fx, fresh, act, start, goNextRound, quit, setPaused, clearFx };
}
