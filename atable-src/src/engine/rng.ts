// Générateur pseudo-aléatoire reproductible (mulberry32).
// Indispensable pour des tests déterministes et des simulations rejouables.

export type Rng = () => number;

/** Crée un générateur à partir d'une graine entière. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entier aléatoire dans [0, n[. */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Élément aléatoire d'un tableau non vide. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randInt(rng, items.length)];
}

/** Mélange de Fisher-Yates, en place. */
export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
