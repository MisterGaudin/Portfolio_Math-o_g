// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION DES CARTES — fichier à modifier librement.
//
// • Pour renommer un plat : change simplement le texte ci-dessous.
// • Pour changer une couleur de région : modifie `color` (fond) et `ink` (texte).
// • Pour utiliser tes illustrations : dépose une image par carte dans
//   public/cards/, nommée par l'identifiant de la carte (ex. « alsace-plat.png »).
//   La liste complète des identifiants est dans public/cards/README.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Les 4 types de plats d'un menu, dans l'ordre du repas. */
export const COURSES = ['entree', 'plat', 'fromage', 'dessert'] as const;
export type Course = (typeof COURSES)[number];

export const COURSE_LABELS: Record<Course, string> = {
  entree: 'Entrée',
  plat: 'Plat',
  fromage: 'Fromage',
  dessert: 'Dessert',
};

/** Icône provisoire de chaque type de plat. */
export const COURSE_ICONS: Record<Course, string> = {
  entree: '🥗',
  plat: '🍲',
  fromage: '🧀',
  dessert: '🍰',
};

export interface RegionConfig {
  id: string;
  name: string;
  /** Couleur de fond des cartes de la région. */
  color: string;
  /** Couleur du texte sur cette couleur de fond. */
  ink: string;
  /** Petit emblème affiché sur la carte Région secrète. */
  emblem: string;
  /** Les 4 spécialités, dans l'ordre Entrée / Plat / Fromage / Dessert. */
  dishes: [string, string, string, string];
}

export const REGIONS: RegionConfig[] = [
  { id: 'normandie', name: 'Normandie', color: '#4f8a3c', ink: '#ffffff', emblem: '🍏', dishes: ["Huîtres d'Isigny", "Poulet Vallée d'Auge", 'Camembert', 'Teurgoule'] },
  { id: 'alsace', name: 'Alsace', color: '#c0392b', ink: '#ffffff', emblem: '🥨', dishes: ['Tarte flambée', 'Choucroute', 'Munster', 'Kougelhopf'] },
  { id: 'savoie', name: 'Savoie', color: '#2f6db5', ink: '#ffffff', emblem: '🏔️', dishes: ['Salade savoyarde', 'Tartiflette', 'Reblochon', 'Gâteau de Savoie'] },
  { id: 'provence', name: 'Provence', color: '#8e5cc4', ink: '#ffffff', emblem: '🌿', dishes: ['Tapenade', 'Bouillabaisse', 'Banon', 'Calissons'] },
  { id: 'sud-ouest', name: 'Sud-Ouest', color: '#8a2846', ink: '#ffffff', emblem: '🦆', dishes: ['Foie gras', 'Cassoulet', 'Ossau-Iraty', 'Canelé'] },
  { id: 'lyonnais', name: 'Lyonnais', color: '#e07b1f', ink: '#1d1300', emblem: '🦁', dishes: ['Salade lyonnaise', 'Quenelles', 'Saint-Marcellin', 'Bugnes'] },
  { id: 'bretagne', name: 'Bretagne', color: '#1f2d44', ink: '#ffffff', emblem: '⚓', dishes: ['Huîtres de Cancale', 'Kig ha farz', 'Curé nantais', 'Crêpes'] },
  { id: 'nord', name: 'Nord', color: '#d9a404', ink: '#1d1300', emblem: '🍺', dishes: ['Potjevleesch', 'Carbonade flamande', 'Maroilles', 'Gaufre'] },
];

/** Cartes spéciales. */
export const SPECIALS = {
  baguette: { id: 'baguette', name: 'Baguette', icon: '🥖', hint: 'Remplace n’importe quelle carte' },
  vaisselle: { id: 'vaisselle', name: 'Vaisselle', icon: '🍽️', hint: 'Pas d’annonce avec elle !' },
} as const;

/** Format des illustrations déposées dans public/cards/. */
export const CARD_IMAGE_EXT = 'png';
/** Mets `false` pour ne jamais chercher d'illustration (cartes provisoires uniquement). */
export const USE_CARD_IMAGES = true;

/** Accès rapide à une région par son identifiant. */
export const REGION_BY_ID: Record<string, RegionConfig> = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
