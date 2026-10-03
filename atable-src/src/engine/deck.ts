// Fabrication des cartes et évaluation des menus.
import { COURSES, HAND_SIZE, REGIONS, REGION_BY_ID, SPECIALS } from '../config/cards';
import { MENU_RANK, type BaguetteCard, type Card, type Course, type DishCard, type Menu, type MenuType, type RegionId, type VaisselleCard } from './types';

export const ALL_REGION_IDS: RegionId[] = REGIONS.map((r) => r.id);

export const BAGUETTE: BaguetteCard = { kind: 'baguette', id: 'baguette', name: SPECIALS.baguette.name };
export const VAISSELLE: VaisselleCard = { kind: 'vaisselle', id: 'vaisselle', name: SPECIALS.vaisselle.name };

/** Les 4 cartes d'une région, dans l'ordre du repas. */
export function regionCards(region: RegionId): DishCard[] {
  const cfg = REGION_BY_ID[region];
  if (!cfg) throw new Error(`Région inconnue : ${region}`);
  return COURSES.map((course, i) => ({ kind: 'dish', id: `${region}-${course}`, region, course, name: cfg.dishes[i] }));
}

/**
 * Toutes les cartes d'une manche : 4 plats par région (en `copies` exemplaires) + Baguette + Vaisselle.
 * Les doubles ont un identifiant suffixé : « alsace-fromage-2 » (même illustration).
 */
export function buildDeck(regions: RegionId[], copies = 1): Card[] {
  const dishes = regions.flatMap((r) => Array.from({ length: copies }, (_, k) => regionCards(r).map((d) => (k === 0 ? d : { ...d, id: `${d.id}-${k + 1}` }))).flat());
  return [...dishes, BAGUETTE, VAISSELLE];
}

/** Identifiant de l'illustration d'une carte (les doubles partagent celle de l'original). */
export const imageId = (id: string) => id.replace(/-\d+$/, '');

/** Retrouve une carte par son identifiant (toutes régions confondues). */
export function cardById(id: string): Card {
  if (id === 'baguette') return BAGUETTE;
  if (id === 'vaisselle') return VAISSELLE;
  const copy = /-(\d+)$/.exec(id);
  const base = copy ? id.slice(0, -copy[0].length) : id;
  const card = ALL_REGION_IDS.flatMap(regionCards).find((c) => c.id === base);
  if (!card) throw new Error(`Carte inconnue : ${id}`);
  return copy ? { ...card, id } : card;
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
  // Exactement 2 régions : 4 + 4 cartes, ou 4 + 3 cartes et la Baguette,
  // sans deux fois le même plat (utile quand les plats existent en plusieurs exemplaires).
  if (byRegion.size !== 2) return null;
  if (new Set(dishes.map((d) => `${d.region}-${d.course}`)).size !== dishes.length) return null;
  const counts = [...byRegion.values()].sort((a, b) => b - a);
  const ok = jokers === 0 ? counts[0] === 4 && counts[1] === 4 : counts[0] === 4 && counts[1] === 3;
  if (!ok) return null;

  const regions = [...byRegion.keys()];
  const mine = regions.every((r) => own.includes(r));
  const type: MenuType = !mine ? 'vole' : jokers === 0 ? 'gastronomique' : 'maison';
  return { type, rank: MENU_RANK[type], regions };
}

/**
 * Variante « un menu » : il suffit de terminer UNE des régions secrètes.
 * Chaque carte Région fournit déjà un plat (`bonus`), il faut donc les 3 autres
 * (ou 2 + la Baguette). Les autres cartes de la main n'ont pas d'importance.
 * Volé : les 4 plats d'une autre région (ou 3 + la Baguette).
 */
export function evaluateOneMenu(hand: readonly Card[], own: readonly RegionId[], bonus: readonly (Course | null)[]): Menu | null {
  if (hand.some((c) => c.kind === 'vaisselle')) return null;
  const joker = hand.some((c) => c.kind === 'baguette');
  const have = (region: RegionId) => new Set(hand.filter((c): c is DishCard => isDish(c) && c.region === region).map((c) => c.course));
  let best: Menu | null = null;
  own.forEach((region, i) => {
    const got = have(region);
    const missing = COURSES.filter((c) => c !== bonus[i] && !got.has(c)).length;
    const type: MenuType | null = missing === 0 ? 'gastronomique' : missing === 1 && joker ? 'maison' : null;
    if (type && (!best || MENU_RANK[type] > best.rank)) best = { type, rank: MENU_RANK[type], regions: [region] };
  });
  if (best) return best;
  for (const region of new Set(hand.filter(isDish).map((c) => c.region))) {
    const missing = 4 - have(region).size;
    if (!own.includes(region) && (missing === 0 || (missing === 1 && joker))) return { type: 'vole', rank: MENU_RANK.vole, regions: [region] };
  }
  return null;
}

/** Avancement de chaque région secrète : combien de ses 4 plats sont en main. */
export function menuProgress(hand: readonly Card[], own: readonly RegionId[], bonus: readonly (Course | null)[] = []): { region: RegionId; have: Set<string>; bonus: Course | null }[] {
  return own.map((region, i) => {
    const have = new Set<string>(hand.filter((c): c is DishCard => isDish(c) && c.region === region).map((c) => c.course));
    if (bonus[i]) have.add(bonus[i]!);
    return { region, have, bonus: bonus[i] ?? null };
  });
}

/** Nombre de cartes de la région `region` dans la main. */
export function countRegion(hand: readonly Card[], region: RegionId): number {
  return hand.filter((c) => c.kind === 'dish' && c.region === region).length;
}
