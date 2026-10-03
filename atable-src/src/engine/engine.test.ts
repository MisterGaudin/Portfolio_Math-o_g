// Tests du moteur de règles d'« À TABLE ! ».
import { describe, expect, it } from 'vitest';
import {
  aiChoose,
  BAGUETTE,
  beliefs,
  cardById,
  createGame,
  createRng,
  denounce,
  evaluateMenu,
  nextRound,
  playBotTurn,
  regionCards,
  resolveAnnouncements,
  resolveExchange,
  submitChoice,
  VAISSELLE,
  vaisselleHolder,
  type Card,
  type Difficulty,
  type GameState,
  type RoundPreset,
} from './index';

const setups = (n: number, difficulty: Difficulty = 'moyen') =>
  Array.from({ length: n }, (_, i) => ({ name: `J${i}`, isHuman: false, difficulty }));

const c = (id: string): Card => cardById(id);
const R = (region: string) => regionCards(region);

/**
 * Partie à 3 joueurs avec une mise en place connue :
 * J0 = Alsace, J1 = Savoie, J2 = Bretagne ; leurres : Nord, Provence.
 */
function preset3(): RoundPreset {
  return {
    regionsInPlay: ['alsace', 'savoie', 'bretagne', 'nord', 'provence'],
    regions: ['alsace', 'savoie', 'bretagne'],
    hands: [
      [c('alsace-entree'), c('alsace-plat'), c('savoie-fromage'), VAISSELLE],
      [c('savoie-entree'), c('savoie-plat'), c('bretagne-dessert'), c('nord-entree')],
      [c('bretagne-entree'), c('bretagne-plat'), c('alsace-fromage'), BAGUETTE],
    ],
    drawPile: [c('nord-plat'), c('nord-fromage'), c('provence-entree'), c('provence-plat')],
  };
}

const game3 = () => createGame(setups(3), createRng(1), {}, preset3());
const ids = (cards: Card[]) => cards.map((x) => x.id);
const totalCards = (s: GameState) => s.players.reduce((n, p) => n + p.hand.length, 0) + s.drawPile.length + s.discard.length;

describe('distribution', () => {
  it.each([2, 3, 4])('à %i joueurs : régions, cartes, Vaisselle en main', (n) => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame(setups(n), createRng(seed));
      expect(s.regionsInPlay).toHaveLength(n + 2);
      expect(new Set(s.regionsInPlay).size).toBe(n + 2);
      // Une région secrète différente par joueur, parmi les régions en jeu ; 2 dans la réserve.
      const secrets = s.players.map((p) => p.region);
      expect(new Set(secrets).size).toBe(n);
      secrets.forEach((r) => expect(s.regionsInPlay).toContain(r));
      expect(s.regionReserve).toHaveLength(2);
      expect([...secrets, ...s.regionReserve].sort()).toEqual([...s.regionsInPlay].sort());
      // 4 cartes chacun, (n + 2) × 4 + Baguette + Vaisselle au total.
      s.players.forEach((p) => expect(p.hand).toHaveLength(4));
      expect(totalCards(s)).toBe((n + 2) * 4 + 2);
      // La Vaisselle est TOUJOURS dans une main, jamais dans la pioche.
      expect(s.drawPile.some((x) => x.kind === 'vaisselle')).toBe(false);
      expect(vaisselleHolder(s)).not.toBeNull();
      expect(s.discard).toHaveLength(0);
    }
  });

  it('à 4 joueurs : 26 cartes', () => {
    expect(totalCards(createGame(setups(4), createRng(7)))).toBe(26);
  });

  it('la Vaisselle tombe chez chacun selon la graine', () => {
    const holders = new Set(Array.from({ length: 60 }, (_, i) => vaisselleHolder(createGame(setups(4), createRng(i)))));
    expect(holders.size).toBe(4);
  });
});

describe('échange', () => {
  it('la Vaisselle ne va jamais au Marché', () => {
    const s = game3();
    expect(() => submitChoice(s, 0, { cardId: 'vaisselle', mode: 'market' })).toThrow(/Vaisselle/);
    // La Baguette, elle, peut y aller.
    expect(() => submitChoice(s, 2, { cardId: 'baguette', mode: 'market' })).not.toThrow();
  });

  it('les IA ne mettent jamais la Vaisselle au Marché', () => {
    for (const d of ['facile', 'moyen', 'difficile'] as const) {
      for (let seed = 0; seed < 200; seed++) {
        const s = createGame(setups(4, d), createRng(seed));
        const h = vaisselleHolder(s)!;
        const choice = aiChoose(s, h, createRng(seed));
        if (choice.cardId === 'vaisselle') expect(choice.mode).toBe('pass');
      }
    }
  });

  it('échange simultané : chacun donne à gauche et reçoit de droite, à la même place', () => {
    const s = game3();
    submitChoice(s, 0, { cardId: 'vaisselle', mode: 'pass' });
    submitChoice(s, 1, { cardId: 'nord-entree', mode: 'pass' });
    submitChoice(s, 2, { cardId: 'alsace-fromage', mode: 'pass' });
    resolveExchange(s, createRng(1));
    expect(ids(s.players[0].hand)).toEqual(['alsace-entree', 'alsace-plat', 'savoie-fromage', 'alsace-fromage']);
    expect(ids(s.players[1].hand)).toEqual(['savoie-entree', 'savoie-plat', 'bretagne-dessert', 'vaisselle']);
    expect(ids(s.players[2].hand)).toEqual(['bretagne-entree', 'bretagne-plat', 'nord-entree', 'baguette']);
    s.players.forEach((p) => expect(p.hand).toHaveLength(4));
    expect(s.phase).toBe('announce');
    expect(s.stats.vaisselleMoves).toBe(1);
  });

  it('on ne révèle rien tant que tout le monde n’a pas validé', () => {
    const s = game3();
    submitChoice(s, 0, { cardId: 'vaisselle', mode: 'pass' });
    expect(() => resolveExchange(s, createRng(1))).toThrow();
  });

  it('Marché : la carte va face visible à la défausse, le voisin reçoit le dessus de la pioche', () => {
    const s = game3();
    submitChoice(s, 0, { cardId: 'vaisselle', mode: 'pass' });
    submitChoice(s, 1, { cardId: 'nord-entree', mode: 'market' });
    submitChoice(s, 2, { cardId: 'baguette', mode: 'market' });
    const [ev] = resolveExchange(s, createRng(1));
    expect(ids(s.discard)).toEqual(['nord-entree', 'baguette']);
    // J1 (premier dans l'ordre) fait piocher J2 en premier : nord-plat, puis J0 reçoit nord-fromage.
    expect(s.players[2].hand[3].id).toBe('nord-plat');
    expect(s.players[0].hand[3].id).toBe('nord-fromage');
    expect(s.drawPile).toHaveLength(2);
    expect(s.origins['nord-plat']).toBe('market');
    expect(ev.type === 'exchange' && ev.moves[1].drawn?.id).toBe('nord-plat');
  });
});

describe('remélange de la pioche', () => {
  it('pioche vide : la défausse est mélangée pour refaire la pioche', () => {
    const s = game3();
    s.discard = s.drawPile.splice(0, 3); // il ne reste qu'une carte dans la pioche
    submitChoice(s, 0, { cardId: 'vaisselle', mode: 'pass' });
    submitChoice(s, 1, { cardId: 'nord-entree', mode: 'market' });
    submitChoice(s, 2, { cardId: 'baguette', mode: 'market' });
    const before = totalCards(s);
    const events = resolveExchange(s, createRng(3));
    expect(events.some((e) => e.type === 'reshuffle')).toBe(true);
    expect(s.stats.reshuffles).toBeGreaterThan(0);
    expect(totalCards(s)).toBe(before);
    expect(s.drawPile.length).toBeGreaterThan(0);
    s.players.forEach((p) => expect(p.hand).toHaveLength(4));
  });

  it('les cartes ne disparaissent jamais sur une longue partie', () => {
    const s = createGame(setups(4, 'difficile'), createRng(11), { toquesToWin: 50, maxTurns: 400 });
    const rng = createRng(12);
    for (let t = 0; t < 300 && s.phase === 'choose'; t++) {
      playBotTurn(s, rng);
      expect(totalCards(s)).toBe(26);
      expect(s.players.filter((p) => p.hand.some((x) => x.kind === 'vaisselle'))).toHaveLength(1);
      if ((s.phase as string) === 'roundOver') nextRound(s, rng);
    }
  });
});

describe('dénonciation', () => {
  it('juste : l’accusé prend la Vaisselle et change de région', () => {
    const s = game3();
    submitChoice(s, 1, { cardId: 'nord-entree', mode: 'pass' });
    const [ev] = denounce(s, 0, 1, 'savoie', createRng(4), 'nord-entree');
    expect(ev.type === 'denounce' && ev.denunciation.correct).toBe(true);
    // J0 (porteur) donne la Vaisselle à J1, qui lui rend une carte (ici la nord-entree).
    expect(vaisselleHolder(s)).toBe(1);
    expect(ids(s.players[0].hand)).toContain('nord-entree');
    expect(s.players[1].region).not.toBe('savoie');
    expect(['nord', 'provence']).toContain(s.players[1].region);
    expect(s.regionReserve).toContain('savoie');
    expect(s.regionReserve).toHaveLength(2);
    // Les choix du tour sont annulés, et on ne peut plus dénoncer ce tour-ci.
    expect(s.choices).toEqual({});
    expect(() => denounce(s, 2, 0, 'alsace', createRng(4))).toThrow(/déjà/);
    s.players.forEach((p) => expect(p.hand).toHaveLength(4));
  });

  it('juste sur le porteur de la Vaisselle : il la garde et change de région', () => {
    const s = game3();
    denounce(s, 2, 0, 'alsace', createRng(4));
    expect(vaisselleHolder(s)).toBe(0);
    expect(s.players[0].region).not.toBe('alsace');
    expect(s.stats.vaisselleMoves).toBe(0);
  });

  it('fausse : l’accusateur reçoit la Vaisselle', () => {
    const s = game3();
    const [ev] = denounce(s, 2, 1, 'nord', createRng(4));
    expect(ev.type === 'denounce' && ev.denunciation.correct).toBe(false);
    expect(vaisselleHolder(s)).toBe(2);
    expect(s.players[1].region).toBe('savoie');
    expect(s.stats.vaisselleMoves).toBe(1);
  });

  it('l’IA difficile en tire des déductions', () => {
    const s = game3();
    s.players.forEach((p) => (p.difficulty = 'difficile'));
    // J2 envoie deux fois de l'Alsace et du Nord au Marché : il n'est sans doute ni l'un ni l'autre.
    s.history.push({
      turn: 1,
      reshuffled: false,
      moves: [
        { player: 2, mode: 'market', card: c('nord-plat'), to: 0 },
        { player: 2, mode: 'market', card: c('provence-plat'), to: 0 },
      ],
    });
    const b = beliefs(s, 0)[2];
    expect(b.alsace).toBeUndefined(); // c'est ma région : impossible pour lui
    expect(b.bretagne).toBeGreaterThan(b.nord);
    expect(b.savoie).toBeGreaterThan(b.provence);
  });
});

describe('menus', () => {
  const own = 'alsace';
  it('Gastronomique : les 4 cartes de sa région, sans Baguette', () => {
    expect(evaluateMenu(R('alsace'), own)?.type).toBe('gastronomique');
  });
  it('Maison : sa région complétée par la Baguette', () => {
    expect(evaluateMenu([...R('alsace').slice(0, 3), BAGUETTE], own)?.type).toBe('maison');
  });
  it('Volé : les 4 cartes d’une autre région (Baguette autorisée)', () => {
    expect(evaluateMenu(R('nord'), own)?.type).toBe('vole');
    expect(evaluateMenu([BAGUETTE, ...R('nord').slice(1)], own)?.type).toBe('vole');
  });
  it('Menu du Jour : 4 types différents, régions mélangées', () => {
    const hand = [c('nord-entree'), c('alsace-plat'), c('savoie-fromage'), c('bretagne-dessert')];
    expect(evaluateMenu(hand, own)?.type).toBe('jour');
    expect(evaluateMenu([BAGUETTE, ...hand.slice(1)], own)?.type).toBe('jour');
  });
  it('invalide : deux plats du même type, ou la Vaisselle en main', () => {
    expect(evaluateMenu([c('nord-entree'), c('alsace-entree'), c('savoie-fromage'), c('bretagne-dessert')], own)).toBeNull();
    expect(evaluateMenu([...R('alsace').slice(0, 3), VAISSELLE], own)).toBeNull();
  });
  it('classement : Gastronomique > Maison > Volé > Menu du Jour', () => {
    const ranks = [
      evaluateMenu(R('alsace'), own)!,
      evaluateMenu([...R('alsace').slice(0, 3), BAGUETTE], own)!,
      evaluateMenu(R('nord'), own)!,
      evaluateMenu([c('nord-entree'), c('alsace-plat'), c('savoie-fromage'), c('bretagne-dessert')], own)!,
    ].map((m) => m.rank);
    expect(ranks).toEqual([4, 3, 2, 1]);
  });
});

describe('annonces et départage', () => {
  /** Met le jeu en phase d'annonce avec des mains imposées. */
  function announceState(hands: Card[][], regions: string[]) {
    const s = createGame(setups(hands.length), createRng(5));
    s.players.forEach((p, i) => {
      p.hand = hands[i];
      p.region = regions[i];
    });
    s.phase = 'announce';
    return s;
  }
  const jour = (dessert: string) => [c('nord-entree'), c('alsace-plat'), c('savoie-fromage'), c(dessert)];

  it('on ne peut pas annoncer sans menu valide, ni avec la Vaisselle', () => {
    const s = announceState([[...R('alsace').slice(0, 3), VAISSELLE], jour('bretagne-dessert'), R('nord')], ['alsace', 'savoie', 'nord']);
    expect(() => resolveAnnouncements(s, [0], createRng(1))).toThrow();
  });

  it('sans annonce, on passe au tour suivant', () => {
    const s = announceState([[...R('alsace').slice(0, 3), VAISSELLE], R('savoie'), R('nord')], ['alsace', 'savoie', 'nord']);
    resolveAnnouncements(s, [], createRng(1));
    expect(s.phase).toBe('choose');
    expect(s.turn).toBe(2);
  });

  it('le meilleur menu gagne la Toque', () => {
    const s = announceState([[...R('alsace').slice(0, 3), VAISSELLE], jour('bretagne-dessert'), R('nord')], ['alsace', 'savoie', 'nord']);
    resolveAnnouncements(s, [1, 2], createRng(1));
    expect(s.lastRound?.winner).toBe(2);
    expect(s.lastRound?.menu?.type).toBe('gastronomique');
    expect(s.players[2].toques).toBe(1);
    expect(s.phase).toBe('roundOver');
    expect(s.lastRound?.regions).toEqual(['alsace', 'savoie', 'nord']);
  });

  it('égalité : le plus proche à gauche du porteur de la Vaisselle gagne', () => {
    // 4 joueurs, J1 a la Vaisselle. J0 et J3 font un Menu du Jour : J3 est plus près à gauche de J1 (J2, J3, J0).
    const s = announceState(
      [jour('bretagne-dessert'), [...R('alsace').slice(0, 3), VAISSELLE], [...R('provence').slice(0, 2), c('provence-plat'), c('provence-plat')], jour('normandie-dessert')],
      ['provence', 'alsace', 'savoie', 'bretagne'],
    );
    resolveAnnouncements(s, [0, 3], createRng(1));
    expect(s.lastRound?.winner).toBe(3);
    expect(s.lastRound?.tieBreak).toBe('vaisselle');
  });

  it('égalité sans Vaisselle en main : au hasard', () => {
    const s = announceState([jour('bretagne-dessert'), jour('normandie-dessert')], ['provence', 'lyonnais']);
    resolveAnnouncements(s, [0, 1], createRng(1));
    expect([0, 1]).toContain(s.lastRound?.winner);
    expect(s.lastRound?.tieBreak).toBe('hasard');
  });
});

describe('victoire', () => {
  it('le premier à 3 Toques est Grand Chef', () => {
    const s = createGame(setups(2), createRng(9));
    s.players[0].toques = 2;
    s.players[0].hand = R(s.players[0].region);
    s.players[1].hand = [VAISSELLE, ...s.players[1].hand.filter((x) => x.kind !== 'vaisselle').slice(0, 3)];
    s.phase = 'announce';
    const events = resolveAnnouncements(s, [0], createRng(1));
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe(0);
    expect(events.some((e) => e.type === 'gameWon')).toBe(true);
  });

  it.each(['facile', 'moyen', 'difficile'] as const)('une partie complète entre IA (%s) se termine', (d) => {
    for (const n of [2, 3, 4]) {
      const s = createGame(setups(n, d), createRng(n * 31));
      const rng = createRng(n);
      let guard = 0;
      while (s.phase !== 'gameOver' && guard++ < 5000) {
        if ((s.phase as string) === 'roundOver') nextRound(s, rng);
        else playBotTurn(s, rng);
      }
      expect(s.phase).toBe('gameOver');
      expect(s.players[s.winner!].toques).toBe(3);
    }
  });
});
