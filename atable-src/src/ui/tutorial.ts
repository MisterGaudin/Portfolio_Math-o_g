// Tutoriel interactif : une manche guidée contre « Mamie », avec des bulles.
// Il montre la région secrète, l'échange, le Marché, la Vaisselle, la dénonciation
// et l'annonce. Les cartes et les coups de Mamie sont écrits à l'avance.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ALL_REGION_IDS, buildDeck, cardById, createRng, shuffle, type Choice, type Mode, type RegionId } from '../engine';
import type { BotScript, GameController, Stage } from './useGame';

/** Zones de l'écran que le tutoriel peut mettre en valeur. */
export type Focus = 'region' | 'hand' | 'gauge' | 'vaisselle' | 'piles' | 'regions' | 'denounce' | 'actions' | 'announce' | 'opponents';

type Expect =
  | { kind: 'next' }
  | { kind: 'choice'; cardId: string; mode: Mode }
  | { kind: 'denounce'; target: number; region: RegionId }
  | { kind: 'announce' }
  | { kind: 'wait'; until: (stage: Stage, turn: number) => boolean };

interface Step {
  text: string;
  focus?: Focus;
  expect: Expect;
}

const c = cardById;

/**
 * Mise en place imposée : toi (Savoie + Bretagne) contre Mamie (Alsace + Provence).
 * Il ne te manque que le Gâteau de Savoie… mais tu as la Vaisselle.
 */
function tutorialScript(): BotScript {
  const hands = [
    ['savoie-entree', 'savoie-plat', 'savoie-fromage', 'bretagne-entree', 'bretagne-plat', 'bretagne-fromage', 'bretagne-dessert', 'vaisselle'].map(c),
    ['alsace-entree', 'alsace-plat', 'provence-entree', 'provence-plat', 'provence-fromage', 'normandie-dessert', 'normandie-entree', 'savoie-dessert'].map(c),
  ];
  const used = new Set([...hands.flat().map((x) => x.id), 'alsace-fromage']);
  const rest = shuffle(createRng(7), buildDeck(ALL_REGION_IDS).filter((x) => !used.has(x.id)));
  // Mamie joue toujours la même chose : Teurgoule, puis la Vaisselle, puis le Gâteau de Savoie.
  const plan: Record<number, string> = { 1: 'normandie-dessert', 2: 'vaisselle', 3: 'savoie-dessert' };
  return {
    names: ['Toi', 'Mamie'],
    preset: { regions: [['savoie', 'bretagne'], ['alsace', 'provence']], hands, drawPile: [c('alsace-fromage'), ...rest] },
    botChoice: (s, p) => {
      const wanted = plan[s.turn];
      const card = s.players[p].hand.find((x) => x.id === wanted) ?? s.players[p].hand.find((x) => x.kind !== 'vaisselle')!;
      return { cardId: card.id, mode: 'pass' };
    },
    // Quand Mamie prend la Vaisselle, elle te rend ses Huîtres d'Isigny.
    swapCard: (s, receiver) => (receiver === 1 ? 'normandie-entree' : s.players[receiver].hand[0].id),
  };
}

const STEPS: Step[] = [
  { text: 'Bienvenue à table ! Tu affrontes Mamie. En début de manche, chacun reçoit 2 cartes Région secrètes. Tape « Découvrir mes régions ».', expect: { kind: 'wait', until: (st) => st !== 'intro' } },
  { text: 'Toi, tu as la Savoie et la Bretagne. Pour crier « À TABLE ! », il faut tes 2 menus complets : les 4 plats (Entrée, Plat, Fromage, Dessert) de chaque région. Pas de mélange ! Tape « Mes régions » pour les revoir.', focus: 'region', expect: { kind: 'next' } },
  { text: 'Les 2 jauges montrent tes menus. Ta Bretagne est complète, et il ne manque que le Dessert de Savoie : le Gâteau de Savoie !', focus: 'gauge', expect: { kind: 'next' } },
  { text: 'Mais tu as la Vaisselle 🍽️ : l’assiette sale montre toujours qui l’a, et avec elle, pas d’annonce. Refile-la !', focus: 'vaisselle', expect: { kind: 'next' } },
  { text: 'Tape la Vaisselle, puis « Passer à gauche », puis « Valider ».', focus: 'hand', expect: { kind: 'choice', cardId: 'vaisselle', mode: 'pass' } },
  { text: 'Tout le monde valide, puis les cartes glissent vers la gauche, toutes en même temps !', expect: { kind: 'wait', until: (st, turn) => st === 'choosing' && turn === 2 } },
  { text: 'Mamie t’a passé une Teurgoule (Normandie). Elle s’en débarrasse : elle n’a sûrement pas la Normandie. Retiens-le !', focus: 'hand', expect: { kind: 'next' } },
  { text: 'La Teurgoule ne te sert à rien. Tape-la, puis « Marché », puis « Valider ». Elle part face visible à la défausse, et Mamie pioche une carte à la place.', focus: 'actions', expect: { kind: 'choice', cardId: 'normandie-dessert', mode: 'market' } },
  { text: 'La Teurgoule est sur la défausse, et Mamie a pioché…', focus: 'piles', expect: { kind: 'wait', until: (st, turn) => st === 'choosing' && turn === 3 } },
  { text: 'Aïe ! Mamie t’a renvoyé la Vaisselle. Mais il y a du bon : seul celui qui a la Vaisselle peut dénoncer quelqu’un.', focus: 'vaisselle', expect: { kind: 'next' } },
  { text: 'Mamie garde jalousement sa Provence depuis le début… Démasque-la ! Tape « Dénoncer », choisis Mamie, puis Provence.', focus: 'denounce', expect: { kind: 'denounce', target: 1, region: 'provence' } },
  { text: 'Bien vu ! Mamie prend ta Vaisselle (elle te rend une carte en échange) et remplace sa Provence par une région de la réserve : ses cartes de Provence ne lui servent plus. Démasquée, elle est protégée 🛡️ jusqu’à la fin de la manche. Une fausse accusation, et tu gardais la Vaisselle !', expect: { kind: 'next' } },
  { text: 'Elle t’a rendu des Huîtres d’Isigny, inutiles pour toi : passe-les à Mamie et valide.', focus: 'hand', expect: { kind: 'choice', cardId: 'normandie-entree', mode: 'pass' } },
  { text: 'Échange…', expect: { kind: 'wait', until: (st) => st === 'announcing' } },
  { text: 'Mamie t’a passé le Gâteau de Savoie : tes 2 menus sont complets, sans Baguette. C’est un Gastronomique, l’annonce la plus forte ! (Avec la Baguette à la place d’un plat : Maison. Avec une région qui n’est pas à toi : Volé.) Crie « À TABLE ! »', focus: 'announce', expect: { kind: 'announce' } },
  { text: 'On révèle les mains…', expect: { kind: 'wait', until: (st) => st === 'showdown' } },
  { text: 'Gagné ! Tu remportes une Toque 🧑‍🍳. Le premier à 3 Toques devient Grand Chef. En cas d’égalité, le plus proche à gauche du porteur de la Vaisselle gagne.', expect: { kind: 'next' } },
  { text: 'Fin de manche : tout le monde révèle ses régions. À toi de jouer pour de vrai !', expect: { kind: 'wait', until: (st) => st === 'roundEnd' } },
];

export interface Guide {
  text: string;
  focus?: Focus;
  /** Le bouton « Suivant » est affiché. */
  canNext: boolean;
  next: () => void;
  allowCard: (cardId: string) => boolean;
  allowMode: (mode: Mode) => boolean;
  allowChoice: (choice: Choice) => boolean;
  allowDenounce: boolean;
  allowDenounceTarget: (target: number, region: RegionId) => boolean;
  allowAnnounce: (yes: boolean) => boolean;
  /** À appeler après une action réussie du joueur. */
  done: () => void;
  finished: boolean;
}

export function useTutorial(game: GameController, active: boolean): Guide | null {
  const [i, setI] = useState(0);
  const step = STEPS[Math.min(i, STEPS.length - 1)];
  const advance = useCallback(() => setI((x) => x + 1), []);
  const turn = game.state?.turn ?? 0;

  // Étapes « attendre » : on avance dès que la partie atteint le bon moment.
  useEffect(() => {
    if (active && step.expect.kind === 'wait' && step.expect.until(game.stage, turn) && i < STEPS.length - 1) advance();
  }, [active, step, game.stage, turn, i, advance]);

  useEffect(() => {
    if (!active) setI(0);
  }, [active]);

  return useMemo(() => {
    if (!active) return null;
    const e = step.expect;
    return {
      text: step.text,
      focus: step.focus,
      canNext: e.kind === 'next',
      next: advance,
      allowCard: (id) => e.kind === 'choice' && e.cardId === id,
      allowMode: (m) => e.kind === 'choice' && e.mode === m,
      allowChoice: (ch) => e.kind === 'choice' && e.cardId === ch.cardId && e.mode === ch.mode,
      allowDenounce: e.kind === 'denounce',
      allowDenounceTarget: (t, r) => e.kind === 'denounce' && e.target === t && e.region === r,
      allowAnnounce: (yes) => e.kind === 'announce' && yes,
      done: advance,
      finished: i >= STEPS.length - 1,
    };
  }, [active, step, advance, i]);
}

export { tutorialScript };
