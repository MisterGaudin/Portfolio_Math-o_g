// Construction du paquet de 101 cartes et utilitaires sur les cartes.
import { COLORS, type Card, type CardKind, type Color } from './types';

export const BOULET_ID = 100;

/**
 * Paquet complet : 4 couleurs × (chiffres 1-9 ×2 + 2×«+2» + 2×Inversion + 2×Passe)
 * = 96 cartes, + 4 Jokers + 1 Boulet = 101 cartes.
 */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  const add = (kind: CardKind, color: Color | null, value: number | null) =>
    cards.push({ id: id++, kind, color, value });
  for (const color of COLORS) {
    for (let v = 1; v <= 9; v++) {
      add('number', color, v);
      add('number', color, v);
    }
    for (const kind of ['plus2', 'reverse', 'skip'] as const) {
      add(kind, color, null);
      add(kind, color, null);
    }
  }
  for (let i = 0; i < 4; i++) add('joker', null, null);
  add('boulet', null, null); // id 100
  return cards;
}

/** Points d'une carte restée en main en fin de manche. */
export function cardPoints(card: Card): number {
  switch (card.kind) {
    case 'number':
      return card.value ?? 0;
    case 'plus2':
    case 'reverse':
    case 'skip':
      return 20;
    case 'joker':
    case 'boulet':
      return 50;
  }
}

export function handPoints(hand: readonly Card[]): number {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

/**
 * Clé « valeur/symbole » d'une carte : deux cartes de même clé se posent
 * l'une sur l'autre et peuvent former un double.
 */
export function rankKey(card: Card): string {
  return card.kind === 'number' ? `n${card.value}` : card.kind;
}

export const isBoulet = (card: Card) => card.kind === 'boulet';
export const isAction = (card: Card) =>
  card.kind === 'plus2' || card.kind === 'reverse' || card.kind === 'skip';

const COLOR_LABEL: Record<Color, string> = { rouge: 'rouge', bleu: 'bleu', vert: 'vert', jaune: 'jaune' };

/** Libellé court, en français, pour le journal. */
export function cardLabel(card: Card): string {
  switch (card.kind) {
    case 'number':
      return `${card.value} ${COLOR_LABEL[card.color!]}`;
    case 'plus2':
      return `+2 ${COLOR_LABEL[card.color!]}`;
    case 'reverse':
      return `Inversion ${COLOR_LABEL[card.color!]}`;
    case 'skip':
      return `Passe ${COLOR_LABEL[card.color!]}`;
    case 'joker':
      return 'Joker';
    case 'boulet':
      return 'BOULET';
  }
}

/** Libellé de la valeur seule (« 7 », « +2 »…) pour annoncer un double. */
export function rankLabel(card: Card): string {
  switch (card.kind) {
    case 'number':
      return String(card.value);
    case 'plus2':
      return '+2';
    case 'reverse':
      return 'Inversion';
    case 'skip':
      return 'Passe';
    case 'joker':
      return 'Joker';
    case 'boulet':
      return 'Boulet';
  }
}
