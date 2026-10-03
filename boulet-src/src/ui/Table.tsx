// Table de jeu : adversaires en haut, pioche/défausse au centre, main en bas.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  COLORS,
  bouletHolder,
  checkPlay,
  isPlayable,
  rankKey,
  topCard,
  type Action,
  type Card,
  type Color,
  type GameState,
} from '../engine';
import { BouletArt, DirectionArt } from './Art';
import { CardBack, CardView, type CardLook } from './CardView';
import type { LogEntry } from './log';
import { Modal } from './Modal';
import type { BouletFx } from './useGame';

interface Props {
  state: GameState;
  log: LogEntry[];
  fx: BouletFx | null;
  fresh: Set<number>;
  act: (player: number, action: Action) => string | null;
  setPaused: (p: boolean) => void;
  clearFx: () => void;
  onRules: () => void;
  onQuit: () => void;
  rulesOpen: boolean;
}

const ME = 0;
const COLOR_ORDER: Record<string, number> = { rouge: 0, bleu: 1, vert: 2, jaune: 3 };
const KIND_ORDER: Record<string, number> = { number: 0, plus2: 1, skip: 2, reverse: 3, joker: 4, boulet: -1 };

/** Tri de la main : Boulet d'abord, puis par couleur et par valeur, Jokers à la fin. */
function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const ka = a.kind === 'joker' ? 9 : a.kind === 'boulet' ? -1 : COLOR_ORDER[a.color!];
    const kb = b.kind === 'joker' ? 9 : b.kind === 'boulet' ? -1 : COLOR_ORDER[b.color!];
    return ka - kb || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.value ?? 0) - (b.value ?? 0) || a.id - b.id;
  });
}

type Pending = { cardIds: number[]; color?: Color; stage: 'color' | 'boulet' } | null;

export function Table({ state, log, fx, fresh, act, setPaused, clearFx, onRules, onQuit, rulesOpen }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exchangePick, setExchangePick] = useState<number[]>([]);
  const [infoSeen, setInfoSeen] = useState(0);
  const [confirmQuit, setConfirmQuit] = useState(false);

  const me = state.players[ME];
  const myTurn = state.current === ME && (state.phase === 'play' || state.phase === 'afterDraw');
  const holder = bouletHolder(state);
  const top = topCard(state);
  const hand = useMemo(() => sortHand(me.hand), [me.hand]);
  const iHaveBoulet = holder === ME;

  // Échange : l'humain a gagné et doit rendre 2 cartes.
  const mustExchange = state.phase === 'exchange' && state.pendingExchange?.winner === ME;
  // Récapitulatif de l'échange quand l'humain est le Boulet officiel.
  const exchangeEvents = state.history.filter((e) => e.type === 'exchange');
  const showExchangeInfo =
    state.phase === 'play' && state.officialBoulet === ME && exchangeEvents.length === 2 && infoSeen !== state.roundNumber;

  // L'IA attend pendant les fenêtres et l'animation BOULET !
  const blocking = !!fx || rulesOpen || showExchangeInfo || confirmQuit;
  useEffect(() => setPaused(blocking), [blocking, setPaused]);

  // Fin de l'animation BOULET !
  useEffect(() => {
    if (!fx) return;
    const t = setTimeout(clearFx, 1700);
    return () => clearTimeout(t);
  }, [fx, clearFx]);

  // Nouvelle situation : on vide la sélection.
  useEffect(() => {
    setSelected(state.phase === 'afterDraw' && state.current === ME && state.drawnCardId !== null ? [state.drawnCardId] : []);
    setPending(null);
  }, [state.current, state.phase, state.drawnCardId, state.turnCount]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(t);
  }, [message]);

  /** Ordre de pose : si la 1re carte tapée ne va pas mais la 2e oui, on inverse. */
  const ordered = useMemo(() => {
    if (selected.length !== 2) return selected;
    const [a, b] = selected.map((id) => me.hand.find((c) => c.id === id)!);
    if (!a || !b) return selected;
    return !isPlayable(state, a) && isPlayable(state, b) ? [b.id, a.id] : selected;
  }, [selected, me.hand, state]);

  /** Le coup sélectionné est-il légal (sans ou avec don du Boulet) ? */
  const legality = useMemo(() => {
    if (!myTurn || ordered.length === 0) return { ok: false, mustGive: false, canGive: false, error: null as string | null };
    const base: Extract<Action, { type: 'play' }> = { type: 'play', cardIds: ordered, chosenColor: 'rouge' };
    const plain = checkPlay(state, ME, base);
    const other = ME === 0 ? 1 : 0;
    const gift = ordered.length === 2 && iHaveBoulet ? checkPlay(state, ME, { ...base, giveBouletTo: other }) : 'non';
    return { ok: plain === null || gift === null, mustGive: plain !== null && gift === null, canGive: gift === null, error: plain };
  }, [myTurn, ordered, state, iHaveBoulet]);

  function lookOf(card: Card): CardLook {
    if (selected.includes(card.id)) return 'selected';
    if (!myTurn) return 'normal';
    if (state.phase === 'afterDraw') return card.id === state.drawnCardId ? 'playable' : 'dim';
    if (card.kind === 'boulet') return 'dim';
    if (selected.length === 1) {
      const first = me.hand.find((c) => c.id === selected[0]);
      if (first && rankKey(first) === rankKey(card)) return 'playable';
    }
    return isPlayable(state, card) ? 'playable' : 'dim';
  }

  function tap(card: Card) {
    if (mustExchange) {
      setExchangePick((p) => (p.includes(card.id) ? p.filter((x) => x !== card.id) : p.length < 2 ? [...p, card.id] : [p[1], card.id]));
      return;
    }
    if (!myTurn) return setMessage('Patience, ce n’est pas ton tour');
    if (card.kind === 'boulet') return setMessage('Le Boulet ne se pose jamais : refile-le en posant un double !');
    if (state.phase === 'afterDraw') {
      if (card.id !== state.drawnCardId) setMessage('Après une pioche, seule la carte piochée peut être posée');
      return;
    }
    setSelected((sel) => {
      if (sel.includes(card.id)) return sel.filter((x) => x !== card.id);
      if (sel.length === 1) {
        const first = me.hand.find((c) => c.id === sel[0]);
        if (first && rankKey(first) === rankKey(card)) return [sel[0], card.id];
      }
      return [card.id];
    });
  }

  function finish(cardIds: number[], color: Color | undefined, giveTo: number | undefined) {
    const err = act(ME, { type: 'play', cardIds, chosenColor: color, giveBouletTo: giveTo });
    if (err) setMessage(err);
    setPending(null);
    setSelected([]);
  }

  function play() {
    if (!legality.ok) return setMessage(legality.error ?? 'Coup impossible');
    const last = me.hand.find((c) => c.id === ordered[ordered.length - 1])!;
    if (last.kind === 'joker') return setPending({ cardIds: ordered, stage: 'color' });
    if (legality.canGive) return setPending({ cardIds: ordered, stage: 'boulet' });
    finish(ordered, undefined, undefined);
  }

  function pickColor(color: Color) {
    if (!pending) return;
    if (legality.canGive) setPending({ ...pending, color, stage: 'boulet' });
    else finish(pending.cardIds, color, undefined);
  }

  function draw() {
    if (!myTurn || state.phase !== 'play') return;
    const err = act(ME, { type: 'draw' });
    if (err) setMessage(err);
  }

  const n = state.players.length;
  // Auteur de la dernière pose (pour l'animation : depuis le bas pour moi, le haut sinon).
  let lastPlayer = -1;
  for (const e of state.history) if (e.type === 'play') lastPlayer = e.player;
  const statusText = (() => {
    if (state.phase === 'roundOver' || state.phase === 'gameOver') return 'Manche terminée !';
    if (state.phase === 'exchange') return mustExchange ? 'Choisis 2 cartes à rendre' : 'Échange en cours…';
    if (state.current !== ME) return `${state.players[state.current].name} réfléchit…`;
    if (state.phase === 'afterDraw') return 'Tu peux poser la carte piochée, ou la garder';
    if (iHaveBoulet && me.hand.length === 2) return 'Avec le Boulet, impossible de finir : pioche ou pose un double !';
    return 'À toi de jouer !';
  })();

  return (
    <div className="table">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setConfirmQuit(true)} aria-label="Menu">
          ☰
        </button>
        <div className="round-info">
          Manche {state.roundNumber} · <b>{state.scores[ME]}</b> pts
        </div>
        <button className="icon-btn" onClick={onRules} aria-label="Règles">
          ?
        </button>
      </header>

      {/* Adversaires */}
      <section className={`opponents n${n - 1}`}>
        {state.players.slice(1).map((p, k) => {
          const i = k + 1;
          return (
            <motion.div
              key={i}
              className={`opponent ${state.current === i ? 'active' : ''}`}
              animate={fx && fx.to === i ? { scale: [1, 1.15, 1], rotate: [0, -4, 4, 0] } : { scale: 1 }}
            >
              <div className="opp-name">{p.name}</div>
              <div className="opp-cards">
                <CardBack size="sm" />
                <span className="opp-count">{p.hand.length}</span>
              </div>
              <div className="opp-score">{state.scores[i]} pts</div>
              {holder === i && (
                <motion.div className="boulet-tag" layoutId="boulet-tag" title="A le Boulet">
                  <BouletArt size={34} />
                </motion.div>
              )}
              {p.hand.length === 1 && <div className="last-card">Dernière carte !</div>}
            </motion.div>
          );
        })}
      </section>

      {/* Centre : pioche, défausse, sens et couleur active */}
      <section className="center">
        <div className="pile">
          <CardBack size="lg" onClick={myTurn && state.phase === 'play' ? draw : undefined} highlight={myTurn && state.phase === 'play'} />
          <span className="pile-count">{state.drawPile.length}</span>
        </div>
        <div className="discard">
          {state.discard.length > 1 && (
            <div className="under">
              <CardView card={state.discard[state.discard.length - 2]} size="lg" />
            </div>
          )}
          <AnimatePresence initial={false}>
            <CardView
              key={top.id}
              card={top}
              size="lg"
              enterFrom={lastPlayer === ME ? 'bottom' : 'top'}
            />
          </AnimatePresence>
        </div>
        <div className="indicators">
          <div className={`color-dot ${state.activeColor}`} aria-label={`Couleur active : ${state.activeColor}`}>
            {state.activeColor}
          </div>
          <div className="direction" aria-label={state.direction === 1 ? 'Sens horaire' : 'Sens inverse'}>
            <DirectionArt direction={state.direction} />
          </div>
        </div>
      </section>

      {/* Journal discret */}
      <section className="log" aria-live="polite">
        {log.slice(-3).map((e) => (
          <motion.div key={e.id} className={e.strong ? 'strong' : ''} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {e.text}
          </motion.div>
        ))}
      </section>

      <div className={`status ${myTurn ? 'mine' : ''}`}>{message ?? statusText}</div>

      {/* Ma main */}
      <section className={`hand ${myTurn ? 'my-turn' : ''}`}>
        {iHaveBoulet && (
          <div className="my-boulet">
            <BouletArt size={26} /> Tu as le BOULET
          </div>
        )}
        <div className="hand-scroll">
          <AnimatePresence initial={false}>
            {hand.map((c) => (
              <CardView
                key={c.id}
                card={c}
                look={mustExchange ? (exchangePick.includes(c.id) ? 'selected' : 'normal') : lookOf(c)}
                onClick={() => tap(c)}
                badge={selected.length === 2 ? (ordered.indexOf(c.id) >= 0 ? ordered.indexOf(c.id) + 1 : undefined) : undefined}
                enterFrom={fresh.has(c.id) ? 'top' : 'none'}
              />
            ))}
          </AnimatePresence>
        </div>
      </section>

      <footer className="actions">
        {state.phase === 'afterDraw' && myTurn ? (
          <>
            <button className="btn big" onClick={() => act(ME, { type: 'pass' })}>
              Garder
            </button>
            <button className="btn big primary" disabled={!legality.ok} onClick={play}>
              Poser
            </button>
          </>
        ) : (
          <>
            <button className="btn big" disabled={!myTurn || state.phase !== 'play'} onClick={draw}>
              Piocher
            </button>
            <button className="btn big primary" disabled={!legality.ok} onClick={play}>
              {selected.length === 2 ? 'Jouer le double' : 'Jouer'}
            </button>
          </>
        )}
      </footer>

      {/* Choix de la couleur du Joker */}
      <Modal open={pending?.stage === 'color'} title="Quelle couleur ?" onClose={() => setPending(null)}>
        <div className="color-grid">
          {COLORS.map((c) => (
            <button key={c} className={`color-choice ${c}`} onClick={() => pickColor(c)}>
              {c}
            </button>
          ))}
        </div>
      </Modal>

      {/* Don du Boulet après un double */}
      <Modal open={pending?.stage === 'boulet'} title="Refiler le BOULET ?" onClose={() => setPending(null)}>
        <div className="boulet-choice">
          <BouletArt size={72} />
          <p>{legality.mustGive ? 'C’est tes dernières cartes : tu dois le refiler !' : 'Ton double te permet de le donner à qui tu veux.'}</p>
          {state.players.slice(1).map((p, k) => (
            <button key={k} className="btn big primary" onClick={() => finish(pending!.cardIds, pending!.color, k + 1)}>
              À {p.name} ({p.hand.length} cartes)
            </button>
          ))}
          {!legality.mustGive && (
            <button className="btn big" onClick={() => finish(pending!.cardIds, pending!.color, undefined)}>
              Je le garde
            </button>
          )}
        </div>
      </Modal>

      {/* Échange : l'humain a gagné */}
      <Modal open={mustExchange} title="Échange de cartes">
        {state.pendingExchange && (
          <div className="exchange">
            <p>
              <b>{state.players[state.pendingExchange.official].name}</b>, Boulet officiel, te donne ses 2 meilleures cartes :
            </p>
            <div className="row">
              {state.pendingExchange.received.map((c) => (
                <CardView key={c.id} card={c} size="sm" />
              ))}
            </div>
            <p>Choisis 2 cartes à lui rendre :</p>
            <div className="exchange-hand">
              {hand.map((c) => (
                <CardView key={c.id} card={c} size="sm" look={exchangePick.includes(c.id) ? 'selected' : 'normal'} onClick={() => tap(c)} />
              ))}
            </div>
            <button
              className="btn big primary"
              disabled={exchangePick.length !== 2}
              onClick={() => {
                const err = act(ME, { type: 'exchange', cardIds: exchangePick });
                if (err) setMessage(err);
                setExchangePick([]);
              }}
            >
              Rendre ces 2 cartes
            </button>
          </div>
        )}
      </Modal>

      {/* Récapitulatif quand l'humain est le Boulet officiel */}
      <Modal open={showExchangeInfo} title="Tu es le Boulet officiel !" onClose={() => setInfoSeen(state.roundNumber)}>
        <div className="exchange">
          <BouletArt size={64} />
          {exchangeEvents.map((e, k) =>
            e.type === 'exchange' ? (
              <div key={k}>
                <p>{e.from === ME ? `Tu donnes à ${state.players[e.to].name} :` : `${state.players[e.from].name} te rend :`}</p>
                <div className="row">
                  {e.cards.map((c) => (
                    <CardView key={c.id} card={c} size="sm" />
                  ))}
                </div>
              </div>
            ) : null,
          )}
          <p>Tu commences la manche avec le Boulet. Pose vite un double pour le refiler !</p>
          <button className="btn big primary" onClick={() => setInfoSeen(state.roundNumber)}>
            C’est parti
          </button>
        </div>
      </Modal>

      <Modal open={confirmQuit} title="Quitter la partie ?" onClose={() => setConfirmQuit(false)}>
        <div className="boulet-choice">
          <button className="btn big" onClick={() => setConfirmQuit(false)}>
            Continuer à jouer
          </button>
          <button className="btn big danger" onClick={onQuit}>
            Retour au menu
          </button>
        </div>
      </Modal>

      {/* Grosse animation BOULET ! */}
      <AnimatePresence>
        {fx && (
          <motion.div className="boulet-fx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={clearFx}>
            <motion.div
              initial={{ scale: 0.2, rotate: -40, y: -200 }}
              animate={{ scale: [0.2, 1.3, 1], rotate: [-40, 15, -8, 0], y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <BouletArt size={170} />
            </motion.div>
            <motion.div className="fx-title" initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25 }}>
              BOULET !
            </motion.div>
            <div className="fx-sub">
              {fx.from === ME ? 'Tu' : state.players[fx.from].name} → {fx.to === ME ? 'TOI 😱' : state.players[fx.to].name}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
