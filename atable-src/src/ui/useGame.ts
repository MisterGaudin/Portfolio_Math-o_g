// Contrôleur de partie côté UI : enchaîne les étapes d'un tour simultané,
// fait jouer les ordinateurs (600 à 900 ms par action) et prépare les animations.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activePlayers,
  aiAnnounce,
  aiChooseAll,
  aiDenounce,
  aiOrder,
  aiReveal,
  aiTake,
  allChosen,
  announceableMenu,
  checkAnnounce,
  cardById,
  cloneState,
  createGame,
  createRng,
  denounce,
  marketReceivers,
  nextRound,
  placeOrder,
  resolveAnnouncements,
  resolveExchange,
  submitChoice,
  visibleDiscard,
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
 * choosing   — chacun choisit ses cartes en secret ;
 * marketPick — Marché ouvert : le joueur choisit la pioche ou la carte visible ;
 * revealing  — animation de l'échange simultané ;
 * announcing — qui crie « À TABLE ! » ?
 * showdown   — on révèle les mains des annonceurs ;
 * roundEnd   — tout le monde révèle sa région ;
 * gameOver   — le Chef 3 étoiles est couronné.
 */
export type Stage = 'intro' | 'thinking' | 'choosing' | 'marketPick' | 'revealing' | 'announcing' | 'showdown' | 'roundEnd' | 'gameOver';

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
  /** Carte prise chez l'accusé en récompense d'une dénonciation juste. */
  rewardCard?: (state: GameState, target: number) => string | undefined;
}

const BOT_NAMES = ['Bob', 'Jeannine', 'Gaston'];
/** Nom d'un plat à partir de son identifiant. */
const dishName = (id: string) => cardById(id).name;
/** Temps laissé pour bluffer quand on n'a pas de menu complet. */
export const BLUFF_WINDOW_MS = 2000;
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
    (accuser: number, target: number, region: RegionId, reveal?: string) => {
      const d = mutate((s) => {
        const receiver = s.players[target].regions.includes(region) ? target : accuser;
        const swap = script?.swapCard?.(s, receiver);
        const opts = { reveal: reveal ?? aiReveal(s, accuser), rewardCardId: script?.rewardCard?.(s, target) };
        const [ev] = denounce(s, accuser, target, region, rng.current, swap, opts);
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
    (target: number, region: RegionId, reveal: string): string | null => {
      const s = stateRef.current;
      if (!s || stage !== 'choosing') return 'Pas maintenant';
      if (s.choices[0]) return 'Tu as déjà validé tes cartes';
      try {
        applyDenounce(0, target, region, reveal);
      } catch (e) {
        return (e as Error).message;
      }
      return null;
    },
    [stage, applyDenounce],
  );

  // ─── Commande ────────────────────────────────────────────────────────────
  const humanOrder = useCallback(
    (cardId: string): string | null => {
      try {
        mutate((s) => placeOrder(s, 0, { cardId }));
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
    [mutate],
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
        const bots = activePlayers(s).filter((p) => p !== 0 && !script && aiAnnounce(s, p, rng.current));
        return resolveAnnouncements(s, humanAnnounces ? [0, ...bots] : bots, rng.current);
      });
      if (!events) return;
      const cur = stateRef.current!;
      const bluff = events.find((e) => e.type === 'bluff');
      if (events.some((e) => e.type === 'lastService')) {
        // Quelqu'un a annoncé : Dernier service pour les autres.
        const who = cur.frozen.map((p) => (p === 0 ? 'Toi' : cur.players[p].name)).join(', ');
        vibrate([100, 50, 100]);
        setToast(`🔔 À TABLE ! (${who}) — Dernier service : un dernier échange pour les autres !`);
        setLastDenunciation(null);
        setStage('thinking');
      } else if (events.some((e) => e.type === 'roundWon')) {
        vibrate([100, 50, 100, 50, 300]);
        setStage(cur.lastRound?.announcers.length ? 'showdown' : 'roundEnd');
      } else {
        if (bluff && bluff.type === 'bluff') {
          const who = bluff.players.map((p) => (p === 0 ? 'Toi' : cur.players[p].name)).join(', ');
          setToast(`🃏 Bluff raté (${who}) : −1 ⭐ et la Vaisselle ! La manche continue.`);
        }
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

  /** Révélation : échange simultané, animé avant d'afficher les nouvelles mains. */
  const reveal = useCallback((humanTake: Record<number, 'pioche' | 'defausse'>) => {
    const cur = stateRef.current;
    if (!cur) return;
    const next = cloneState(cur);
    const takes = { ...Object.fromEntries(marketReceivers(next).filter((p) => p !== 0).map((p) => [p, aiTake(next, p)])), ...humanTake };
    const events = resolveExchange(next, rng.current, takes);
    const ex = events.find((e) => e.type === 'exchange');
    pending.current = next;
    setFx({ key: Date.now(), moves: ex && ex.type === 'exchange' ? ex.moves : [] });
    setStage('revealing');
  }, []);
  /** Marché ouvert : le joueur prend la pioche ou la carte visible. */
  const humanTake = useCallback((take: 'pioche' | 'defausse') => reveal({ 0: take }), [reveal]);

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
      // 2. Les ordinateurs (encore actifs) choisissent l'un après l'autre, le joueur pendant ce temps.
      const waiting = activePlayers(state).find((p) => p !== 0 && !state.choices[p]);
      if (waiting !== undefined) {
        timer = setTimeout(() => {
          const ordered = mutate((s) => {
            // Commande éventuelle de l'ordinateur (avant ses choix).
            const want = script ? null : aiOrder(s, waiting);
            const ev = want ? placeOrder(s, waiting, { cardId: want }) : [];
            submitChoice(s, waiting, script ? script.botChoice(s, waiting) : aiChooseAll(s, waiting, rng.current));
            return ev.length ? want : null;
          });
          if (ordered) setToast(`📝 ${state.players[waiting].name} commande : « Qui a ${dishName(ordered)} ? »`);
        }, botDelay());
      } else if (allChosen(state)) {
        // Marché ouvert : si le joueur reçoit une carte du Marché, il choisit d'abord.
        if (state.rules.openMarket && visibleDiscard(state) && marketReceivers(state).includes(0) && !state.frozen.includes(0)) setStage('marketPick');
        else reveal({});
      }
    } else if (stage === 'announcing' && state.phase === 'announce') {
      // 4. Annonce : si le joueur ne peut pas annoncer (Vaisselle, contrôle, main déjà posée…), on enchaîne.
      //    Sans menu complet, on lui laisse un court instant pour bluffer, puis on continue.
      if (checkAnnounce(state, 0)) timer = setTimeout(() => finishAnnouncements(false), 500);
      else if (!announceableMenu(state, 0)) timer = setTimeout(() => finishAnnouncements(false), BLUFF_WINDOW_MS);
    }
    return () => clearTimeout(timer);
  }, [state, stage, paused, script, mutate, commit, applyDenounce, finishAnnouncements, reveal]);

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
      const target = (m: Move) => (m.target === 0 ? 'toi' : next.players[m.target!].name);
      const verb = (p: number, tu: string, il: string) => (p === 0 ? tu : il);
      const effects = (fx?.moves ?? []).flatMap((m) => {
        const out: string[] = [];
        if (m.fromDiscard && m.drawn) out.push(`🧺 ${m.to === 0 ? 'Tu prends' : `${next.players[m.to].name} prend`} ${m.drawn.name} au Marché`);
        if (m.mode !== 'effect' || m.card.kind !== 'effect') return out;
        const e = m.card.effect;
        if (e === 'troc') out.push(`🤝 ${who(m.player)} ${verb(m.player, 'fais', 'fait')} un Troc avec ${target(m)} : mains échangées !`);
        if (e === 'demitour') out.push(`🔄 ${who(m.player)} ${verb(m.player, 'joues', 'joue')} Demi-tour : le sens s’inverse !`);
        if (e === 'chapardeur') out.push(`🦊 ${who(m.player)} ${verb(m.player, 'chapardes', 'chaparde')} une carte chez ${target(m)}${m.player === 0 && m.stolen ? ` : ${m.stolen.name}` : ''} !`);
        if (e === 'controle') out.push(`🚫 Contrôle sanitaire : ${target(m)} ne ${m.target === 0 ? 'peux' : 'peut'} pas annoncer jusqu’au prochain tour.`);
        return out;
      });
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
    humanOrder,
    humanTake,
    setPaused,
    setToast,
  };
}

export type GameController = ReturnType<typeof useGame>;
