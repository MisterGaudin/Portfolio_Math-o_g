// Contrôleur de partie côté UI : enchaîne les étapes d'un tour simultané,
// fait jouer les ordinateurs (600 à 900 ms par action) et prépare les animations.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  aiAnnounce,
  aiChooseAll,
  aiDenounce,
  allChosen,
  announceableMenu,
  cloneState,
  createGame,
  createRng,
  denounce,
  nextRound,
  resolveAnnouncements,
  resolveExchange,
  submitChoice,
  type Choice,
  type Denunciation,
  type Difficulty,
  type GameState,
  type Move,
  type RegionId,
  type RoundPreset,
} from '../engine';

export interface Setup {
  opponents: number; // 1 à 3
  difficulty: Difficulty;
}

/**
 * Étapes vues par l'interface :
 * intro      — début de manche : on découvre ses 2 régions secrètes ;
 * thinking   — début de tour, les ordinateurs envisagent une dénonciation ;
 * choosing   — chacun choisit sa carte en secret ;
 * revealing  — animation de l'échange simultané ;
 * announcing — qui crie « À TABLE ! » ?
 * showdown   — on révèle les mains des annonceurs ;
 * roundEnd   — tout le monde révèle sa région ;
 * gameOver   — le Grand Chef est couronné.
 */
export type Stage = 'intro' | 'thinking' | 'choosing' | 'revealing' | 'announcing' | 'showdown' | 'roundEnd' | 'gameOver';

export interface ExchangeFx {
  key: number;
  moves: Move[];
}

/** Scénario imposé aux ordinateurs (tutoriel). */
export interface BotScript {
  preset: RoundPreset;
  names: string[];
  botChoice: (state: GameState, player: number) => Choice;
  /** Carte rendue par celui qui reçoit la Vaisselle lors d'une dénonciation. */
  swapCard?: (state: GameState, receiver: number) => string | undefined;
}

const BOT_NAMES = ['Bob', 'Jeannine', 'Gaston'];
/** Durée de l'animation d'échange. */
export const REVEAL_MS = 1500;
const botDelay = () => 600 + Math.random() * 300;
const vibrate = (pattern: number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration indisponible */
  }
};

export function useGame() {
  const [state, setStateRaw] = useState<GameState | null>(null);
  const [stage, setStage] = useState<Stage>('thinking');
  const [fx, setFx] = useState<ExchangeFx | null>(null);
  const [lastDenunciation, setLastDenunciation] = useState<Denunciation | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [script, setScript] = useState<BotScript | null>(null);
  /** Vrai pendant qu'une fenêtre (règles, dénonciation…) est ouverte : l'IA attend. */
  const [paused, setPaused] = useState(false);
  const stateRef = useRef<GameState | null>(null);
  /** État après l'échange, affiché à la fin de l'animation. */
  const pending = useRef<GameState | null>(null);
  const rng = useRef(createRng(Date.now() >>> 0));

  const commit = useCallback((s: GameState | null) => {
    stateRef.current = s;
    setStateRaw(s);
  }, []);

  /** Applique une modification sur une copie de l'état courant. */
  const mutate = useCallback(
    <T,>(fn: (s: GameState) => T): T | undefined => {
      const cur = stateRef.current;
      if (!cur) return undefined;
      const next = cloneState(cur);
      const out = fn(next);
      commit(next);
      return out;
    },
    [commit],
  );

  // ─── Démarrage ───────────────────────────────────────────────────────────
  const start = useCallback(
    (setup: Setup) => {
      const players = [
        { name: 'Toi', isHuman: true, difficulty: setup.difficulty },
        ...BOT_NAMES.slice(0, setup.opponents).map((name) => ({ name, isHuman: false, difficulty: setup.difficulty })),
      ];
      setScript(null);
      commit(createGame(players, rng.current));
      setLastDenunciation(null);
      setStage('intro');
    },
    [commit],
  );

  const startScripted = useCallback(
    (s: BotScript) => {
      const players = s.names.map((name, i) => ({ name, isHuman: i === 0, difficulty: 'moyen' as Difficulty }));
      setScript(s);
      commit(createGame(players, createRng(42), {}, s.preset));
      setLastDenunciation(null);
      setStage('intro');
    },
    [commit],
  );

  const quit = useCallback(() => {
    commit(null);
    setScript(null);
    setFx(null);
    setStage('thinking');
  }, [commit]);

  // ─── Dénonciation ────────────────────────────────────────────────────────
  const applyDenounce = useCallback(
    (accuser: number, target: number, region: RegionId) => {
      const d = mutate((s) => {
        const receiver = s.players[target].regions.includes(region) ? target : accuser;
        const swap = script?.swapCard?.(s, receiver);
        const [ev] = denounce(s, accuser, target, region, rng.current, swap);
        return ev.type === 'denounce' ? ev.denunciation : null;
      });
      if (d) {
        setLastDenunciation(d);
        if (d.vaisselleTo === 0) vibrate([200, 80, 200]);
      }
    },
    [mutate, script],
  );

  const humanDenounce = useCallback(
    (target: number, region: RegionId): string | null => {
      const s = stateRef.current;
      if (!s || stage !== 'choosing') return 'Pas maintenant';
      if (s.choices[0]) return 'Tu as déjà validé tes cartes';
      try {
        applyDenounce(0, target, region);
      } catch (e) {
        return (e as Error).message;
      }
      return null;
    },
    [stage, applyDenounce],
  );

  // ─── Choix ───────────────────────────────────────────────────────────────
  const humanChoose = useCallback(
    (choice: Choice): string | null => {
      try {
        mutate((s) => submitChoice(s, 0, choice));
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
    [mutate],
  );

  // ─── Annonces ────────────────────────────────────────────────────────────
  const finishAnnouncements = useCallback(
    (humanAnnounces: boolean) => {
      const events = mutate((s) => {
        const bots = s.players.map((_, p) => p).filter((p) => p !== 0 && !script && aiAnnounce(s, p, rng.current));
        return resolveAnnouncements(s, humanAnnounces ? [0, ...bots] : bots, rng.current);
      });
      if (!events) return;
      if (events.some((e) => e.type === 'announce')) {
        vibrate([100, 50, 100, 50, 300]);
        setStage('showdown');
      } else if (events.some((e) => e.type === 'roundWon')) {
        setStage('roundEnd'); // arrêt de sécurité : manche sans gagnant
      } else {
        setLastDenunciation(null);
        setStage('thinking');
      }
    },
    [mutate, script],
  );

  const goRoundEnd = useCallback(() => setStage('roundEnd'), []);
  const goGameOver = useCallback(() => setStage('gameOver'), []);
  const goNextRound = useCallback(() => {
    mutate((s) => nextRound(s, rng.current));
    setLastDenunciation(null);
    setStage('intro');
  }, [mutate]);
  /** Fin de la découverte des régions : la manche commence. */
  const beginRound = useCallback(() => setStage('thinking'), []);

  // ─── Boucle des ordinateurs ─────────────────────────────────────────────
  useEffect(() => {
    if (!state || paused) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (stage === 'thinking' && state.phase === 'choose') {
      // 1. Dénonciation : le premier ordinateur (dans l'ordre) qui le souhaite.
      const bot = script ? null : state.players.map((_, p) => p).filter((p) => p !== 0).map((p) => ({ p, d: aiDenounce(state, p) })).find((x) => x.d);
      if (bot?.d) {
        timer = setTimeout(() => {
          applyDenounce(bot.p, bot.d!.target, bot.d!.region);
          setStage('choosing');
        }, botDelay());
      } else setStage('choosing');
    } else if (stage === 'choosing' && state.phase === 'choose') {
      // 2. Les ordinateurs choisissent l'un après l'autre (le joueur choisit pendant ce temps).
      const waiting = state.players.findIndex((_, p) => p !== 0 && !state.choices[p]);
      if (waiting > 0) {
        timer = setTimeout(() => {
          mutate((s) => submitChoice(s, waiting, script ? script.botChoice(s, waiting) : aiChooseAll(s, waiting, rng.current)));
        }, botDelay());
      } else if (allChosen(state)) {
        // 3. Révélation : échange simultané, animé avant d'afficher les nouvelles mains.
        const next = cloneState(state);
        const events = resolveExchange(next, rng.current);
        const ex = events.find((e) => e.type === 'exchange');
        pending.current = next;
        setFx({ key: Date.now(), moves: ex && ex.type === 'exchange' ? ex.moves : [] });
        setStage('revealing');
      }
    } else if (stage === 'announcing' && state.phase === 'announce') {
      // 4. Annonce : si le joueur n'a pas de menu valide, on enchaîne tout seul.
      if (!announceableMenu(state, 0)) timer = setTimeout(() => finishAnnouncements(false), 500);
    }
    return () => clearTimeout(timer);
  }, [state, stage, paused, script, mutate, commit, applyDenounce, finishAnnouncements]);

  // Fin de l'animation d'échange : on affiche les nouvelles mains.
  useEffect(() => {
    if (stage !== 'revealing' || !fx) return;
    const t = setTimeout(() => {
      const next = pending.current;
      const before = stateRef.current;
      if (!next) return;
      pending.current = null;
      commit(next);
      setFx(null);
      const had = (s: GameState | null) => !!s?.players[0].hand.some((c) => c.kind === 'vaisselle');
      // Cartes à effet jouées ce tour-ci : on prévient tout le monde.
      const who = (p: number) => (p === 0 ? 'Tu' : next.players[p].name);
      const effects = (fx?.moves ?? [])
        .filter((m) => m.mode === 'effect' && m.card.kind === 'effect')
        .map((m) =>
          m.card.kind === 'effect' && m.card.effect === 'troc'
            ? `🤝 ${who(m.player)} ${m.player === 0 ? 'fais' : 'fait'} un Troc avec ${m.target === 0 ? 'toi' : next.players[m.target!].name} : mains échangées !`
            : `🔄 ${who(m.player)} ${m.player === 0 ? 'joues' : 'joue'} Demi-tour : le sens s’inverse !`,
        );
      if (effects.length) {
        vibrate([80, 40, 80]);
        setToast(effects.join(' · '));
      } else if (had(next) && !had(before)) {
        vibrate([200, 80, 200]);
        setToast('Beurk ! On t’a refilé la Vaisselle 🍽️');
      }
      setStage('announcing');
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [stage, fx, commit]);

  // Le petit message disparaît tout seul.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  // Outil de débogage (développement uniquement).
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __atable: unknown }).__atable = { state, stage, commit };
  }, [state, stage, commit]);

  return {
    state,
    stage,
    fx,
    toast,
    lastDenunciation,
    isScripted: !!script,
    start,
    startScripted,
    quit,
    humanChoose,
    humanDenounce,
    finishAnnouncements,
    goRoundEnd,
    goGameOver,
    goNextRound,
    beginRound,
    setPaused,
    setToast,
  };
}

export type GameController = ReturnType<typeof useGame>;
