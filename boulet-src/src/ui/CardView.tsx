// Affichage d'une carte (face ou dos), entièrement en CSS + SVG.
import { motion } from 'framer-motion';
import type { Card } from '../engine';
import { BouletArt, JokerArt, ReverseArt, SkipArt } from './Art';

export type CardLook = 'normal' | 'playable' | 'dim' | 'selected';

interface Props {
  card: Card;
  look?: CardLook;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  /** Ordre de sélection (1 ou 2) affiché en pastille pour les doubles. */
  badge?: number;
  /** Direction d'arrivée pour l'animation (pose / pioche). */
  enterFrom?: 'top' | 'bottom' | 'none';
}

const DIM = { sm: 44, md: 68, lg: 84 };

function Corner({ card }: { card: Card }) {
  const t = card.kind === 'number' ? card.value : card.kind === 'plus2' ? '+2' : card.kind === 'reverse' ? '⇄' : card.kind === 'skip' ? '⊘' : '';
  return <span className="corner">{t}</span>;
}

function Face({ card, px }: { card: Card; px: number }) {
  const big = Math.round(px * 0.62);
  switch (card.kind) {
    case 'number':
      return <span className="num" style={{ fontSize: big }}>{card.value}</span>;
    case 'plus2':
      return <span className="num plus" style={{ fontSize: Math.round(big * 0.8) }}>+2</span>;
    case 'reverse':
      return <ReverseArt size={Math.round(px * 0.55)} color="currentColor" />;
    case 'skip':
      return <SkipArt size={Math.round(px * 0.52)} color="currentColor" />;
    case 'joker':
      return <JokerArt size={Math.round(px * 0.7)} />;
    case 'boulet':
      return <BouletArt size={Math.round(px * 0.9)} />;
  }
}

export function CardView({ card, look = 'normal', size = 'md', onClick, badge, enterFrom = 'none' }: Props) {
  const px = DIM[size];
  const colorClass = card.color ?? card.kind;
  const initial = enterFrom === 'none' ? false : { y: enterFrom === 'top' ? -120 : 120, opacity: 0, scale: 0.7, rotate: -8 };
  const label =
    card.kind === 'number' ? `${card.value} ${card.color}` : card.kind === 'boulet' ? 'Boulet' : `${card.kind} ${card.color ?? ''}`;
  return (
    <motion.button
      type="button"
      layout
      initial={initial}
      animate={{ y: look === 'selected' ? -18 : 0, opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={`card ${colorClass} ${look} ${size}`}
      style={{ width: px, height: Math.round(px * 1.5) }}
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      aria-pressed={look === 'selected'}
    >
      {card.kind !== 'boulet' && card.kind !== 'joker' && <Corner card={card} />}
      <span className="oval">
        <Face card={card} px={px} />
      </span>
      {badge !== undefined && <span className="badge">{badge}</span>}
    </motion.button>
  );
}

/** Dos de carte (pioche, mains adverses). */
export function CardBack({ size = 'md', onClick, highlight }: { size?: 'sm' | 'md' | 'lg'; onClick?: () => void; highlight?: boolean }) {
  const px = DIM[size];
  return (
    <button
      type="button"
      className={`card back ${size} ${highlight ? 'playable' : ''}`}
      style={{ width: px, height: Math.round(px * 1.5) }}
      onClick={onClick}
      disabled={!onClick}
      aria-label="Pioche"
    >
      <span className="back-inner">
        <BouletArt size={Math.round(px * 0.6)} />
        {size !== 'sm' && <span className="back-title">BOULET !</span>}
      </span>
    </button>
  );
}
