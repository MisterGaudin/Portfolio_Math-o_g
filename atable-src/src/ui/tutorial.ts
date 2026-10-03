// Tutoriel interactif : une manche guidée contre « Mamie », avec des bulles.
// Il montre la région secrète, l'échange, le Marché, la Vaisselle, la dénonciation
// et l'annonce. Les cartes et les coups de Mamie sont écrits à l'avance.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildDeck, cardById, createRng, shuffle, VAISSELLE, type Choice, type Mode, type RegionId } from '../engine';
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

const REGIONS = ['savoie', 'bretagne', 'alsace', 'provence'];
const c = cardById;

/** Mise en place imposée : toi (Savoie) contre Mamie (Bretagne). Leurres : Alsace, Provence. */
function tutorialScript(): BotScript {
  const hands = [
    [c('savoie-plat'), c('savoie-fromage'), VAISSELLE, c('alsace-plat')],
    [c('bretagne-dessert'), c('bretagne-plat'), c('provence-entree'), c('savoie-entree')],
  ];
  const used = new Set([...hands.flat().map((x) => x.id), 'bretagne-fromage']);
  const rest = shuffle(createRng(7), buildDeck(REGIONS).filter((x) => !used.has(x.id) && x.kind !== 'vaisselle'));
  // Mamie joue toujours la même chose : Tapenade, puis la Vaisselle, puis la Salade savoyarde.
  const plan: Record<number, string> = { 1: 'provence-entree', 2: 'vaisselle', 3: 'savoie-entree' };
  return {
    names: ['Toi', 'Mamie'],
    preset: { regionsInPlay: REGIONS, regions: ['savoie', 'bretagne'], hands, drawPile: [c('bretagne-fromage'), ...rest] },
    botChoice: (s, p) => {
      const wanted = plan[s.turn];
      const card = s.players[p].hand.find((x) => x.id === wanted) ?? s.players[p].hand.find((x) => x.kind !== 'vaisselle')!;
      return { cardId: card.id, mode: 'pass' };
    },
    // Quand Mamie prend la Vaisselle, elle te rend ses Crêpes.
    swapCard: (s, receiver) => (receiver === 1 ? 'bretagne-dessert' : s.players[receiver].hand[0].id),
  };
}

const STEPS: Step[] = [
  { text: 'Bienvenue à table ! Tu affrontes Mamie. Le but : réunir un menu complet de 4 cartes, une Entrée, un Plat, un Fromage et un Dessert.', expect: { kind: 'next' } },
  { text: 'Voici ta carte Région secrète (tape dessus pour la voir ou la cacher). Toi, tu es la Savoie ! Les 4 cartes de ta région font le meilleur menu : le Gastronomique.', focus: 'region', expect: { kind: 'next' } },
  { text: 'La jauge montre ton menu : chaque case se remplit quand tu as le bon type de plat. Une étoile ★ marque les cartes de ta région.', focus: 'gauge', expect: { kind: 'next' } },
  { text: 'Pas de chance, tu as la Vaisselle 🍽️ ! L’assiette sale montre toujours qui l’a. Tant que tu l’as, tu ne peux pas annoncer : refile-la !', focus: 'vaisselle', expect: { kind: 'next' } },
  { text: 'Tape la Vaisselle, puis « Passer à gauche », puis « Valider ».', focus: 'hand', expect: { kind: 'choice', cardId: 'vaisselle', mode: 'pass' } },
  { text: 'Tout le monde valide, puis les cartes glissent vers la gauche, toutes en même temps !', expect: { kind: 'wait', until: (st, turn) => st === 'choosing' && turn === 2 } },
  { text: 'Mamie t’a passé une Tapenade (Provence). Elle s’en débarrasse : elle n’est sûrement pas de Provence. Retiens-le !', focus: 'hand', expect: { kind: 'next' } },
  { text: 'Ta Choucroute (Alsace) ne te sert à rien. Tape-la, puis « Marché », puis « Valider ». Elle part face visible à la défausse, et Mamie pioche une carte à la place.', focus: 'actions', expect: { kind: 'choice', cardId: 'alsace-plat', mode: 'market' } },
  { text: 'La Choucroute est sur la défausse, et Mamie a pioché…', focus: 'piles', expect: { kind: 'wait', until: (st, turn) => st === 'choosing' && turn === 3 } },
  { text: 'Aïe ! Mamie t’a renvoyé la Vaisselle. Mais elle garde jalousement ses cartes… Régions en jeu : Savoie (toi), Bretagne, Alsace et Provence.', focus: 'regions', expect: { kind: 'next' } },
  { text: 'Elle a refusé la Provence, et elle adore les Crêpes… Démasque-la ! Tape « Dénoncer », choisis Mamie, puis Bretagne.', focus: 'denounce', expect: { kind: 'denounce', target: 1, region: 'bretagne' } },
  { text: 'Bien vu ! Mamie prend la Vaisselle (elle te rend une carte en échange : ses Crêpes) et pioche une nouvelle région secrète. Attention : une fausse accusation, et c’est toi qui prends la Vaisselle !', expect: { kind: 'next' } },
  { text: 'La Tapenade ne te sert à rien : passe-la à Mamie et valide.', focus: 'hand', expect: { kind: 'choice', cardId: 'provence-entree', mode: 'pass' } },
  { text: 'Échange…', expect: { kind: 'wait', until: (st) => st === 'announcing' } },
  { text: 'Mamie t’a passé une Salade savoyarde : la jauge est pleine ! C’est un Menu du Jour (régions mélangées). Plus fort : Volé (une autre région), Maison (ta région + Baguette), Gastronomique. Crie « À TABLE ! »', focus: 'announce', expect: { kind: 'announce' } },
  { text: 'On révèle les mains…', expect: { kind: 'wait', until: (st) => st === 'showdown' } },
  { text: 'Gagné ! Tu remportes une Toque 🧑‍🍳. Le premier à 3 Toques devient Grand Chef. En cas d’égalité, le plus proche à gauche du porteur de la Vaisselle gagne.', expect: { kind: 'next' } },
  { text: 'Fin de manche : tout le monde révèle sa région. À toi de jouer pour de vrai !', expect: { kind: 'wait', until: (st) => st === 'roundEnd' } },
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
