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
  | { kind: 'choice'; picks: { cardId: string; mode: Mode }[] }
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
 * Mamie (Bretagne, sa carte compte comme les Crêpes). Chacun donne 2 cartes par tour.
 */
function tutorialScript(): BotScript {
  const hands = [
    ['savoie-entree', 'savoie-fromage', 'vaisselle', 'alsace-plat', 'normandie-dessert', 'corse-entree', 'lyonnais-fromage', 'nord-plat'].map(c),
    ['bretagne-entree', 'bretagne-plat', 'provence-entree', 'savoie-dessert', 'auvergne-plat', 'bourgogne-fromage', 'lorraine-dessert', 'sud-ouest-entree'].map(c),
  ];
  const used = new Set([...hands.flat().map((x) => x.id), 'bretagne-fromage']);
  const rest = shuffle(createRng(7), buildDeck(ALL_REGION_IDS).filter((x) => !used.has(x.id)));
  // Ce que Mamie donne à chaque tour.
  const plan: Record<number, string[]> = {
    1: ['provence-entree', 'auvergne-plat'],
    2: ['vaisselle', 'bourgogne-fromage'],
    3: ['savoie-dessert', 'sud-ouest-entree'],
  };
  return {
    names: ['Toi', 'Mamie'],
    preset: { regions: [['savoie'], ['bretagne']], bonus: [['plat'], ['dessert']], hands, drawPile: [c('bretagne-fromage'), ...rest] },
    botChoice: (s, p) => {
      const hand = s.players[p].hand;
      const wanted = (plan[s.turn] ?? []).filter((id) => hand.some((x) => x.id === id));
      for (const x of hand) if (wanted.length < 2 && x.kind !== 'vaisselle' && !wanted.includes(x.id)) wanted.push(x.id);
      return { cardId: wanted[0], mode: 'pass', extra: [{ cardId: wanted[1], mode: 'pass' }] };
    },
    // Quand Mamie prend la Vaisselle, elle te rend ses Madeleines.
    swapCard: (s, receiver) => (receiver === 1 ? 'lorraine-dessert' : s.players[receiver].hand[0].id),
  };
}

const pass = (...ids: string[]) => ids.map((cardId) => ({ cardId, mode: 'pass' as Mode }));

const STEPS: Step[] = [
  { text: 'Bienvenue à table ! Tu affrontes Mamie. En début de manche, chacun reçoit une carte Région secrète (chaque région n’existe qu’une fois). Tape « Découvrir ma région ».', expect: { kind: 'wait', until: (st) => st !== 'intro' } },
  { text: 'Tu es la Savoie ! Ta carte Région compte comme un plat, la Tartiflette (★), sans que personne ne le voie. Pour crier « À TABLE ! », il te faut les 3 autres plats de Savoie : Entrée, Fromage et Dessert. Tape « Ma région » pour la revoir.', focus: 'region', expect: { kind: 'next' } },
  { text: 'Astuce de chef : la vraie carte Tartiflette ne te servirait à rien. Si tu la reçois, donne-la : ton voisin croira que tu n’es pas la Savoie. C’est du bluff !', focus: 'region', expect: { kind: 'next' } },
  { text: 'La jauge montre ton menu. Tu as déjà la Salade savoyarde et le Reblochon : il ne manque que le Gâteau de Savoie !', focus: 'gauge', expect: { kind: 'next' } },
  { text: 'Mais tu as la Vaisselle 🍽️ : l’assiette sale montre qui l’a, et avec elle, pas d’annonce. Chaque tour, tout le monde donne 2 cartes à son voisin de gauche.', focus: 'vaisselle', expect: { kind: 'next' } },
  { text: 'Tape la Vaisselle et la Choucroute (« Passer », c’est déjà choisi), puis « Valider ».', focus: 'hand', expect: { kind: 'choice', picks: pass('vaisselle', 'alsace-plat') } },
  { text: 'Tout le monde valide, puis les cartes glissent vers la gauche, toutes en même temps !', expect: { kind: 'wait', until: (st, turn) => st === 'choosing' && turn === 2 } },
  { text: 'Mamie t’a passé une Tapenade (Provence) et une Truffade (Auvergne) : elle n’est sûrement ni Provence ni Auvergne. Retiens-le !', focus: 'hand', expect: { kind: 'next' } },
  { text: 'Tape la Teurgoule et choisis « Marché » : elle part face visible à la défausse, et Mamie pioche une carte à la place. Tape aussi le Figatellu (Passer), puis « Valider ».', focus: 'actions', expect: { kind: 'choice', picks: [{ cardId: 'normandie-dessert', mode: 'market' }, { cardId: 'corse-entree', mode: 'pass' }] } },
  { text: 'La Teurgoule est sur la défausse, et Mamie a pioché…', focus: 'piles', expect: { kind: 'wait', until: (st, turn) => st === 'choosing' && turn === 3 } },
  { text: 'Aïe ! Mamie t’a renvoyé la Vaisselle. Mais il y a du bon : seul celui qui a la Vaisselle peut dénoncer quelqu’un.', focus: 'vaisselle', expect: { kind: 'next' } },
  { text: 'Mamie garde jalousement ses cartes de Bretagne… Démasque-la ! Tape « Dénoncer », choisis Mamie, puis Bretagne.', focus: 'denounce', expect: { kind: 'denounce', target: 1, region: 'bretagne' } },
  { text: 'Bien vu ! Mamie prend ta Vaisselle (elle te rend une carte en échange) et remplace sa carte Région par une autre de la réserve : ses cartes de Bretagne ne lui servent plus. Démasquée, elle est protégée 🛡️ jusqu’à la fin de la manche. Une fausse accusation, et tu gardais la Vaisselle !', expect: { kind: 'next' } },
  { text: 'Donne-lui le Saint-Marcellin et la Carbonade, inutiles pour toi, puis « Valider ».', focus: 'hand', expect: { kind: 'choice', picks: pass('lyonnais-fromage', 'nord-plat') } },
  { text: 'Échange…', expect: { kind: 'wait', until: (st) => st === 'announcing' } },
  { text: 'Mamie t’a passé le Gâteau de Savoie : ton menu est complet, sans Baguette. C’est un Gastronomique, l’annonce la plus forte ! (Avec la Baguette à la place d’un plat : Maison. Avec les 4 plats d’une autre région : Volé.) Crie « À TABLE ! »', focus: 'announce', expect: { kind: 'announce' } },
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
  allowMode: (cardId: string, mode: Mode) => boolean;
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
      allowCard: (id) => e.kind === 'choice' && e.picks.some((x) => x.cardId === id),
      allowMode: (id, m) => e.kind === 'choice' && e.picks.some((x) => x.cardId === id && x.mode === m),
      allowChoice: (ch) => {
        if (e.kind !== 'choice') return false;
        const all = [{ cardId: ch.cardId, mode: ch.mode }, ...(ch.extra ?? [])];
        return all.length === e.picks.length && e.picks.every((x) => all.some((y) => y.cardId === x.cardId && y.mode === x.mode));
      },
      allowDenounce: e.kind === 'denounce',
      allowDenounceTarget: (t, r) => e.kind === 'denounce' && e.target === t && e.region === r,
      allowAnnounce: (yes) => e.kind === 'announce' && yes,
      done: advance,
      finished: i >= STEPS.length - 1,
    };
  }, [active, step, advance, i]);
}

export { tutorialScript };
