// Fabrication des cartes et évaluation des menus.
import { COURSES, REGIONS, REGION_BY_ID, SPECIALS } from '../config/cards';
import { MENU_RANK, type BaguetteCard, type Card, type DishCard, type Menu, type MenuDuJourRule, type MenuType, type RegionId, type VaisselleCard } from './types';

export const ALL_REGION_IDS: RegionId[] = REGIONS.map((r) => r.id);

export const BAGUETTE: BaguetteCard = { kind: 'baguette', id: 'baguette', name: SPECIALS.baguette.name };
export const VAISSELLE: VaisselleCard = { kind: 'vaisselle', id: 'vaisselle', name: SPECIALS.vaisselle.name };

/** Les 4 cartes d'une région, dans l'ordre du repas. */
export function regionCards(region: RegionId): DishCard[] {
  const cfg = REGION_BY_ID[region];
  if (!cfg) throw new Error(`Région inconnue : ${region}`);
  return COURSES.map((course, i) => ({ kind: 'dish', id: `${region}-${course}`, region, course, name: cfg.dishes[i] }));
}

/** Toutes les cartes d'une manche : 4 par région en jeu + Baguette + Vaisselle. */
export function buildDeck(regions: RegionId[]): Card[] {
  return [...regions.flatMap(regionCards), BAGUETTE, VAISSELLE];
}

/** Retrouve une carte par son identifiant (toutes régions confondues). */
export function cardById(id: string): Card {
  if (id === 'baguette') return BAGUETTE;
  if (id === 'vaisselle') return VAISSELLE;
  const card = ALL_REGION_IDS.flatMap(regionCards).find((c) => c.id === id);
  if (!card) throw new Error(`Carte inconnue : ${id}`);
  return card;
}

const isDish = (c: Card): c is DishCard => c.kind === 'dish';

/**
 * Évalue une main de 4 cartes pour un joueur dont la région secrète est `own`.
 * Renvoie le meilleur menu possible, ou null si la main n'est pas un menu valide.
 * (La Vaisselle n'est jamais un menu : elle bloque l'annonce.)
 * `menuDuJour` permet de tester des variantes d'équilibrage (voir la page /sim) ;
 * la règle officielle est « standard ».
 */
export function evaluateMenu(hand: readonly Card[], own: RegionId, menuDuJour: MenuDuJourRule = 'standard'): Menu | null {
  if (hand.length !== 4 || hand.some((c) => c.kind === 'vaisselle')) return null;
  const dishes = hand.filter(isDish);
  const jokers = hand.length - dishes.length; // 0 ou 1 Baguette
  // Un menu = un plat de chaque type ; la Baguette bouche le trou restant.
  const courses = new Set(dishes.map((d) => d.course));
  if (courses.size !== dishes.length || courses.size + jokers !== 4) return null;

  const regions = new Set(dishes.map((d) => d.region));
  let type: MenuType = 'jour';
  let region: RegionId | undefined;
  if (regions.size === 1) {
    region = dishes[0].region;
    if (region === own) type = jokers === 0 ? 'gastronomique' : 'maison';
    else type = 'vole';
  }
  if (type === 'jour') {
    // Variantes d'équilibrage du Menu du Jour.
    if (menuDuJour === 'interdit') return null;
    if (menuDuJour === 'sansBaguette' && jokers > 0) return null;
    if (menuDuJour === 'deuxRegions' && regions.size > 2) return null;
    if (menuDuJour === 'deuxMaison' && countRegion(hand, own) < 2) return null;
  }
  return { type, rank: MENU_RANK[type], region };
}

/** Nombre de cartes de la région `region` dans la main. */
export function countRegion(hand: readonly Card[], region: RegionId): number {
  return hand.filter((c) => c.kind === 'dish' && c.region === region).length;
}
