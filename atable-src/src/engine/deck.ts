// Fabrication des cartes et évaluation des menus.
import { COURSES, HAND_SIZE, REGIONS, REGION_BY_ID, SPECIALS } from '../config/cards';
import { MENU_RANK, type BaguetteCard, type Card, type DishCard, type Menu, type MenuType, type RegionId, type VaisselleCard } from './types';

export const ALL_REGION_IDS: RegionId[] = REGIONS.map((r) => r.id);

export const BAGUETTE: BaguetteCard = { kind: 'baguette', id: 'baguette', name: SPECIALS.baguette.name };
export const VAISSELLE: VaisselleCard = { kind: 'vaisselle', id: 'vaisselle', name: SPECIALS.vaisselle.name };

/** Les 4 cartes d'une région, dans l'ordre du repas. */
export function regionCards(region: RegionId): DishCard[] {
  const cfg = REGION_BY_ID[region];
  if (!cfg) throw new Error(`Région inconnue : ${region}`);
  return COURSES.map((course, i) => ({ kind: 'dish', id: `${region}-${course}`, region, course, name: cfg.dishes[i] }));
}

/** Toutes les cartes d'une manche : 4 par région + Baguette + Vaisselle. */
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
 * Évalue une main de 8 cartes pour un joueur dont les régions secrètes sont `own`.
 * Une main gagnante = 2 menus complets, chacun fait des 4 plats d'UNE même région
 * (plus de régions mélangées). La Baguette peut remplacer un seul plat manquant.
 * Renvoie le menu annoncé, ou null si la main n'est pas gagnante.
 * (La Vaisselle bloque toujours l'annonce.)
 */
export function evaluateMenu(hand: readonly Card[], own: readonly RegionId[]): Menu | null {
  if (hand.length !== HAND_SIZE || hand.some((c) => c.kind === 'vaisselle')) return null;
  const dishes = hand.filter(isDish);
  const jokers = hand.length - dishes.length; // 0 ou 1 Baguette
  const byRegion = new Map<RegionId, number>();
  for (const d of dishes) byRegion.set(d.region, (byRegion.get(d.region) ?? 0) + 1);
  // Exactement 2 régions : 4 + 4 cartes, ou 4 + 3 cartes et la Baguette.
  // (Chaque plat n'existe qu'en un exemplaire : 4 cartes d'une région = un menu complet.)
  if (byRegion.size !== 2) return null;
  const counts = [...byRegion.values()].sort((a, b) => b - a);
  const ok = jokers === 0 ? counts[0] === 4 && counts[1] === 4 : counts[0] === 4 && counts[1] === 3;
  if (!ok) return null;

  const regions = [...byRegion.keys()];
  const mine = regions.every((r) => own.includes(r));
  const type: MenuType = !mine ? 'vole' : jokers === 0 ? 'gastronomique' : 'maison';
  return { type, rank: MENU_RANK[type], regions };
}

/** Avancement de chaque région secrète : combien de ses 4 plats sont en main. */
export function menuProgress(hand: readonly Card[], own: readonly RegionId[]): { region: RegionId; have: Set<string> }[] {
  return own.map((region) => ({ region, have: new Set(hand.filter((c): c is DishCard => isDish(c) && c.region === region).map((c) => c.course)) }));
}

/** Nombre de cartes de la région `region` dans la main. */
export function countRegion(hand: readonly Card[], region: RegionId): number {
  return hand.filter((c) => c.kind === 'dish' && c.region === region).length;
}
