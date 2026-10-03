// Tests du moteur de règles (Vitest).
import { describe, expect, it } from 'vitest';
import {
  BOULET_ID,
  applyAction,
  checkPlay,
  chooseAction,
  createDeck,
  createGame,
  createRng,
  handPoints,
  IllegalMoveError,
  legalPlays,
  nextRound,
  type Card,
  type Color,
  type GameState,
  type PlayerInfo,
} from './index';

const rng = createRng(42);
const bots = (n: number, difficulty: PlayerInfo['difficulty'] = 'moyen'): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ name: `J${i}`, isHuman: false, difficulty }));

/** Fabrique de cartes avec des ids uniques (≥ 1000 pour ne pas gêner le paquet). */
let nextId = 1000;
const num = (color: Color, value: number): Card => ({ id: nextId++, kind: 'number', color, value });
const act = (kind: 'plus2' | 'reverse' | 'skip', color: Color): Card => ({ id: nextId++, kind, color, value: null });
const joker = (): Card => ({ id: nextId++, kind: 'joker', color: null, value: null });
const boulet = (): Card => ({ id: BOULET_ID, kind: 'boulet', color: null, value: null });

/** Construit une situation de jeu sur mesure. */
function setup(hands: Card[][], top: Card, opts: { pile?: Card[]; color?: Color; current?: number } = {}): GameState {
  const s = createGame(bots(hands.length), createRng(1));
  s.players.forEach((p, i) => (p.hand = hands[i]));
  s.discard = [top];
  s.activeColor = opts.color ?? top.color!;
  s.drawPile = opts.pile ?? Array.from({ length: 20 }, () => num('vert', 1));
  s.current = opts.current ?? 0;
  s.direction = 1;
  s.phase = 'play';
  s.history = [];
  return s;
}

describe('paquet', () => {
  it('contient 101 cartes', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(101);
    expect(deck.filter((c) => c.kind === 'number')).toHaveLength(72);
    expect(deck.filter((c) => c.kind === 'plus2')).toHaveLength(8);
    expect(deck.filter((c) => c.kind === 'joker')).toHaveLength(4);
    expect(deck.filter((c) => c.kind === 'boulet')).toHaveLength(1);
    expect(new Set(deck.map((c) => c.id)).size).toBe(101);
  });

  it('distribue 7 cartes et ne démarre jamais sur un Joker ou le Boulet', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = createGame(bots(4), createRng(seed));
      expect(s.players.every((p) => p.hand.length === 7)).toBe(true);
      expect(['joker', 'boulet']).not.toContain(s.discard[0].kind);
      expect(s.drawPile.length + s.discard.length + 28).toBe(101);
      expect(s.drawPile.some((c) => c.kind === 'boulet')).toBe(true); // manche 1 : Boulet dans la pioche
    }
  });
});

describe('validité des coups', () => {
  it('accepte la même couleur ou la même valeur, refuse le reste', () => {
    const r5 = num('rouge', 5), b5 = num('bleu', 5), r9 = num('rouge', 9), v2 = num('vert', 2);
    const s = setup([[r5, b5, r9, v2], [num('jaune', 1)]], num('rouge', 3));
    expect(checkPlay(s, 0, { type: 'play', cardIds: [r9.id] })).toBeNull();
    expect(checkPlay(s, 0, { type: 'play', cardIds: [v2.id] })).not.toBeNull();
    s.discard = [num('jaune', 5)];
    s.activeColor = 'jaune';
    expect(checkPlay(s, 0, { type: 'play', cardIds: [b5.id] })).toBeNull();
  });

  it('les symboles se posent les uns sur les autres', () => {
    const bp = act('skip', 'bleu');
    const s = setup([[bp], [num('jaune', 1)]], act('skip', 'rouge'));
    expect(checkPlay(s, 0, { type: 'play', cardIds: [bp.id] })).toBeNull();
  });

  it('le Joker se pose sur tout mais exige une couleur', () => {
    const j = joker();
    const s = setup([[j, num('rouge', 1)], [num('jaune', 1)]], num('vert', 3));
    expect(checkPlay(s, 0, { type: 'play', cardIds: [j.id] })).toMatch(/couleur/);
    applyAction(s, 0, { type: 'play', cardIds: [j.id], chosenColor: 'bleu' }, rng);
    expect(s.activeColor).toBe('bleu');
  });

  it('le Boulet ne se pose jamais', () => {
    const s = setup([[boulet(), num('rouge', 1), num('rouge', 2)], [num('jaune', 1)]], num('rouge', 3));
    expect(checkPlay(s, 0, { type: 'play', cardIds: [BOULET_ID] })).toMatch(/Boulet/);
  });

  it('refuse de jouer hors de son tour', () => {
    const c = num('rouge', 1);
    const s = setup([[num('rouge', 2)], [c]], num('rouge', 3));
    expect(() => applyAction(s, 1, { type: 'play', cardIds: [c.id] }, rng)).toThrow(IllegalMoveError);
  });
});

describe('doubles', () => {
  it('pose 2 cartes de même valeur, la 2e donne la couleur', () => {
    const r7 = num('rouge', 7), b7 = num('bleu', 7);
    const s = setup([[r7, b7, num('vert', 1)], [num('jaune', 1)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [r7.id, b7.id] }, rng);
    expect(s.activeColor).toBe('bleu');
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.discard.slice(-2).map((c) => c.id)).toEqual([r7.id, b7.id]);
  });

  it('exige que la 1re carte soit jouable', () => {
    const r7 = num('rouge', 7), b7 = num('bleu', 7);
    const s = setup([[r7, b7, num('vert', 1)], [num('jaune', 1)]], num('rouge', 3));
    expect(checkPlay(s, 0, { type: 'play', cardIds: [b7.id, r7.id] })).not.toBeNull();
  });

  it('refuse 2 cartes de valeurs différentes', () => {
    const r7 = num('rouge', 7), r8 = num('rouge', 8);
    const s = setup([[r7, r8, num('vert', 1)], [num('jaune', 1)]], num('rouge', 3));
    expect(checkPlay(s, 0, { type: 'play', cardIds: [r7.id, r8.id] })).toMatch(/double/);
  });

  it('double +2 : le suivant pioche 4 et passe', () => {
    const a = act('plus2', 'rouge'), b = act('plus2', 'vert');
    const s = setup([[a, b, num('vert', 1)], [num('jaune', 1)], [num('jaune', 2)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [a.id, b.id] }, rng);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.current).toBe(2);
  });

  it('double Passe : saute 2 joueurs', () => {
    const a = act('skip', 'rouge'), b = act('skip', 'bleu');
    const s = setup([[a, b, num('vert', 1)], [num('jaune', 1)], [num('jaune', 2)], [num('jaune', 3)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [a.id, b.id] }, rng);
    expect(s.current).toBe(3);
  });

  it('un double permet de donner le Boulet', () => {
    const r7 = num('rouge', 7), b7 = num('bleu', 7);
    const s = setup([[r7, b7, boulet(), num('vert', 1)], [num('jaune', 1)], [num('jaune', 2)]], num('rouge', 3));
    const events = applyAction(s, 0, { type: 'play', cardIds: [r7.id, b7.id], giveBouletTo: 2 }, rng);
    expect(s.players[2].hand.some((c) => c.kind === 'boulet')).toBe(true);
    expect(s.players[0].hand.some((c) => c.kind === 'boulet')).toBe(false);
    expect(events.some((e) => e.type === 'boulet')).toBe(true);
    expect(s.bouletPasses).toBe(1);
  });

  it('on ne donne pas le Boulet avec une carte simple, ni à soi-même', () => {
    const r7 = num('rouge', 7), b7 = num('bleu', 7);
    const s = setup([[r7, b7, boulet(), num('vert', 1)], [num('jaune', 1)]], num('rouge', 3));
    expect(checkPlay(s, 0, { type: 'play', cardIds: [r7.id], giveBouletTo: 1 })).not.toBeNull();
    expect(checkPlay(s, 0, { type: 'play', cardIds: [r7.id, b7.id], giveBouletTo: 0 })).not.toBeNull();
  });

  it('double de Jokers autorisé', () => {
    const j1 = joker(), j2 = joker();
    const s = setup([[j1, j2, num('vert', 1)], [num('jaune', 1)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [j1.id, j2.id], chosenColor: 'jaune' }, rng);
    expect(s.activeColor).toBe('jaune');
  });
});

describe('interdiction de finir avec le Boulet', () => {
  it('refuse de poser la dernière carte normale', () => {
    const r1 = num('rouge', 1);
    const s = setup([[r1, boulet()], [num('jaune', 1)]], num('rouge', 3));
    expect(checkPlay(s, 0, { type: 'play', cardIds: [r1.id] })).toMatch(/Boulet/);
    expect(legalPlays(s)).toHaveLength(0);
  });

  it('la carte piochée ne peut pas non plus faire finir', () => {
    const r1 = num('bleu', 1);
    const s = setup([[r1, boulet()], [num('jaune', 1)]], num('rouge', 3), { pile: [num('rouge', 5), num('vert', 1)] });
    applyAction(s, 0, { type: 'draw' }, rng);
    // La carte piochée est jouable mais laisserait le Boulet seul… sauf qu'il reste le 1 bleu : OK.
    expect(s.phase).toBe('afterDraw');
    const s2 = setup([[boulet()], [num('jaune', 1)]], num('rouge', 3), { pile: [num('rouge', 5)] });
    s2.players[0].hand = [boulet()];
    applyAction(s2, 0, { type: 'draw' }, rng);
    expect(s2.current).toBe(1); // interdit de poser le 5 rouge : tour terminé
    expect(s2.players[0].hand).toHaveLength(2);
  });

  it('finir avec un double ET donner le Boulet est permis', () => {
    const r7 = num('rouge', 7), b7 = num('bleu', 7);
    const s = setup([[r7, b7, boulet()], [num('jaune', 1)]], num('rouge', 3));
    expect(checkPlay(s, 0, { type: 'play', cardIds: [r7.id, b7.id] })).toMatch(/Boulet/);
    const opts = legalPlays(s).filter((o) => o.cardIds.length === 2);
    expect(opts[0].mustGiveBoulet).toBe(true);
    applyAction(s, 0, { type: 'play', cardIds: [r7.id, b7.id], giveBouletTo: 1 }, rng);
    expect(s.phase === 'roundOver' || s.phase === 'gameOver').toBe(true);
    expect(s.results[0].winner).toBe(0);
    expect(s.results[0].bouletHolder).toBe(1);
  });
});

describe('cartes action', () => {
  it('+2 : le suivant pioche 2 et passe son tour', () => {
    const p = act('plus2', 'rouge');
    const s = setup([[p, num('vert', 1)], [num('jaune', 1)], [num('jaune', 2)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [p.id] }, rng);
    expect(s.players[1].hand).toHaveLength(3);
    expect(s.current).toBe(2);
  });

  it('+2 ne se cumule pas : la victime ne peut pas renvoyer', () => {
    const p = act('plus2', 'rouge');
    const s = setup([[p, num('vert', 1)], [act('plus2', 'bleu')], [num('jaune', 2)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [p.id] }, rng);
    expect(s.current).toBe(2);
  });

  it('Inversion à 2 joueurs = Passe : on rejoue', () => {
    const r = act('reverse', 'rouge');
    const s = setup([[r, num('vert', 1)], [num('jaune', 1)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [r.id] }, rng);
    expect(s.current).toBe(0);
  });

  it('Inversion à 3 joueurs change le sens', () => {
    const r = act('reverse', 'rouge');
    const s = setup([[r, num('vert', 1)], [num('jaune', 1)], [num('jaune', 2)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [r.id] }, rng);
    expect(s.direction).toBe(-1);
    expect(s.current).toBe(2);
  });

  it('Passe saute le suivant', () => {
    const p = act('skip', 'rouge');
    const s = setup([[p, num('vert', 1)], [num('jaune', 1)], [num('jaune', 2)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [p.id] }, rng);
    expect(s.current).toBe(2);
  });
});

describe('pioche', () => {
  it('carte piochée jouable : on peut la poser ou passer', () => {
    const drawn = num('rouge', 8);
    const s = setup([[num('vert', 1), num('vert', 2)], [num('jaune', 1)]], num('rouge', 3), { pile: [drawn] });
    applyAction(s, 0, { type: 'draw' }, rng);
    expect(s.phase).toBe('afterDraw');
    expect(s.drawnCardId).toBe(drawn.id);
    // Seule la carte piochée peut être posée
    expect(checkPlay(s, 0, { type: 'play', cardIds: [s.players[0].hand[0].id] })).not.toBeNull();
    applyAction(s, 0, { type: 'play', cardIds: [drawn.id] }, rng);
    expect(s.current).toBe(1);
  });

  it('carte piochée injouable : le tour s’arrête', () => {
    const s = setup([[num('vert', 1)], [num('jaune', 1)]], num('rouge', 3), { pile: [num('bleu', 8)] });
    applyAction(s, 0, { type: 'draw' }, rng);
    expect(s.current).toBe(1);
    expect(s.players[0].hand).toHaveLength(2);
  });

  it('pioche vide : on remélange la défausse sauf la carte du dessus', () => {
    const top = num('rouge', 3);
    const s = setup([[num('vert', 1)], [num('jaune', 1)]], top, { pile: [] });
    const old = [num('bleu', 1), num('bleu', 2), num('bleu', 4)];
    s.discard = [...old, top];
    const events = applyAction(s, 0, { type: 'draw' }, rng);
    expect(events.some((e) => e.type === 'reshuffle')).toBe(true);
    expect(s.discard).toEqual([top]);
    expect(s.drawPile.length + 1).toBe(old.length); // 1 carte est partie dans la main
    expect(s.players[0].hand).toHaveLength(2);
  });
});

describe('scoring', () => {
  it('valeurs des cartes', () => {
    expect(handPoints([num('rouge', 7), act('plus2', 'bleu'), act('reverse', 'vert'), act('skip', 'jaune'), joker(), boulet()])).toBe(
      7 + 20 + 20 + 20 + 50 + 50,
    );
  });

  it('les perdants comptent leur main, le gagnant marque 0', () => {
    const last = num('rouge', 1);
    const s = setup([[last], [num('jaune', 9), joker()], [boulet(), act('skip', 'bleu'), num('vert', 4)]], num('rouge', 3));
    applyAction(s, 0, { type: 'play', cardIds: [last.id] }, rng);
    expect(s.results[0].points).toEqual([0, 59, 74]);
    expect(s.scores).toEqual([0, 59, 74]);
    expect(s.results[0].bouletHolder).toBe(2);
  });

  it('la partie s’arrête à 300 points, le plus bas gagne', () => {
    const last = num('rouge', 1);
    const s = setup([[last], [num('jaune', 9)]], num('rouge', 3));
    s.scores = [100, 295];
    applyAction(s, 0, { type: 'play', cardIds: [last.id] }, rng);
    expect(s.phase).toBe('gameOver');
  });
});

describe('échange entre les manches', () => {
  /** Termine une manche où `holder` garde le Boulet et `winner` gagne. */
  function finishRound(holder: number | null, winner: number, n = 3) {
    const s = createGame(bots(n), createRng(7));
    const last = num('rouge', 1);
    s.players.forEach((p, i) => (p.hand = i === winner ? [last] : [num('bleu', 2), num('bleu', 3)]));
    if (holder !== null) s.players[holder].hand.push(boulet());
    s.drawPile = s.drawPile.filter((c) => c.kind !== 'boulet');
    s.discard = [num('rouge', 5)];
    s.activeColor = 'rouge';
    s.current = winner;
    applyAction(s, winner, { type: 'play', cardIds: [last.id] }, rng);
    return s;
  }

  it('le Boulet officiel commence avec le Boulet et donne ses 2 plus fortes cartes', () => {
    const s = finishRound(2, 0);
    nextRound(s, createRng(3));
    expect(s.officialBoulet).toBe(2);
    expect(s.phase).toBe('exchange');
    expect(s.discard).toHaveLength(1); // la défausse est déjà retournée pendant l'échange
    const ex = s.pendingExchange!;
    expect(ex.winner).toBe(0);
    expect(s.players[0].hand).toHaveLength(9);
    expect(s.players[2].hand).toHaveLength(6); // 7 + Boulet - 2
    expect(s.players[2].hand.some((c) => c.kind === 'boulet')).toBe(true);
    // Les cartes données sont bien les plus fortes
    const minGiven = Math.min(...ex.received.map((c) => handPoints([c])));
    const maxKept = Math.max(...s.players[2].hand.filter((c) => c.kind !== 'boulet').map((c) => handPoints([c])));
    expect(minGiven).toBeGreaterThanOrEqual(maxKept);

    // Le gagnant rend 2 cartes de son choix
    const back = s.players[0].hand.slice(0, 2).map((c) => c.id);
    applyAction(s, 0, { type: 'exchange', cardIds: back }, rng);
    expect(s.players[0].hand).toHaveLength(7);
    expect(s.players[2].hand).toHaveLength(8);
    expect(s.phase).toBe('play');
    expect(s.current).toBe(2); // le Boulet officiel joue en premier
    expect(s.drawPile.some((c) => c.kind === 'boulet')).toBe(false);
  });

  it('seul le gagnant peut faire l’échange, avec 2 cartes', () => {
    const s = finishRound(1, 0);
    nextRound(s, createRng(3));
    expect(() => applyAction(s, 1, { type: 'exchange', cardIds: [1, 2] }, rng)).toThrow(IllegalMoveError);
    expect(() => applyAction(s, 0, { type: 'exchange', cardIds: [s.players[0].hand[0].id] }, rng)).toThrow(IllegalMoveError);
  });

  it('si le Boulet est resté dans la pioche, on le remélange', () => {
    const s = finishRound(null, 1);
    nextRound(s, createRng(3));
    expect(s.officialBoulet).toBeNull();
    expect(s.phase).toBe('play');
    expect(s.drawPile.some((c) => c.kind === 'boulet')).toBe(true);
    expect(s.players.every((p) => p.hand.length === 7)).toBe(true);
  });
});

describe('IA', () => {
  it('des parties complètes IA contre IA se terminent sans coup illégal', () => {
    for (const level of ['facile', 'moyen', 'difficile'] as const) {
      for (let seed = 0; seed < 15; seed++) {
        const r = createRng(seed);
        const s = createGame(bots(2 + (seed % 3), level), r);
        let guard = 0;
        while (s.phase !== 'gameOver' && guard++ < 100000) {
          if (s.phase === 'roundOver') nextRound(s, r);
          else applyAction(s, s.current, chooseAction(s, r), r);
        }
        expect(s.phase).toBe('gameOver');
        // Conservation des 101 cartes
        expect(s.drawPile.length + s.discard.length + s.players.reduce((n, p) => n + p.hand.length, 0)).toBe(101);
      }
    }
  });

  it('le niveau difficile donne le Boulet au joueur le plus proche de finir', () => {
    const r7 = num('rouge', 7), b7 = num('bleu', 7);
    const s = setup(
      [[r7, b7, boulet(), num('vert', 1), num('vert', 2)], [num('jaune', 1), num('jaune', 2), num('jaune', 3)], [num('jaune', 4)]],
      num('rouge', 3),
    );
    s.players.forEach((p) => (p.difficulty = 'difficile'));
    const a = chooseAction(s, createRng(1));
    expect(a).toMatchObject({ type: 'play', giveBouletTo: 2 });
  });
});
