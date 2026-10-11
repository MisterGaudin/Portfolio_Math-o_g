// Tutoriel interactif : une manche guidée contre « Mamie », avec des bulles.
// Il montre la région secrète, les 2 cartes du tour (voisin + Marché), la commande servie,
// la Vaisselle, la dénonciation et l'annonce. Les cartes et les coups de Mamie sont écrits à l'avance.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ALL_REGION_IDS, buildDeck, cardById, createRng, leftOf, shuffle, vaisselleLocked, type Choice, type Mode, type RegionId } from '../engine';
import type { BotScript, GameController, Stage } from './useGame';

/** Zones de l'écran que le tutoriel peut mettre en valeur. */
export type Focus = 'region' | 'hand' | 'gauge' | 'vaisselle' | 'piles' | 'regions' | 'denounce' | 'actions' | 'announce' | 'opponents' | 'order';

type Expect =
  | { kind: 'next' }
  | { kind: 'choice'; picks: { cardId: string; mode: Mode }[] }
  | { kind: 'order'; target: number; cardId: string }
  | { kind: 'give'; cardId: string }
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
 * Mise en place imposée : toi (Savoie, ta carte compte comme la Tartiflette) contre
 * Mamie (Bretagne, sa carte compte comme les Crêpes). Chaque tour : une carte au voisin, une au Marché.
 */
function tutorialScript(): BotScript {
  const hands = [
    ['savoie-entree', 'savoie-fromage', 'vaisselle', 'alsace-plat', 'normandie-dessert', 'corse-entree', 'lyonnais-fromage', 'nord-plat'].map(c),
    ['bretagne-entree', 'bretagne-plat', 'provence-entree', 'savoie-dessert', 'auvergne-plat', 'bourgogne-fromage', 'lorraine-dessert', 'sud-ouest-entree'].map(c),
  ];
  const top = ['alsace-dessert', 'corse-plat', 'nord-entree'];
  const used = new Set([...hands.flat().map((x) => x.id), 'bretagne-fromage', ...top]);
  const rest = shuffle(createRng(7), buildDeck(ALL_REGION_IDS).filter((x) => !used.has(x.id)));
  // Ce que Mamie donne à chaque tour : [carte passée, carte au Marché].
  const plan: Record<number, [string, string]> = {
    1: ['provence-entree', 'auvergne-plat'],
    2: ['vaisselle', 'bourgogne-fromage'],
  };
  return {
    names: ['Toi', 'Mamie'],
    preset: { regions: [['savoie'], ['bretagne']], bonus: [['plat'], ['dessert']], hands, drawPile: [...top.map(c), c('bretagne-fromage'), ...rest] },
    botChoice: (s, p) => {
      const hand = s.players[p].hand;
      const free = hand.filter((x) => x.kind !== 'vaisselle' || (!vaisselleLocked(s, p) && leftOf(s, p) !== p));
      const [a, b] = plan[s.turn] ?? [];
      const passId = free.find((x) => x.id === a)?.id ?? free.find((x) => x.kind !== 'vaisselle')!.id;
      const marketId = free.find((x) => x.id === b && x.id !== passId && x.kind !== 'vaisselle')?.id ?? free.find((x) => x.id !== passId && x.kind !== 'vaisselle')!.id;
      return { cardId: passId, mode: 'pass', extra: [{ cardId: marketId, mode: 'market' }] };
    },
    // Quand Mamie prend la Vaisselle, elle te rend ses Madeleines.
    swapCard: (s, receiver) => (receiver === 1 ? 'lorraine-dessert' : s.players[receiver].hand[0].id),
  };
}

const STEPS: Step[] = [
  { text: 'Bienvenue à table ! Tu affrontes Mamie. En début de manche, chacun reçoit une carte Région secrète (chaque région n’existe qu’une fois). Tape « Découvrir ma région ».', expect: { kind: 'wait', until: (st) => st !== 'intro' } },
  { text: 'Tu es la Savoie ! Ta carte Région compte comme un plat, la Tartiflette (★), sans que personne ne le voie. Pour crier « À TABLE ! », il te faut les 3 autres plats de Savoie : Entrée, Fromage et Dessert. Tape « Ma région » pour la revoir.', focus: 'region', expect: { kind: 'next' } },
  { text: 'Astuce de chef : la vraie carte Tartiflette ne te servirait à rien. Si tu la reçois, donne-la : on croira que tu n’es pas la Savoie. C’est du bluff !', focus: 'region', expect: { kind: 'next' } },
  { text: 'La jauge montre ton menu : tu as la Salade savoyarde et le Reblochon, il ne manque que le Gâteau de Savoie !', focus: 'gauge', expect: { kind: 'next' } },
  { text: 'Mais tu as la Vaisselle 🍽️ : tant que tu l’as, pas d’annonce ! Chaque tour, tout le monde donne 2 cartes en même temps : une à son voisin, une au Marché (face visible).', focus: 'vaisselle', expect: { kind: 'next' } },
  { text: 'Tape la Vaisselle (elle part chez Mamie), puis la Teurgoule (elle part au Marché), et « Valider ».', focus: 'hand', expect: { kind: 'choice', picks: [{ cardId: 'vaisselle', mode: 'pass' }, { cardId: 'normandie-dessert', mode: 'market' }] } },
  { text: 'Les cartes glissent toutes en même temps ! Quand Mamie met une carte au Marché, c’est toi qui pioches pour la remplacer.', expect: { kind: 'wait', until: (st, turn) => st === 'choosing' && turn === 2 } },
  { text: 'Le Gâteau de Savoie, il te le faut… Passe commande ! Tape « 📝 Commander », puis Savoie et Gâteau de Savoie : « Mamie, du Gâteau de Savoie, tu en as ? »', focus: 'order', expect: { kind: 'order', target: 1, cardId: 'savoie-dessert' } },
  { text: 'Elle l’avait : elle doit te servir ! Rends-lui une carte de ton choix : la Choucroute. (Rendre la Vaisselle, c’est permis aussi !) Mais attention : Mamie sait maintenant que tu cherches de la Savoie…', expect: { kind: 'give', cardId: 'alsace-plat' } },
  { text: 'Ton menu est complet ! Donne le Figatellu à Mamie et le Saint-Marcellin au Marché, puis « Valider ».', focus: 'hand', expect: { kind: 'choice', picks: [{ cardId: 'corse-entree', mode: 'pass' }, { cardId: 'lyonnais-fromage', mode: 'market' }] } },
  { text: 'Échange…', expect: { kind: 'wait', until: (st, turn) => st === 'choosing' && turn === 3 } },
  { text: 'Aïe ! Mamie t’a renvoyé la Vaisselle : tu n’as pas pu annoncer. Mais seul celui qui a la Vaisselle peut dénoncer quelqu’un, une fois par manche.', focus: 'vaisselle', expect: { kind: 'next' } },
  { text: 'Mamie garde jalousement ses cartes de Bretagne… Démasque-la ! Tape « Dénoncer », choisis Bretagne.', focus: 'denounce', expect: { kind: 'denounce', target: 1, region: 'bretagne' } },
  { text: 'Bien vu ! Mamie prend ta Vaisselle (elle te rend ses Madeleines) et la garde jusqu’au prochain tour. Elle change aussi de région : ses cartes de Bretagne ne lui servent plus.', expect: { kind: 'next' } },
  { text: 'Donne-lui la Carbonade et mets les Madeleines au Marché, puis « Valider ».', focus: 'hand', expect: { kind: 'choice', picks: [{ cardId: 'nord-plat', mode: 'pass' }, { cardId: 'lorraine-dessert', mode: 'market' }] } },
  { text: 'Échange…', expect: { kind: 'wait', until: (st) => st === 'announcing' } },
  { text: 'Plus de Vaisselle et un menu complet sans Baguette : c’est un Gastronomique, l’annonce la plus forte ! (Avec la Baguette à la place d’un plat, ce serait un Maison.) Crie « À TABLE ! ».', focus: 'announce', expect: { kind: 'announce' } },
  { text: 'Dernier service : Mamie a encore un tour pour compléter son menu. Si elle y arrive, elle gagne une étoile elle aussi !', expect: { kind: 'wait', until: (st) => st === 'showdown' } },
  { text: 'Gagné ! Tu décroches une étoile ⭐, comme au Guide Michelin. Le premier à 3 étoiles devient Chef 3 étoiles. Le chef en retard commence chaque manche avec la Baguette.', expect: { kind: 'next' } },
  { text: 'Fin de manche : tout le monde révèle sa région. À toi de jouer pour de vrai !', expect: { kind: 'wait', until: (st) => st === 'roundEnd' } },
];

export interface Guide {
  text: string;
  focus?: Focus;
  /** Le bouton « Suivant » est affiché. */
  canNext: boolean;
  next: () => void;
  allowCard: (cardId: string) => boolean;
  allowMode: (cardId: string, mode: Mode) => boolean;
  allowChoice: (choice: Choice) => boolean;
  allowDenounce: boolean;
  allowDenounceTarget: (target: number, region: RegionId, reveal: string | null) => boolean;
  allowOrderButton: boolean;
  allowOrder: (target: number, cardId: string) => boolean;
  allowGive: (cardId: string) => boolean;
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
      allowCard: (id) => e.kind === 'choice' && e.picks.some((x) => x.cardId === id),
      allowMode: (id, m) => e.kind === 'choice' && e.picks.some((x) => x.cardId === id && x.mode === m),
      allowChoice: (ch) => {
        if (e.kind !== 'choice') return false;
        const all = [{ cardId: ch.cardId, mode: ch.mode }, ...(ch.extra ?? [])];
        return all.length === e.picks.length && e.picks.every((x) => all.some((y) => y.cardId === x.cardId && y.mode === x.mode));
      },
      allowDenounce: e.kind === 'denounce',
      allowDenounceTarget: (t, r) => e.kind === 'denounce' && e.target === t && e.region === r,
      allowOrderButton: e.kind === 'order',
      allowOrder: (t, id) => e.kind === 'order' && e.target === t && e.cardId === id,
      allowGive: (id) => e.kind === 'give' && e.cardId === id,
      allowAnnounce: (yes) => e.kind === 'announce' && yes,
      done: advance,
      finished: i >= STEPS.length - 1,
    };
  }, [active, step, advance, i]);
}

export { tutorialScript };
