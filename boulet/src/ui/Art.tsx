// Dessins SVG faits main : le Boulet de bagnard, les symboles d'action, les flèches.
import { useId } from 'react';

/** Boulet de bagnard avec sa chaîne et son anneau de cheville. */
export function BouletArt({ size = 64, title = 'Boulet' }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}>
      <defs>
        <radialGradient id={`ball${id}`} cx="38%" cy="34%" r="70%">
          <stop offset="0%" stopColor="#9aa1ab" />
          <stop offset="35%" stopColor="#4a5059" />
          <stop offset="100%" stopColor="#111418" />
        </radialGradient>
        <linearGradient id={`iron${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c9ced6" />
          <stop offset="100%" stopColor="#5c626b" />
        </linearGradient>
      </defs>
      {/* Anneau de cheville */}
      <ellipse cx="18" cy="20" rx="13" ry="9" fill="none" stroke={`url(#iron${id})`} strokeWidth="5" />
      <rect x="27" y="17" width="7" height="6" rx="1.5" fill="#6b717a" />
      {/* Chaîne : maillons alternés */}
      {[
        [38, 26, 30],
        [45, 33, -60],
        [51, 41, 30],
        [56, 49, -60],
      ].map(([x, y, r], i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx="5.5"
          ry="3.4"
          transform={`rotate(${r} ${x} ${y})`}
          fill="none"
          stroke={`url(#iron${id})`}
          strokeWidth="2.6"
        />
      ))}
      {/* Œillet sur le boulet */}
      <circle cx="60" cy="55" r="4.5" fill="none" stroke="#5c626b" strokeWidth="3" />
      {/* Le boulet */}
      <circle cx="64" cy="72" r="24" fill={`url(#ball${id})`} stroke="#0b0d10" strokeWidth="1.5" />
      <ellipse cx="55" cy="62" rx="7" ry="4.5" fill="#ffffff" opacity="0.35" transform="rotate(-30 55 62)" />
      {/* Quelques bosses de fonte */}
      <circle cx="74" cy="80" r="2" fill="#000" opacity="0.35" />
      <circle cx="68" cy="88" r="1.4" fill="#000" opacity="0.3" />
      <circle cx="80" cy="69" r="1.6" fill="#000" opacity="0.3" />
    </svg>
  );
}

/** Symbole « Inversion » : deux flèches opposées. */
export function ReverseArt({ size = 40, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <path d="M8 15 H28 M22 8 L29 15 L22 22" fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 26 H12 M18 19 L11 26 L18 33" fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Symbole « Passe » : sens interdit. */
export function SkipArt({ size = 40, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="14" fill="none" stroke={color} strokeWidth="5" />
      <line x1="10" y1="30" x2="30" y2="10" stroke={color} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** Disque 4 couleurs du Joker. */
export function JokerArt({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <path d="M20 20 L20 2 A18 18 0 0 1 38 20 Z" fill="var(--rouge)" />
      <path d="M20 20 L38 20 A18 18 0 0 1 20 38 Z" fill="var(--bleu)" />
      <path d="M20 20 L20 38 A18 18 0 0 1 2 20 Z" fill="var(--vert)" />
      <path d="M20 20 L2 20 A18 18 0 0 1 20 2 Z" fill="var(--jaune)" />
      <circle cx="20" cy="20" r="18" fill="none" stroke="#fff" strokeWidth="2.5" />
      <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff" stroke="#000" strokeWidth="0.8">
        ★
      </text>
    </svg>
  );
}

/** Flèche circulaire indiquant le sens du jeu. */
export function DirectionArt({ direction, size = 44 }: { direction: 1 | -1; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ transform: direction === 1 ? undefined : 'scaleX(-1)' }} aria-hidden>
      <path d="M33 20 A13 13 0 1 1 26 8.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M21 4 L28 8 L23 14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
