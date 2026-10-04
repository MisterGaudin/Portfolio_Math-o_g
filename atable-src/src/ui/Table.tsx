// Table de jeu : adversaires en haut, pioche et défausse au centre, ta main en bas.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useState } from 'react';
import { COURSE_ICONS, COURSE_LABELS, COURSES, DAY_EVENTS, REGION_BY_ID, REGIONS } from '../config/cards';
import { announceableMenu, checkAnnounce, checkDenounce, evaluateMenu, leftOf, menuProgress, ordersAllowed, passCountOf, rightOf, visibleDiscard, MENU_LABELS, vaisselleHolder, type Card, type Choice, type GameState, type Mode, type Move, type Pick, cardById } from '../engine';
import { CardBack, CardView, DirtyPlate, RegionCardView, RegionChip } from './CardView';
import { Modal } from './Modal';
import type { Focus, Guide } from './tutorial';
import { REVEAL_MS, type GameController } from './useGame';

const AVATARS = ['🧑‍🍳', '👨‍🍳', '👩‍🍳', '🧔'];
const avatarOf = (s: GameState, p: number) => (s.players[p].name === 'Mamie' ? '👵' : AVATARS[p % AVATARS.length]);

/** Étoiles gagnées (comme les étoiles Michelin). */
export function Stars({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <span className="etoiles" aria-label={`${n} étoile${n > 1 ? 's' : ''}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? 'etoile on' : 'etoile'}>
          ⭐
        </span>
      ))}
    </span>
  );
}

/** Jauge(s) de menu : pour chaque région secrète, 4 cases Entrée / Plat / Fromage / Dessert. */
function MenuGauge({ state, revealed, focus }: { state: GameState; revealed: boolean; focus: boolean }) {
  const me = state.players[0];
  const progress = menuProgress(me.hand, me.regions, me.bonus);
  const hasBaguette = me.hand.some((c) => c.kind === 'baguette');
  // La Baguette bouche le trou d'un menu à qui il ne manque qu'un plat.
  const jokerRegion = hasBaguette ? progress.find((p) => p.have.size === 3)?.region : undefined;
  const menu = announceableMenu(state, 0)?.type ?? (state.rules.mode === 'deuxMenus' ? evaluateMenu(me.hand, me.regions)?.type : undefined);
  const best = Math.max(...progress.map((p) => p.have.size + (p.region === jokerRegion ? 1 : 0)));
  return (
    <div className={`gauges n${progress.length}${focus ? ' tuto-focus' : ''}`}>
      {progress.map(({ region, have, bonus }, k) => {
        const r = REGION_BY_ID[region];
        const missing = COURSES.find((c) => !have.has(c));
        return (
          <div key={region + k} className="gauge">
            <div className="gauge-title" style={revealed ? { background: r.color, color: r.ink } : undefined}>
              {revealed ? `${r.emblem} ${r.name}` : progress.length > 1 ? `Menu ${k + 1}` : 'Mon menu'}
            </div>
            <div className="gauge-cells">
              {COURSES.map((course) => {
                const full = have.has(course);
                const joker = !full && jokerRegion === region && course === missing;
                const fromRegion = course === bonus;
                return (
                  <div
                    key={course}
                    className={`gauge-cell${full || joker ? ' full' : ''}`}
                    style={full ? { background: revealed ? r.color : '#c98a2b' } : joker ? { background: '#d9a441' } : undefined}
                    title={fromRegion ? `${COURSE_LABELS[course]} : c’est ta carte Région` : COURSE_LABELS[course]}
                  >
                    {joker ? '🥖' : COURSE_ICONS[course]}
                    {fromRegion && <span className="gauge-gift">★</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className={`gauge-label${menu ? ' ok' : ''}`}>{menu ? `✓ ${MENU_LABELS[menu]}` : state.rules.mode === 'deuxMenus' ? `${progress.reduce((n, p) => n + p.have.size, 0) + (jokerRegion ? 1 : 0)}/8` : `${best}/4`}</div>
    </div>
  );
}

/** Siège d'un adversaire. */
function Seat({ state, p, ready, thinking, isLeft, isRight }: { state: GameState; p: number; ready: boolean; thinking: boolean; isLeft: boolean; isRight: boolean }) {
  const pl = state.players[p];
  const hasV = vaisselleHolder(state) === p;
  return (
    <div className="seat" data-seat={p}>
      <div className="seat-top">
        <span className="avatar">{avatarOf(state, p)}</span>
        {hasV && (
          <span className="seat-plate" title="A la Vaisselle">
            <DirtyPlate size={30} />
          </span>
        )}
      </div>
      <div className="seat-name">{pl.name}</div>
      <Stars n={pl.etoiles} max={state.etoilesToWin} />
      <div className="seat-cards overlap">
        {pl.hand.map((c) => (
          <CardBack key={c.id} size="mini" />
        ))}
      </div>
      <div className="seat-status">
        {state.frozen.includes(p) ? '🃏 À TABLE !' : ready ? '✓ prêt' : thinking ? '…' : ''}
        {state.rules.denounceLimit === 'protege' && state.unmasked.includes(p) && <span title="Déjà démasqué : protégé"> 🛡️</span>}
        {(state.blockedUntil[p] ?? 0) >= state.turn && <span title="Contrôle sanitaire : ne peut pas annoncer"> 🚫</span>}
      </div>
      {(isLeft || isRight) && <div className="seat-dir">{isLeft ? '⬅ reçoit tes cartes' : 'te passe ses cartes'}</div>}
    </div>
  );
}

/** Animation de l'échange simultané : les cartes glissent vers la gauche. */
function ExchangeOverlay({ moves, fxKey }: { moves: Move[]; fxKey: number }) {
  const [rects, setRects] = useState<Record<string, DOMRect> | null>(null);
  useLayoutEffect(() => {
    const get = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
    const out: Record<string, DOMRect> = {};
    document.querySelectorAll<HTMLElement>('[data-seat]').forEach((el) => (out[`seat${el.dataset.seat}`] = el.getBoundingClientRect()));
    const d = get('[data-pile="discard"]');
    const p = get('[data-pile="draw"]');
    const sp = get('[data-pile="special"]');
    if (d) out.discard = d;
    if (p) out.draw = p;
    if (sp) out.special = sp;
    setRects(out);
  }, [fxKey]);
  if (!rects) return null;
  const center = (r?: DOMRect) => (r ? { x: r.left + r.width / 2 - 28, y: r.top + r.height / 2 - 40 } : { x: 0, y: 0 });
  const dur = REVEAL_MS / 1000;
  return (
    <div className="fx-layer" aria-hidden>
      {moves.map((m, k) => {
        // Plusieurs cartes par joueur : on les décale un peu pour qu'elles se voient toutes.
        const nth = moves.slice(0, k).filter((x) => x.player === m.player).length;
        const shift = (p: { x: number; y: number }) => ({ x: p.x + nth * 16, y: p.y + nth * 6 });
        const from = shift(center(rects[`seat${m.player}`]));
        const to = shift(center(rects[`seat${m.to}`]));
        // On voit sa propre carte et les cartes du Marché (publiques) ; le reste est face cachée.
        const face = m.player === 0 || m.mode !== 'pass';
        if (m.mode === 'pass')
          return (
            <motion.div key={`p${k}`} className="fx-card" initial={from} animate={to} transition={{ duration: dur * 0.6, ease: 'easeInOut' }}>
              {face ? <CardView card={m.card} size="small" /> : <CardBack size="small" />}
            </motion.div>
          );
        const discard = shift(center(m.mode === 'effect' ? (rects.special ?? rects.discard) : rects.discard));
        const draw = shift(center(rects.draw));
        return [
          <motion.div key={`m${k}`} className="fx-card" initial={from} animate={discard} transition={{ duration: dur * 0.45, ease: 'easeOut' }}>
            <CardView card={m.card} size="small" />
          </motion.div>,
          <motion.div
            key={`d${k}`}
            className="fx-card"
            initial={{ ...draw, opacity: 0 }}
            animate={{ ...to, opacity: 1 }}
            transition={{ duration: dur * 0.45, delay: dur * 0.35, ease: 'easeInOut' }}
          >
            <CardBack size="small" />
          </motion.div>,
        ];
      })}
    </div>
  );
}

/** Fenêtre de dénonciation : qui, et quelle région ? */
function DenounceModal({ state, open, onClose, onConfirm, guide }: { state: GameState; open: boolean; onClose: () => void; onConfirm: (t: number, r: string, reveal: string) => void; guide: Guide | null }) {
  const [target, setTarget] = useState<number | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTarget(state.players.length === 2 && !(state.rules.denounceLimit === 'protege' && state.unmasked.includes(1)) ? 1 : null);
      setRegion(null);
      setShown(null);
    }
  }, [open, state.players.length]);
  // Chaque région n'existe qu'une fois : on n'accuse pas de sa propre région.
  const regions = state.rules.regionCards === 'partagees' ? state.regionsInPlay : state.regionsInPlay.filter((r) => !state.players[0].regions.includes(r));
  const isProtected = (i: number) => state.rules.denounceLimit === 'protege' && state.unmasked.includes(i);
  const needReveal = state.rules.revealToDenounce;
  const ok = target !== null && region !== null && (!needReveal || shown !== null) && (!guide || guide.allowDenounceTarget(target, region, shown));
  return (
    <Modal open={open} title="Je te démasque !" onClose={onClose}>
      <p className="muted">
        Juste : il prend ta Vaisselle et doit changer de région{needReveal ? ', et ta carte montrée part chez lui contre une carte prise au hasard dans sa main' : ''}. Faux :
        tu gardes la Vaisselle et tu ne pourras pas dénoncer au prochain tour.
      </p>
      <h3>Qui ?</h3>
      <div className="row wrap">
        {state.players.map((p, i) =>
          i === 0 ? null : (
            <button key={i} className={`pill${target === i ? ' active' : ''}`} disabled={isProtected(i) || state.frozen.includes(i)} onClick={() => setTarget(i)}>
              {avatarOf(state, i)} {p.name}
              {isProtected(i) ? ' 🛡️' : ''}
            </button>
          ),
        )}
      </div>
      <h3>Quelle région ?</h3>
      <div className="row wrap">
        {regions.map((r) => (
          <RegionChip key={r} region={r} active={region === r} onClick={() => setRegion(r)} />
        ))}
      </div>
      {needReveal && (
        <>
          <h3>Quelle carte montres-tu à tous ?</h3>
          <div className="reveal-pick">
            {state.players[0].hand
              .filter((c) => c.kind !== 'vaisselle')
              .map((c) => (
                <CardView key={c.id} card={c} size="small" selected={shown === c.id} onClick={() => setShown(c.id)} />
              ))}
          </div>
        </>
      )}
      <button className="btn btn-red block" disabled={!ok} onClick={() => ok && onConfirm(target!, region!, shown ?? '')}>
        {target !== null && region ? `« ${state.players[target].name}, je te démasque : ${REGION_BY_ID[region].name} ! »` : 'Choisis un joueur et une région'}
      </button>
    </Modal>
  );
}

/** Marché ouvert : la pioche (cachée) ou la carte visible du dessus de la défausse ? */
function MarketPickModal({ state, onPick }: { state: GameState; onPick: (t: 'pioche' | 'defausse') => void }) {
  const top = visibleDiscard(state);
  return (
    <Modal open title="Marché ouvert 🧺">
      <p>Ton voisin passe par le Marché : que prends-tu à la place ?</p>
      <div className="row">
        <button className="market-choice" onClick={() => onPick('pioche')}>
          <CardBack size="small" />
          <small>Carte cachée de la pioche</small>
        </button>
        {top && (
          <button className="market-choice" onClick={() => onPick('defausse')}>
            <CardView card={top} size="small" />
            <small>Carte visible (tout le monde verra que tu la prends)</small>
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Commande : « Qui a le Reblochon ? » — une région, puis un plat. */
function OrderModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (cardId: string) => void }) {
  const [region, setRegion] = useState<string | null>(null);
  useEffect(() => {
    if (open) setRegion(null);
  }, [open]);
  return (
    <Modal open={open} title="Passer la commande 📝" onClose={onClose}>
      <p className="muted">Une fois par manche : demande un plat à voix haute. Chacun répond honnêtement oui ou non… et tout le monde t’entend !</p>
      <h3>Quelle région ?</h3>
      <div className="row wrap">
        {REGIONS.map((r) => (
          <RegionChip key={r.id} region={r.id} active={region === r.id} onClick={() => setRegion(r.id)} />
        ))}
      </div>
      {region && (
        <>
          <h3>Quel plat ?</h3>
          <div className="row wrap">
            {COURSES.map((course, k) => (
              <button key={course} className="pill" onClick={() => onConfirm(`${region}-${course}`)}>
                {COURSE_ICONS[course]} {REGION_BY_ID[region].dishes[k]}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/** Début de manche : on découvre ses 2 cartes Région secrètes. */
function RegionsIntro({ state, onStart }: { state: GameState; onStart: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const me = state.players[0];
  const regions = me.regions;
  const one = regions.length === 1;
  return (
    <motion.div className="showdown intro" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
      <h2 className="atable-shout small">Manche {state.roundNumber}</h2>
      <p className="center-text">
        {!flipped
          ? `Tu reçois ${one ? 'ta carte Région secrète' : '2 cartes Région secrètes'}. Cache bien ton écran…`
          : one && me.bonus[0]
            ? `Ta région secrète ! Cette carte compte comme un de ses plats : ${REGION_BY_ID[regions[0]].dishes[COURSES.indexOf(me.bonus[0])]} (${COURSE_LABELS[me.bonus[0]]}) : trouve les 3 autres plats. La vraie carte ne te sert à rien… sauf pour bluffer !`
            : 'Tes 2 régions secrètes : termine leurs 2 menus !'}
      </p>
      <div className="intro-cards" onClick={() => setFlipped(true)}>
        {regions.map((r, i) => (
          <motion.div
            key={r + state.roundNumber}
            initial={false}
            animate={{ rotateY: flipped ? 0 : 180 }}
            transition={{ duration: 0.5, delay: i * 0.25 }}
            className="intro-card"
          >
            {flipped ? <RegionCardView region={r} bonus={me.bonus[i]} size="hand" /> : <CardBack size="hand" />}
          </motion.div>
        ))}
      </div>
      {flipped && state.rules.dishOfDay && (
        <div className="event-card">
          <b>
            {DAY_EVENTS[state.event].icon} Plat du jour : {DAY_EVENTS[state.event].name}
          </b>
          <span>{DAY_EVENTS[state.event].text}</span>
        </div>
      )}
      {flipped ? (
        <button className="btn btn-gold big block" onClick={onStart}>
          C’est parti ! 🍽️
        </button>
      ) : (
        <button className="btn btn-gold big block" onClick={() => setFlipped(true)}>
          {one ? 'Découvrir ma région 🔍' : 'Découvrir mes régions 🔍'}
        </button>
      )}
    </motion.div>
  );
}

/** Mains révélées après « À TABLE ! ». */
function Showdown({ state, onNext }: { state: GameState; onNext: () => void }) {
  const r = state.lastRound!;
  const w = r.winner;
  return (
    <motion.div className="showdown" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
      <motion.h2 className="atable-shout" initial={{ scale: 0.4, rotate: -8 }} animate={{ scale: 1, rotate: -3 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
        À TABLE !
      </motion.h2>
      {r.announcers.map((a) => (
        <div key={a} className={`show-hand${a === w ? ' winner' : ''}`}>
          <div className="show-who">
            {avatarOf(state, a)} <b>{state.players[a].name}</b>
            {a === w ? ' 🏆' : ''}
            {r.lateAnnouncers.includes(a) && <small> · Dernier service</small>}
            {r.bluffers.includes(a) && <b className="bluff-tag"> 🃏 Bluff raté : −1 ⭐ et la Vaisselle</b>}
          </div>
          <div className="show-cards">
            {r.hands[a].map((c) => (
              <CardView key={c.id} card={c} size="small" />
            ))}
          </div>
        </div>
      ))}
      {w !== null && r.menu && (
        <p className="show-result">
          <b>{state.players[w].name}</b> {w === 0 ? 'gagnes' : 'gagne'} {state.event === 'doubleEtoile' ? '2 étoiles ⭐⭐' : 'une étoile ⭐'} avec un menu <b>{MENU_LABELS[r.menu.type]}</b>
          {` (${r.menu.regions.map((x) => REGION_BY_ID[x].name).join(' + ')})`} !
          {r.tieBreak === 'vaisselle' && <><br /><small>Égalité : le plus proche du porteur de la Vaisselle, dans le sens du jeu, l’emporte.</small></>}
          {r.tieBreak === 'hasard' && <><br /><small>Égalité départagée au hasard.</small></>}
        </p>
      )}
      <button className="btn btn-gold block" onClick={onNext}>
        Révéler les régions 🔍
      </button>
    </motion.div>
  );
}

function denunciationText(state: GameState, d: NonNullable<GameController['lastDenunciation']>) {
  const a = state.players[d.accuser].name;
  const t = state.players[d.target].name;
  const region = REGION_BY_ID[d.region].name;
  const quote = `${a} : « ${t}, je te démasque : ${region} ! »`;
  if (d.correct) return `${quote} Bien vu ! ${t} prend la Vaisselle et doit changer de région.`;
  return `${quote} Raté ! ${d.accuser === 0 ? 'Tu gardes' : `${a} garde`} la Vaisselle.`;
}

export function Table({ game, guide, onRules, onQuit }: { game: GameController; guide: Guide | null; onRules: () => void; onQuit: () => void }) {
  const state = game.state!;
  const { stage } = game;
  const me = state.players[0];
  /** Cartes choisies (dans l'ordre), chacune avec son action : passer ou Marché. */
  const [picks, setPicks] = useState<Pick[]>([]);
  const need = passCountOf(state);
  const [showRegion, setShowRegion] = useState(false);
  const [denounceOpen, setDenounceOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [bluffAsk, setBluffAsk] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const validated = !!state.choices[0];
  const choosing = stage === 'choosing' && state.phase === 'choose';
  const humanMenu = state.phase === 'announce' ? announceableMenu(state, 0) : null;
  const announceErr = state.phase === 'announce' ? checkAnnounce(state, 0) : 'Pas maintenant';
  const frozenMe = state.frozen.includes(0);
  const ordersLeft = ordersAllowed(state) - state.orders.filter((o) => o.player === 0).length;
  const lastOrder = state.orders[state.orders.length - 1];
  const ev = DAY_EVENTS[state.event];
  const holder = vaisselleHolder(state);
  const left = leftOf(state, 0);
  const right = rightOf(state, 0);
  const top = state.discard[state.discard.length - 1];
  const f = (x: Focus) => (guide?.focus === x ? ' tuto-focus' : '');

  // Nouveau tour (ou carte disparue de la main) : on remet la sélection à zéro.
  useEffect(() => {
    if (picks.some((x) => !me.hand.some((c) => c.id === x.cardId))) setPicks((old) => old.filter((x) => me.hand.some((c) => c.id === x.cardId)));
  }, [me.hand, picks]);
  useEffect(() => {
    if (stage === 'thinking') setPicks([]);
  }, [stage]);
  useEffect(() => {
    game.setPaused(denounceOpen || orderOpen || eventOpen || bluffAsk);
  }, [denounceOpen, orderOpen, eventOpen, bluffAsk, game]);
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), 2200);
    return () => clearTimeout(t);
  }, [nudge]);

  const tapCard = (c: Card) => {
    if (!choosing || validated) return;
    if (picks.some((x) => x.cardId === c.id)) return setPicks(picks.filter((x) => x.cardId !== c.id));
    if (guide && !guide.allowCard(c.id)) return setNudge('Suis la bulle 😉');
    if (picks.length >= need) return setNudge(`${need} carte${need > 1 ? 's' : ''} maximum : retouche une carte pour l’enlever`);
    // « Plateau de fromages » : un fromage ne se passe pas, il va au Marché.
    const forced = state.event === 'fromagesBloques' && c.kind === 'dish' && c.course === 'fromage';
    setPicks([...picks, { cardId: c.id, mode: forced ? 'market' : 'pass' }]);
  };
  const pickMode = (cardId: string, m: Mode) => {
    if (guide && !guide.allowMode(cardId, m)) return setNudge('Suis la bulle 😉');
    setPicks(picks.map((x) => (x.cardId === cardId ? { cardId, mode: m } : x)));
  };
  const pickTarget = (cardId: string, target: number) => setPicks(picks.map((x) => (x.cardId === cardId ? { ...x, target } : x)));
  const pickGive = (cardId: string, give: string) => setPicks(picks.map((x) => (x.cardId === cardId ? { ...x, give } : x)));
  const effectOf = (x: Pick) => {
    const c = me.hand.find((y) => y.id === x.cardId);
    return c?.kind === 'effect' ? c.effect : null;
  };
  const needsTarget = (x: Pick) => x.mode === 'effect' && effectOf(x) !== 'demitour' && x.target === undefined;
  const needsGive = (x: Pick) => x.mode === 'effect' && effectOf(x) === 'chapardeur' && (!x.give || picks.some((y) => y.cardId === x.give));
  const validate = () => {
    if (picks.length !== need) return;
    if (picks.some(needsTarget)) return setNudge('Choisis le joueur visé 🎯');
    if (picks.some(needsGive)) return setNudge('Choisis la carte que tu rendras au joueur volé 🦊');
    const choice: Choice = { ...picks[0], extra: picks.slice(1) };
    if (guide && !guide.allowChoice(choice)) return setNudge('Suis la bulle 😉');
    const err = game.humanChoose(choice);
    if (err) setNudge(err);
    else guide?.done();
  };
  const denounceErr = checkDenounce(state, 0);
  const canDenounce = choosing && !validated && !denounceErr && (!guide || guide.allowDenounce);

  let bar;
  if (stage === 'thinking') bar = <div className="hint">Les chefs réfléchissent…</div>;
  else if (stage === 'revealing') bar = <div className="hint">Révélation ! Les cartes passent à gauche…</div>;
  else if (stage === 'marketPick') bar = <div className="hint">Marché ouvert : choisis ta carte…</div>;
  else if (stage === 'announcing') {
    const announce = () => {
      if (guide && !guide.allowAnnounce(true)) return;
      if (!humanMenu) return setBluffAsk(true);
      game.finishAnnouncements(true);
      guide?.done();
    };
    bar = announceErr ? (
      <div className="hint">{frozenMe ? 'Ta main est posée face cachée 🃏' : announceErr}</div>
    ) : humanMenu ? (
      <div className="row">
        <button className={`btn btn-gold big pulse${f('announce')}`} onClick={announce}>
          À TABLE ! 🔔
        </button>
        {!guide && (
          <button className="btn" onClick={() => game.finishAnnouncements(false)}>
            Attendre
          </button>
        )}
      </div>
    ) : (
      <div className="row">
        <span className="hint">Pas de menu complet…</span>
        {!guide && (
          <button className="btn small" onClick={announce} title="Annoncer quand même, face cachée">
            🃏 Bluffer
          </button>
        )}
      </div>
    );
  } else if (choosing && frozenMe) bar = <div className="hint">🃏 Ta main est posée face cachée — Dernier service des autres chefs…</div>;
  else if (choosing && validated) bar = <div className="hint">Cartes validées ✓ — on attend les autres…</div>;
  else if (choosing)
    bar = (
      <div className={`actions${f('actions')}`}>
        <div className="picks">
          {Array.from({ length: need }, (_, k) => {
            const pk = picks[k];
            const card = pk && me.hand.find((c) => c.id === pk.cardId);
            if (!pk || !card) return <div key={k} className="pick empty">Carte {k + 1} ?</div>;
            return (
              <div key={k} className="pick">
                <span className="pick-name">{card.name}</span>
                <span className="pick-modes">
                  <button
                    className={pk.mode === 'pass' ? 'active' : ''}
                    disabled={state.event === 'fromagesBloques' && card.kind === 'dish' && card.course === 'fromage'}
                    onClick={() => pickMode(pk.cardId, 'pass')}
                    aria-label="Passer au voisin"
                  >
                    {card.kind === 'effect' ? '⬅' : '⬅ Passer'}
                  </button>
                  <button
                    className={pk.mode === 'market' ? 'active' : ''}
                    disabled={card.kind === 'vaisselle'}
                    onClick={() => pickMode(pk.cardId, 'market')}
                    title={card.kind === 'vaisselle' ? 'La Vaisselle ne va jamais au Marché' : 'Marché'}
                  >
                    {card.kind === 'effect' ? '🧺' : '🧺 Marché'}
                  </button>
                  {card.kind === 'effect' && (
                    <button className={`play${pk.mode === 'effect' ? ' active' : ''}`} onClick={() => pickMode(pk.cardId, 'effect')}>
                      ✨ Jouer
                    </button>
                  )}
                </span>
                {card.kind === 'effect' && card.effect !== 'demitour' && pk.mode === 'effect' && (
                  <span className="pick-targets">
                    {state.players.map((pl, i) =>
                      i === 0 || (card.effect !== 'controle' && state.frozen.includes(i)) ? null : (
                        <button key={i} className={pk.target === i ? 'active' : ''} onClick={() => pickTarget(pk.cardId, i)} title={pl.name}>
                          {pl.name}
                        </button>
                      ),
                    )}
                  </span>
                )}
                {card.kind === 'effect' && card.effect === 'chapardeur' && pk.mode === 'effect' && (
                  <select className="pick-give" value={pk.give ?? ''} onChange={(e) => pickGive(pk.cardId, e.target.value)}>
                    <option value="">Carte à lui rendre…</option>
                    {me.hand
                      .filter((c) => c.kind !== 'vaisselle' && !picks.some((y) => y.cardId === c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
        <div className="row">
          <button className={`btn btn-red${f('denounce')}`} disabled={!canDenounce} onClick={() => setDenounceOpen(true)} title={denounceErr ?? undefined}>
            🕵️{holder !== 0 ? ' 🔒' : ' Dénoncer'}
          </button>
          {state.rules.commande !== 'aucune' && !guide && (
            <button className="btn" disabled={ordersLeft <= 0 || validated} onClick={() => setOrderOpen(true)} title="Passer la commande (une fois par manche)">
              📝
            </button>
          )}
          <button className="btn btn-green grow" disabled={picks.length !== need} onClick={validate}>
            {picks.length === need ? 'Valider ✓' : `Choisis ${need} carte${need > 1 ? 's' : ''} (${picks.length}/${need})`}
          </button>
        </div>
      </div>
    );

  return (
    <div className="table">
      <header className="topbar">
        <button className="icon-btn" onClick={onQuit} aria-label="Quitter">
          ✕
        </button>
        <div className="topbar-title">
          À TABLE ! <small>Manche {state.roundNumber} · Tour {state.turn}</small>
          {state.rules.dishOfDay && (
            <button className="event-chip" onClick={() => setEventOpen(true)} title={ev.text}>
              {ev.icon} {ev.name}
            </button>
          )}
        </div>
        <button className="icon-btn" onClick={onRules} aria-label="Règles">
          ?
        </button>
      </header>

      <section className={`opponents n${state.players.length - 1}${f('opponents')}`}>
        {state.players.map((_, p) =>
          p === 0 ? null : (
            <Seat key={p} state={state} p={p} ready={!!state.choices[p]} thinking={choosing && !state.choices[p]} isLeft={p === left} isRight={p === right && p !== left} />
          ),
        )}
      </section>

      <section className="center">
        <div className={`piles${f('piles')}`}>
          <div className="pile" data-pile="draw">
            <CardBack size="small" />
            <small>Pioche · {state.drawPile.length}</small>
          </div>
          <div className="pile" data-pile="discard">
            {top ? <CardView card={top} size="small" /> : <div className="card card-small empty">Marché</div>}
            <small>Défausse · {state.discard.length}</small>
          </div>
          {Object.values(state.rules.effects).some((n) => (n ?? 0) > 0) && (
            <div className="pile" data-pile="special" title="Pile spéciale : cartes à effet déjà jouées (hors jeu)">
              {state.specialPile.length ? <CardView card={state.specialPile[state.specialPile.length - 1]} size="small" /> : <div className="card card-small empty">Effets</div>}
              <small>Spéciale · {state.specialPile.length}</small>
            </div>
          )}
        </div>
        <AnimatePresence>
          {state.lastService && (stage === 'choosing' || stage === 'thinking') && (
            <motion.div key="ls" className="banner gold" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
              🔔 Dernier service ! {state.frozen.map((p) => (p === 0 ? 'Toi' : state.players[p].name)).join(', ')} {state.frozen.length > 1 ? 'ont' : state.frozen[0] === 0 ? 'as' : 'a'} annoncé face cachée : un dernier échange, puis on révèle.
            </motion.div>
          )}
          {lastOrder && lastOrder.turn === state.turn && (stage === 'choosing' || stage === 'thinking') && (
            <motion.div key="order" className="banner" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
              📝 {lastOrder.player === 0 ? 'Tu demandes' : `${state.players[lastOrder.player].name} demande`} : « Qui a {lastOrder.cardId ? cardById(lastOrder.cardId).name : lastOrder.course} ? » —{' '}
              {lastOrder.yes.length ? lastOrder.yes.map((p) => (p === 0 ? 'Toi' : state.players[p].name)).join(', ') + ' : oui !' : 'personne !'}
            </motion.div>
          )}
          {game.lastDenunciation && (stage === 'choosing' || stage === 'thinking') && (
            <motion.div className={`banner${game.lastDenunciation.correct ? ' good' : ' bad'}`} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
              🕵️ {denunciationText(state, game.lastDenunciation)}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="me">
        <div className="me-info">
          <button className={`region-corner${showRegion ? ' open' : ''}${f('region')}`} onClick={() => setShowRegion((v) => !v)} aria-label="Mes régions secrètes">
            {showRegion ? (
              me.regions.map((r, i) => <RegionCardView key={r} region={r} bonus={me.bonus[i]} size="mini" />)
            ) : (
              <span className="region-hidden">🔒<small>{me.regions.length > 1 ? 'Mes régions' : 'Ma région'}</small></span>
            )}
          </button>
          <div className="me-name">
            <b>Toi</b> <Stars n={me.etoiles} max={state.etoilesToWin} />
          </div>
          {holder === 0 && (
            <span className={`me-plate${f('vaisselle')}`} title="Tu as la Vaisselle">
              <DirtyPlate size={34} />
            </span>
          )}
          <span className={`pass-dir${state.direction === -1 ? ' reversed' : ''}`} title={state.direction === -1 ? 'Sens inversé par un Demi-tour' : 'Sens normal'}>
            {state.direction === -1 ? '🔄 ' : '⬅ '}vers {state.players[left].name}
          </span>
        </div>
        <MenuGauge state={state} revealed={showRegion} focus={guide?.focus === 'gauge'} />
        <div className={`hand${f('hand')}`} data-seat={0}>
          {me.hand.map((c) => (
            <CardView
              key={c.id}
              card={c}
              own={showRegion ? me.regions : undefined}
              selected={picks.some((x) => x.cardId === c.id)}
              dim={stage === 'revealing' && picks.some((x) => x.cardId === c.id)}
              onClick={choosing && !validated ? () => tapCard(c) : undefined}
            />
          ))}
        </div>
        <div className="bar">{bar}</div>
      </section>

      {game.fx && <ExchangeOverlay moves={game.fx.moves} fxKey={game.fx.key} />}

      <AnimatePresence>
        {(nudge || game.toast) && (
          <motion.div className="toast" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
            {nudge ?? game.toast}
          </motion.div>
        )}
      </AnimatePresence>

      {stage === 'intro' && (
        <div className="overlay">
          <RegionsIntro state={state} onStart={game.beginRound} />
        </div>
      )}

      {stage === 'showdown' && state.lastRound && (
        <div className="overlay">
          <Showdown
            state={state}
            onNext={() => {
              if (guide?.canNext) guide.next();
              game.goRoundEnd();
            }}
          />
        </div>
      )}

      <DenounceModal
        state={state}
        open={denounceOpen}
        guide={guide}
        onClose={() => setDenounceOpen(false)}
        onConfirm={(t, r, shown) => {
          const err = game.humanDenounce(t, r, shown);
          setDenounceOpen(false);
          if (err) setNudge(err);
          else guide?.done();
        }}
      />

      {stage === 'marketPick' && <MarketPickModal state={state} onPick={game.humanTake} />}

      <OrderModal
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        onConfirm={(id) => {
          const err = game.humanOrder(id);
          setOrderOpen(false);
          if (err) setNudge(err);
        }}
      />

      <Modal open={eventOpen} title={`${ev.icon} Plat du jour : ${ev.name}`} onClose={() => setEventOpen(false)}>
        <p className="big-line">{ev.text}</p>
      </Modal>

      <Modal open={bluffAsk} title="Bluffer ? 🃏" onClose={() => setBluffAsk(false)}>
        <p>Ton menu n’est pas complet. Tu peux quand même crier « À TABLE ! » face cachée… mais si on te démasque à la révélation : −1 ⭐ et la Vaisselle !</p>
        <div className="row">
          <button
            className="btn btn-gold grow"
            onClick={() => {
              setBluffAsk(false);
              game.finishAnnouncements(true);
            }}
          >
            Je bluffe ! 😏
          </button>
          <button className="btn grow" onClick={() => setBluffAsk(false)}>
            Non
          </button>
        </div>
      </Modal>

      {guide && <TutorialBubble guide={guide} top={stage === 'showdown' || stage === 'intro'} />}
    </div>
  );
}

export function TutorialBubble({ guide, top }: { guide: Guide; top?: boolean }) {
  const low = ['opponents', 'piles'].includes(guide.focus ?? '');
  return (
    <motion.div key={guide.text} className={`bubble${top ? ' top' : low ? ' low' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="bubble-chef">👨‍🍳</span>
      <p>{guide.text}</p>
      {guide.canNext && (
        <button className="btn btn-gold small" onClick={guide.next}>
          Suivant ▸
        </button>
      )}
    </motion.div>
  );
}
