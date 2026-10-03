// Affichage des cartes : version provisoire (couleur de région, icône, nom en gros),
// remplacée automatiquement par l'illustration public/cards/<id>.png si elle existe.
import { useState } from 'react';
import { CARD_IMAGE_EXT, COURSES, COURSE_ICONS, COURSE_LABELS, REGION_BY_ID, SPECIALS, USE_CARD_IMAGES } from '../config/cards';
import { imageId, type Card, type Course, type RegionId } from '../engine';

/** Illustrations absentes déjà repérées : on ne les redemande pas au serveur. */
const missing = new Set<string>();

/** Image de carte personnalisée, affichée par-dessus la version provisoire si elle se charge. */
function CardImage({ id }: { id: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(missing.has(id));
  if (!USE_CARD_IMAGES || failed) return null;
  return (
    <img
      className="card-img"
      style={{ opacity: loaded ? 1 : 0 }}
      src={`${import.meta.env.BASE_URL}cards/${id}.${CARD_IMAGE_EXT}`}
      alt=""
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => {
        missing.add(id);
        setFailed(true);
      }}
    />
  );
}

export type CardSize = 'hand' | 'small' | 'mini';

/** L'assiette sale de la Vaisselle (SVG fait main). */
export function DirtyPlate({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Vaisselle" role="img">
      <circle cx="32" cy="32" r="29" fill="#f4f1ea" stroke="#9aa3ad" strokeWidth="3" />
      <circle cx="32" cy="32" r="19" fill="#fff" stroke="#c9ced4" strokeWidth="2" />
      <path d="M20 26c4-6 9-2 12-6 3 5 9 1 11 7-3 2-1 6-6 6-2 4-9 3-10-1-5 1-9-2-7-6z" fill="#b5651d" opacity="0.75" />
      <circle cx="44" cy="40" r="3" fill="#7a9a2b" />
      <circle cx="22" cy="41" r="2.4" fill="#b5651d" opacity="0.8" />
      <path d="M38 44c3 1 5-1 6 2" stroke="#c0392b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M50 14l4-4M53 18l5-2M46 10l1-5" stroke="#8fb3d9" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CardView({ card, size = 'hand', selected, dim, onClick, own }: {
  card: Card;
  size?: CardSize;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  /** Régions secrètes du joueur (si affichées) : met en valeur ses propres cartes. */
  own?: readonly RegionId[];
}) {
  const cls = ['card', `card-${size}`, `card-${card.kind}`, selected && 'selected', dim && 'dim', onClick && 'tappable'].filter(Boolean).join(' ');
  const Tag = onClick ? 'button' : 'div';

  if (card.kind === 'dish') {
    const r = REGION_BY_ID[card.region];
    return (
      <Tag className={cls} style={{ ['--rc' as string]: r.color, ['--ri' as string]: r.ink }} onClick={onClick} aria-label={`${card.name}, ${COURSE_LABELS[card.course]}, ${r.name}`}>
        <span className="card-band">
          {r.name}
          {own?.includes(card.region) && <span className="card-star" title="Ta région"> ★</span>}
        </span>
        <span className="card-icon">{COURSE_ICONS[card.course]}</span>
        <span className="card-name">{card.name}</span>
        <span className="card-course">{COURSE_LABELS[card.course]}</span>
        <CardImage id={imageId(card.id)} />
      </Tag>
    );
  }
  const special = SPECIALS[card.kind];
  return (
    <Tag className={cls} onClick={onClick} aria-label={`${special.name} : ${special.hint}`}>
      <span className="card-band">{card.kind === 'baguette' ? 'Joker' : 'À refiler !'}</span>
      <span className="card-icon">{card.kind === 'vaisselle' ? <DirtyPlate size={size === 'hand' ? 40 : 24} /> : special.icon}</span>
      <span className="card-name">{special.name}</span>
      <span className="card-course">{size === 'hand' ? special.hint : ''}</span>
      <CardImage id={imageId(card.id)} />
    </Tag>
  );
}

/** Dos de carte (pioche, mains adverses, cartes qui volent). */
export function CardBack({ size = 'mini' }: { size?: CardSize }) {
  return (
    <div className={`card card-${size} card-back`} aria-hidden>
      <span className="back-logo">À&nbsp;TABLE&nbsp;!</span>
      <CardImage id="back" />
    </div>
  );
}

/** Carte Région secrète (face visible), avec le plat qu'elle représente. */
export function RegionCardView({ region, size = 'small', bonus }: { region: RegionId; size?: CardSize; bonus?: Course | null }) {
  const r = REGION_BY_ID[region];
  return (
    <div className={`card card-${size} card-region`} style={{ ['--rc' as string]: r.color, ['--ri' as string]: r.ink }}>
      <span className="card-band">Région</span>
      <span className="card-icon">{r.emblem}</span>
      <span className="card-name">{r.name}</span>
      {bonus && (
        <span className="card-bonus" title={`Compte comme : ${r.dishes[COURSES.indexOf(bonus)]} (${COURSE_LABELS[bonus]})`}>
          = {COURSE_ICONS[bonus]}
          {size === 'hand' && ` ${r.dishes[COURSES.indexOf(bonus)]}`}
        </span>
      )}
      <CardImage id={`region-${region}`} />
    </div>
  );
}

/** Pastille de région (régions en jeu, choix de dénonciation). */
export function RegionChip({ region, onClick, active }: { region: RegionId; onClick?: () => void; active?: boolean }) {
  const r = REGION_BY_ID[region];
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag className={`chip${active ? ' active' : ''}`} style={{ background: r.color, color: r.ink }} onClick={onClick}>
      {r.emblem} {r.name}
    </Tag>
  );
}
