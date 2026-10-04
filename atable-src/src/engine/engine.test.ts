// Tests du moteur de règles d'« À TABLE ! » (2 régions secrètes, 8 cartes en main).
import { describe, expect, it } from 'vitest';
import { REGIONS } from '../config/cards';
import {
  aiChoose,
  ALL_REGION_IDS,
  BAGUETTE,
  beliefs,
  cardById,
  checkDenounce,
  createGame,
  createRng,
  denounce,
  evaluateMenu,
  evaluateOneMenu,
  placeOrder,
  checkAnnounce,
  effectCard,
  cloneState,
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
  type Rules,
  TWO_MENUS_RULES,
} from './index';

const V2 = { rules: TWO_MENUS_RULES };

const setups = (n: number, difficulty: Difficulty = 'moyen') =>
  Array.from({ length: n }, (_, i) => ({ name: `J${i}`, isHuman: false, difficulty }));

const c = (id: string): Card => cardById(id);
const R = (region: string) => regionCards(region);
const ids = (cards: Card[]) => cards.map((x) => x.id);
const TOTAL = REGIONS.length * 4 + 2;
const totalCards = (s: GameState) => s.players.reduce((n, p) => n + p.hand.length, 0) + s.drawPile.length + s.discard.length + s.specialPile.length;
/** Paquet par défaut : 50 cartes + 2 Demi-tour, 2 Troc, 2 Chapardeur, 2 Contrôle sanitaire. */
const TOTAL_DEFAULT = TOTAL + 8;

/**
 * Partie à 3 joueurs avec une mise en place connue :
 * J0 = Alsace + Savoie (a la Vaisselle), J1 = Bretagne + Nord, J2 = Provence + Corse.
 */
function preset3(): RoundPreset {
  return {
    regions: [
      ['alsace', 'savoie'],
      ['bretagne', 'nord'],
      ['provence', 'corse'],
    ],
    hands: [
      ['alsace-entree', 'alsace-plat', 'alsace-fromage', 'alsace-dessert', 'savoie-entree', 'savoie-plat', 'lorraine-entree', 'vaisselle'].map(c),
      ['bretagne-entree', 'bretagne-plat', 'bretagne-fromage', 'nord-entree', 'nord-plat', 'auvergne-plat', 'normandie-entree', 'lyonnais-entree'].map(c),
      ['provence-entree', 'provence-plat', 'corse-entree', 'corse-plat', 'bourgogne-entree', 'sud-ouest-entree', 'baguette', 'savoie-fromage'].map(c),
    ],
    drawPile: ['nord-fromage', 'nord-dessert', 'provence-fromage', 'provence-dessert'].map(c),
  };
}
const game3 = (rules: Partial<Rules> = {}) => createGame(setups(3), createRng(1), { rules: { ...TWO_MENUS_RULES, ...rules } }, preset3());

describe('distribution', () => {
  it.each([2, 3, 4])('à %i joueurs : toutes les régions, 2 régions secrètes, 8 cartes, Vaisselle en main', (n) => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame(setups(n), createRng(seed), V2);
      expect(s.regionsInPlay.sort()).toEqual([...ALL_REGION_IDS].sort());
      // 2 régions secrètes différentes par joueur ; les autres forment la réserve.
      const secrets = s.players.flatMap((p) => p.regions);
      s.players.forEach((p) => expect(p.regions).toHaveLength(2));
      expect(new Set(secrets).size).toBe(2 * n);
      expect(s.regionReserve).toHaveLength(ALL_REGION_IDS.length - 2 * n);
      expect([...secrets, ...s.regionReserve].sort()).toEqual([...ALL_REGION_IDS].sort());
      s.players.forEach((p) => expect(p.hand).toHaveLength(8));
      expect(totalCards(s)).toBe(TOTAL);
      // La Vaisselle est TOUJOURS dans une main, jamais dans la pioche.
      expect(s.drawPile.some((x) => x.kind === 'vaisselle')).toBe(false);
      expect(vaisselleHolder(s)).not.toBeNull();
      expect(s.discard).toHaveLength(0);
    }
  });

  it('coup de pouce : au moins une carte de chacune de ses régions au départ', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = createGame(setups(4), createRng(seed), { rules: { ...TWO_MENUS_RULES, headStart: 1 } });
      for (const p of s.players) for (const r of p.regions) expect(p.hand.some((x) => x.kind === 'dish' && x.region === r)).toBe(true);
    }
  });

  it('la Vaisselle tombe chez chacun selon la graine', () => {
    const holders = new Set(Array.from({ length: 60 }, (_, i) => vaisselleHolder(createGame(setups(4), createRng(i), V2))));
    expect(holders.size).toBe(4);
  });
});

describe('échange', () => {
  it('la Vaisselle ne va jamais au Marché', () => {
    const s = game3();
    expect(() => submitChoice(s, 0, { cardId: 'vaisselle', mode: 'market' })).toThrow(/Vaisselle/);
    expect(() => submitChoice(s, 2, { cardId: 'baguette', mode: 'market' })).not.toThrow();
  });

  it('les IA ne mettent jamais la Vaisselle au Marché', () => {
    for (const d of ['facile', 'moyen', 'difficile'] as const) {
      for (let seed = 0; seed < 200; seed++) {
        const s = createGame(setups(4, d), createRng(seed), V2);
        const h = vaisselleHolder(s)!;
        const choice = aiChoose(s, h, createRng(seed));
        if (choice.cardId === 'vaisselle') expect(choice.mode).toBe('pass');
      }
    }
  });

  it('échange simultané : chacun donne à gauche et reçoit de droite, à la même place', () => {
    const s = game3();
    submitChoice(s, 0, { cardId: 'vaisselle', mode: 'pass' });
    submitChoice(s, 1, { cardId: 'lyonnais-entree', mode: 'pass' });
    submitChoice(s, 2, { cardId: 'savoie-fromage', mode: 'pass' });
    resolveExchange(s, createRng(1));
    expect(s.players[0].hand[7].id).toBe('savoie-fromage');
    expect(s.players[1].hand[7].id).toBe('vaisselle');
    expect(s.players[2].hand[7].id).toBe('lyonnais-entree');
    s.players.forEach((p) => expect(p.hand).toHaveLength(8));
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
    submitChoice(s, 1, { cardId: 'lyonnais-entree', mode: 'market' });
    submitChoice(s, 2, { cardId: 'baguette', mode: 'market' });
    const [ev] = resolveExchange(s, createRng(1));
    // Les deux cartes du Marché sont sur la défausse (dans un ordre tiré au hasard).
    expect(ids(s.discard).sort()).toEqual(['baguette', 'lyonnais-entree']);
    // J2 et J0 ont chacun reçu une des 2 cartes du dessus de la pioche, à la place de la carte donnée.
    expect([s.players[2].hand[6].id, s.players[0].hand[7].id].sort()).toEqual(['nord-dessert', 'nord-fromage']);
    expect(s.drawPile).toHaveLength(2);
    expect(s.origins['nord-fromage']).toBe('market');
    const drawn = ev.type === 'exchange' ? ev.moves.filter((m) => m.mode === 'market').map((m) => m.drawn?.id).sort() : [];
    expect(drawn).toEqual(['nord-dessert', 'nord-fromage']);
  });
});

describe('remélange de la pioche', () => {
  it('pioche vide : la défausse est mélangée pour refaire la pioche', () => {
    const s = game3();
    s.discard = s.drawPile.splice(0, 3); // il ne reste qu'une carte dans la pioche
    submitChoice(s, 0, { cardId: 'vaisselle', mode: 'pass' });
    submitChoice(s, 1, { cardId: 'lyonnais-entree', mode: 'market' });
    submitChoice(s, 2, { cardId: 'baguette', mode: 'market' });
    const before = totalCards(s);
    const events = resolveExchange(s, createRng(3));
    expect(events.some((e) => e.type === 'reshuffle')).toBe(true);
    expect(s.stats.reshuffles).toBeGreaterThan(0);
    expect(totalCards(s)).toBe(before);
    expect(s.drawPile.length).toBeGreaterThan(0);
    s.players.forEach((p) => expect(p.hand).toHaveLength(8));
  });

  it('les cartes ne disparaissent jamais sur une longue partie', () => {
    const s = createGame(setups(4, 'difficile'), createRng(11), { etoilesToWin: 50, maxTurns: 400, rules: TWO_MENUS_RULES });
    const rng = createRng(12);
    for (let t = 0; t < 300 && (s.phase as string) !== 'gameOver'; t++) {
      if ((s.phase as string) === 'roundOver') nextRound(s, rng);
      else playBotTurn(s, rng);
      expect(totalCards(s)).toBe(TOTAL);
      expect(s.players.filter((p) => p.hand.some((x) => x.kind === 'vaisselle'))).toHaveLength(1);
      s.players.forEach((p) => expect(p.hand).toHaveLength(8));
    }
  });
});

describe('dénonciation', () => {
  it('seul le porteur de la Vaisselle peut dénoncer', () => {
    const s = game3();
    expect(checkDenounce(s, 0)).toBeNull();
    expect(checkDenounce(s, 1)).toMatch(/Vaisselle/);
    expect(() => denounce(s, 1, 2, 'provence', createRng(4))).toThrow(/Vaisselle/);
  });

  it('juste : l’accusé prend la Vaisselle et remplace la région démasquée par une région de la réserve', () => {
    const s = game3();
    submitChoice(s, 1, { cardId: 'lyonnais-entree', mode: 'pass' });
    const reserveBefore = [...s.regionReserve];
    const [ev] = denounce(s, 0, 1, 'nord', createRng(4), 'normandie-entree');
    expect(ev.type === 'denounce' && ev.denunciation.correct).toBe(true);
    // J0 donne la Vaisselle à J1, qui lui rend une carte (ici les Huîtres d'Isigny).
    expect(vaisselleHolder(s)).toBe(1);
    expect(ids(s.players[0].hand)).toContain('normandie-entree');
    // La Bretagne reste, le Nord est remplacé par une région de la réserve (pas encore distribuée).
    expect(s.players[1].regions[0]).toBe('bretagne');
    expect(s.players[1].regions[1]).not.toBe('nord');
    expect(reserveBefore).toContain(s.players[1].regions[1]);
    expect(s.regionReserve).toContain('nord');
    expect(s.regionReserve).toHaveLength(reserveBefore.length);
    // Les choix du tour sont annulés, une seule dénonciation par tour.
    expect(s.choices).toEqual({});
    expect(() => denounce(s, 1, 2, 'corse', createRng(4))).toThrow(/déjà/);
    s.players.forEach((p) => expect(p.hand).toHaveLength(8));
  });

  it('fausse : l’accusateur garde la Vaisselle et ne peut pas dénoncer au tour suivant', () => {
    const s = game3();
    const [ev] = denounce(s, 0, 1, 'corse', createRng(4));
    expect(ev.type === 'denounce' && ev.denunciation.correct).toBe(false);
    expect(vaisselleHolder(s)).toBe(0);
    expect(s.players[1].regions).toEqual(['bretagne', 'nord']);
    // Tour suivant : interdit ; le tour d'après : de nouveau permis.
    ['lorraine-entree', 'lyonnais-entree', 'savoie-fromage'].forEach((id, p) => submitChoice(s, p, { cardId: id, mode: 'pass' }));
    resolveExchange(s, createRng(1));
    resolveAnnouncements(s, [], createRng(1));
    expect(s.turn).toBe(2);
    expect(checkDenounce(s, 0)).toMatch(/attendre/);
    s.turn = 3;
    expect(checkDenounce(s, 0)).toBeNull();
  });

  it('un joueur démasqué est protégé jusqu’à la fin de la manche', () => {
    const s = game3({ denounceLimit: 'protege' });
    denounce(s, 0, 1, 'nord', createRng(4));
    // La Vaisselle est maintenant chez J1 ; on la rend à J0 pour essayer de redénoncer J1.
    s.denunciation = null;
    const v = s.players[1].hand.findIndex((x) => x.kind === 'vaisselle');
    [s.players[0].hand[0], s.players[1].hand[v]] = [s.players[1].hand[v], s.players[0].hand[0]];
    expect(() => denounce(s, 0, 1, 'bretagne', createRng(4))).toThrow(/protégé/);
    expect(() => denounce(s, 0, 2, 'provence', createRng(4))).not.toThrow();
  });

  it('l’IA en tire des déductions', () => {
    const s = game3();
    // J2 envoie du Nord et de la Bretagne au Marché : il n'a sans doute ni l'un ni l'autre.
    s.history.push({
      turn: 1,
      reshuffled: false,
      moves: [
        { player: 2, mode: 'market', card: c('nord-dessert'), to: 0 },
        { player: 2, mode: 'market', card: c('bretagne-dessert'), to: 0 },
      ],
    });
    const b = beliefs(s, 0)[2];
    expect(b.alsace).toBeUndefined(); // c'est ma région : impossible pour lui
    expect(b.provence).toBeGreaterThan(b.nord);
    expect(b.corse).toBeGreaterThan(b.bretagne);
  });
});

describe('menus (8 cartes, 2 régions)', () => {
  const own = ['alsace', 'savoie'];
  it('Gastronomique : les 8 cartes de tes 2 régions, sans Baguette', () => {
    expect(evaluateMenu([...R('alsace'), ...R('savoie')], own)?.type).toBe('gastronomique');
  });
  it('Maison : tes 2 régions, la Baguette remplaçant un plat', () => {
    expect(evaluateMenu([...R('alsace'), ...R('savoie').slice(1), BAGUETTE], own)?.type).toBe('maison');
  });
  it('Volé : au moins un menu d’une autre région (Baguette autorisée)', () => {
    expect(evaluateMenu([...R('alsace'), ...R('nord')], own)?.type).toBe('vole');
    expect(evaluateMenu([...R('corse'), ...R('nord').slice(1), BAGUETTE], own)?.type).toBe('vole');
  });
  it('invalide : régions mélangées, un seul menu, ou la Vaisselle en main', () => {
    const mixed = [c('nord-entree'), c('alsace-plat'), c('savoie-fromage'), c('bretagne-dessert')];
    expect(evaluateMenu([...R('alsace'), ...mixed], own)).toBeNull();
    expect(evaluateMenu([...R('alsace'), ...R('savoie').slice(0, 3), c('nord-entree')], own)).toBeNull();
    expect(evaluateMenu([...R('alsace'), ...R('savoie').slice(1), VAISSELLE], own)).toBeNull();
    // La Baguette ne bouche qu'un seul trou.
    expect(evaluateMenu([...R('alsace').slice(1), ...R('savoie').slice(1), BAGUETTE, c('nord-entree')], own)).toBeNull();
  });
  it('avec des plats en double : il faut 4 plats différents par région', () => {
    const doubleFromage = { ...R('savoie')[2], id: 'savoie-fromage-2' };
    expect(evaluateMenu([...R('alsace'), ...R('savoie').slice(0, 3), doubleFromage], own)).toBeNull();
    expect(cardById('savoie-fromage-2').id).toBe('savoie-fromage-2');
  });
  it('classement : Gastronomique > Maison > Volé', () => {
    const ranks = [
      evaluateMenu([...R('alsace'), ...R('savoie')], own)!,
      evaluateMenu([...R('alsace'), ...R('savoie').slice(1), BAGUETTE], own)!,
      evaluateMenu([...R('alsace'), ...R('nord')], own)!,
    ].map((m) => m.rank);
    expect(ranks).toEqual([3, 2, 1]);
  });
});

describe('règles par défaut : 1 région (sa carte compte comme un plat), 2 cartes par tour', () => {
  it.each([2, 3, 4])('à %i joueurs : 1 région secrète différente pour chacun, 8 cartes, réserve des cartes Région', (n) => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame(setups(n), createRng(seed));
      s.players.forEach((p) => {
        expect(p.regions).toHaveLength(1);
        // La carte Région compte toujours comme le même plat de sa région (config).
        expect(p.bonus).toEqual([REGIONS.find((r) => r.id === p.regions[0])!.regionCourse]);
        expect(p.hand).toHaveLength(8);
      });
      expect(new Set(s.players.map((p) => p.regions[0])).size).toBe(n);
      expect(s.regionReserve).toHaveLength(12 - n);
      expect(totalCards(s)).toBe(TOTAL_DEFAULT);
      expect(vaisselleHolder(s)).not.toBeNull();
    }
  });

  it('chaque région n’existe qu’une fois : jamais deux joueurs sur la même région', () => {
    for (let i = 0; i < 200; i++) {
      const s = createGame(setups(4), createRng(i));
      expect(new Set(s.players.map((p) => p.regions[0])).size).toBe(4);
    }
  });

  it('coup de pouce : une carte utile de sa région, sans avantage pour les derniers joueurs', () => {
    const useful = [0, 0, 0, 0];
    for (let g = 0; g < 2000; g++) {
      const s = createGame(setups(4), createRng(g + 1), { rules: { headStart: 1 } });
      s.players.forEach((p, i) => {
        const mine = p.hand.filter((x) => x.kind === 'dish' && x.region === p.regions[0] && x.course !== p.bonus[0]);
        expect(mine.length).toBeGreaterThanOrEqual(1);
        useful[i] += new Set(mine.map((x) => (x.kind === 'dish' ? x.course : ''))).size;
      });
    }
    const avg = useful.map((u) => u / 2000);
    expect(Math.max(...avg) - Math.min(...avg)).toBeLessThan(0.06);
  });

  it('la vraie carte du plat de sa carte Région ne compte pas en double', () => {
    // Savoie : la carte Région compte comme la Tartiflette.
    const junk = ['nord-entree', 'corse-plat', 'lyonnais-fromage', 'bretagne-dessert'].map(c);
    expect(evaluateOneMenu([c('savoie-entree'), c('savoie-fromage'), c('savoie-dessert'), c('savoie-plat'), ...junk], ['savoie'], ['plat'])?.type).toBe('gastronomique');
    expect(evaluateOneMenu([c('savoie-entree'), c('savoie-plat'), c('savoie-dessert'), c('auvergne-plat'), ...junk], ['savoie'], ['plat'])).toBeNull();
  });

  it('il faut donner exactement 2 cartes, chacune à gauche ou au Marché', () => {
    const s = createGame(setups(2), createRng(3), { rules: { dishOfDay: false, openMarket: false } });
    const [a, b] = s.players[0].hand.filter((x) => x.kind !== 'vaisselle');
    expect(() => submitChoice(s, 0, { cardId: a.id, mode: 'pass' })).toThrow(/2 carte/);
    expect(() => submitChoice(s, 0, { cardId: a.id, mode: 'pass', extra: [{ cardId: a.id, mode: 'market' }] })).toThrow(/deux fois/);
    submitChoice(s, 0, { cardId: a.id, mode: 'pass', extra: [{ cardId: b.id, mode: 'market' }] });
    const [c2, d2] = s.players[1].hand.filter((x) => x.kind !== 'vaisselle');
    submitChoice(s, 1, { cardId: c2.id, mode: 'pass', extra: [{ cardId: d2.id, mode: 'pass' }] });
    const before = s.discard.length;
    resolveExchange(s, createRng(1));
    expect(s.discard.length).toBe(before + 1);
    expect(s.players[1].hand.map((x) => x.id)).toContain(a.id);
    expect(s.players[0].hand.map((x) => x.id)).toEqual(expect.arrayContaining([c2.id, d2.id]));
    s.players.forEach((p) => expect(p.hand).toHaveLength(8));
  });

  it('dénonciation juste : la carte Région est remplacée par une autre de la réserve', () => {
    const s = createGame(setups(3), createRng(8), { rules: { dishOfDay: false } });
    const h = vaisselleHolder(s)!;
    const t = (h + 1) % 3;
    const region = s.players[t].regions[0];
    const reserve = s.regionReserve.length;
    denounce(s, h, t, region, createRng(2));
    expect(s.players[t].regions[0]).not.toBe(region);
    expect(s.regionReserve).toHaveLength(reserve);
    // L'ancienne carte Région retourne dans la réserve.
    expect(s.regionReserve.some((x) => x.startsWith(`${region}|`))).toBe(true);
    expect(vaisselleHolder(s)).toBe(t);
  });

  it.each(['facile', 'moyen', 'difficile'] as const)('une partie complète entre IA (%s) se termine', (d) => {
    for (const n of [2, 3, 4]) {
      const s = createGame(setups(n, d), createRng(n * 7));
      const rng = createRng(n);
      let guard = 0;
      while (s.phase !== 'gameOver' && guard++ < 5000) {
        if (s.phase === 'roundOver') nextRound(s, rng);
        else playBotTurn(s, rng);
        s.players.forEach((p) => expect(p.hand).toHaveLength(8));
      }
      expect(s.phase).toBe('gameOver');
    }
  });
});

describe('options : plusieurs Baguettes et cartes à effet', () => {
  const opts = { rules: { baguettes: 3, effects: { demitour: 2, troc: 2 }, dishOfDay: false } };
  const total = totalCards;

  it('le paquet contient les Baguettes et cartes à effet demandées', () => {
    const s = createGame(setups(3), createRng(5), opts);
    const all = [...s.players.flatMap((p) => p.hand), ...s.drawPile];
    expect(all.filter((x) => x.kind === 'baguette')).toHaveLength(3);
    expect(all.filter((x) => x.kind === 'effect')).toHaveLength(4);
    expect(cardById('troc-2').kind).toBe('effect');
    expect(cardById('baguette-3').kind).toBe('baguette');
  });

  it('une seule Baguette compte par menu', () => {
    const junk = ['nord-entree', 'corse-plat', 'lyonnais-fromage', 'bretagne-dessert'].map(c);
    const two = [c('savoie-entree'), BAGUETTE, cardById('baguette-2'), ...junk, c('auvergne-plat')];
    expect(evaluateOneMenu(two, ['savoie'], ['plat'])).toBeNull();
  });

  it('Demi-tour : la carte part sur la pile spéciale et le sens s’inverse au tour suivant', () => {
    const s = createGame(setups(3), createRng(5), opts);
    s.players[0].hand[0] = effectCard('demitour', 1);
    s.players.forEach((p, i) => {
      const cards = p.hand.filter((x) => x.kind !== 'effect').slice(0, 2);
      const first = i === 0 ? { cardId: 'demitour-1', mode: 'effect' as const } : { cardId: cards[0].id, mode: 'pass' as const };
      submitChoice(s, i, { ...first, extra: [{ cardId: (i === 0 ? cards[0] : cards[1]).id, mode: 'pass' }] });
    });
    const before = total(s);
    resolveExchange(s, createRng(1));
    expect(s.specialPile.map((x) => x.id)).toEqual(['demitour-1']);
    expect(s.direction).toBe(-1);
    expect(total(s)).toBe(before);
    s.players.forEach((p) => expect(p.hand).toHaveLength(8));
  });

  it('Troc : les deux mains sont échangées après l’échange', () => {
    const s = createGame(setups(3), createRng(6), opts);
    s.players[0].hand[0] = effectCard('troc', 1);
    s.players.forEach((p, i) => {
      const cards = p.hand.filter((x) => x.kind !== 'effect').slice(0, 2);
      const first = i === 0 ? { cardId: 'troc-1', mode: 'effect' as const, target: 2 } : { cardId: cards[0].id, mode: 'pass' as const };
      submitChoice(s, i, { ...first, extra: [{ cardId: (i === 0 ? cards[0] : cards[1]).id, mode: 'pass' }] });
    });
    // Sans Troc, J0 aurait reçu les cartes de J2 et gardé le reste de sa main : avec le Troc,
    // il récupère toute la main de J2 (après l'échange), et inversement.
    const plain = cloneState(s);
    plain.choices[0] = { ...plain.choices[0], mode: 'market', target: undefined };
    resolveExchange(plain, createRng(1));
    const sim = cloneState(s);
    resolveExchange(sim, createRng(1));
    expect(sim.specialPile.map((x) => x.id)).toEqual(['troc-1']);
    expect(ids(sim.players[0].hand)).toEqual(ids(plain.players[2].hand));
    expect(ids(sim.players[2].hand)).toEqual(ids(plain.players[0].hand));
    expect(() => submitChoice(createGame(setups(3), createRng(6), opts), 0, { cardId: 'x', mode: 'effect' })).toThrow();
  });

  it('les parties entre IA se terminent avec toutes les options', () => {
    for (const n of [2, 3, 4]) {
      const s = createGame(setups(n, 'difficile'), createRng(n), opts);
      const rng = createRng(n + 1);
      let guard = 0;
      while (s.phase !== 'gameOver' && guard++ < 5000) {
        if (s.phase === 'roundOver') nextRound(s, rng);
        else playBotTurn(s, rng);
        s.players.forEach((p) => expect(p.hand).toHaveLength(8));
      }
      expect(s.phase).toBe('gameOver');
    }
  });
});

describe('version 4 : annonces face cachée, Dernier service, dénonciation, Marché ouvert, commande, Plat du jour', () => {
  const quiet = { dishOfDay: false, effects: {} };
  const junk = ['nord-entree', 'corse-plat', 'lyonnais-fromage', 'bretagne-dessert', 'auvergne-plat', 'lorraine-plat', 'normandie-entree', 'provence-plat', 'bourgogne-fromage', 'sud-ouest-plat'].map(c);
  /** 3 joueurs : J0 Savoie (carte = Tartiflette), J1 Bretagne (= Crêpes), J2 Alsace (= Choucroute). */
  function table(rules: Partial<Rules> = {}) {
    const s = createGame(setups(3), createRng(3), { rules: { ...quiet, ...rules } });
    s.players[0].regions = ['savoie']; s.players[0].bonus = ['plat'];
    s.players[1].regions = ['bretagne']; s.players[1].bonus = ['dessert'];
    s.players[2].regions = ['alsace']; s.players[2].bonus = ['plat'];
    s.players[0].hand = [c('savoie-entree'), c('savoie-fromage'), c('savoie-dessert'), ...junk.slice(0, 5)];
    s.players[1].hand = [c('bretagne-entree'), c('bretagne-plat'), BAGUETTE, ...junk.slice(5, 10)];
    s.players[2].hand = [VAISSELLE, c('alsace-entree'), c('alsace-fromage'), c('lyonnais-plat'), c('lyonnais-entree'), c('lyonnais-dessert'), c('corse-entree'), c('corse-dessert')];
    s.drawPile = ['nord-plat', 'nord-fromage', 'nord-dessert', 'corse-fromage'].map(c);
    s.discard = [c('alsace-dessert')];
    s.phase = 'announce';
    return s;
  }
  const passTwo = (s: GameState, p: number) => {
    const [a, b] = s.players[p].hand.filter((x) => x.kind !== 'vaisselle' && !(x.kind === 'dish' && s.players[p].regions.includes(x.region)) && x.kind !== 'baguette');
    submitChoice(s, p, { cardId: a.id, mode: 'pass', extra: [{ cardId: b.id, mode: 'pass' }] });
  };

  it('Dernier service : la main de l’annonceur est figée, les autres échangent encore une fois', () => {
    const s = table();
    const frozenHand = ids(s.players[0].hand);
    const ev = resolveAnnouncements(s, [0], createRng(1));
    expect(ev.some((e) => e.type === 'lastService')).toBe(true);
    expect(s.frozen).toEqual([0]);
    expect(s.phase).toBe('choose');
    expect(() => submitChoice(s, 0, { cardId: 'savoie-entree', mode: 'pass', extra: [{ cardId: 'nord-entree', mode: 'pass' }] })).toThrow(/face cachée/);
    // J1 et J2 s'échangent leurs cartes en sautant J0.
    passTwo(s, 1);
    passTwo(s, 2);
    resolveExchange(s, createRng(1));
    expect(ids(s.players[0].hand)).toEqual(frozenHand);
    resolveAnnouncements(s, [], createRng(1));
    expect(s.lastRound?.winner).toBe(0);
    expect(s.lastRound?.menu?.type).toBe('gastronomique');
    expect(s.players[0].etoiles).toBe(1);
  });

  it('un meilleur menu au Dernier service l’emporte ; à égalité, le premier annonceur gagne', () => {
    // J1 a un Maison (Baguette) dès la première annonce ; J0 annonce un Gastronomique au Dernier service.
    const s = table();
    s.players[0].hand = [c('savoie-entree'), c('savoie-fromage'), ...junk.slice(0, 6)];
    s.players[1].hand = [c('bretagne-entree'), c('bretagne-plat'), c('bretagne-fromage'), ...junk.slice(5, 10)];
    resolveAnnouncements(s, [1], createRng(1));
    s.players[0].hand[2] = c('savoie-dessert'); // reçu pendant le Dernier service
    s.phase = 'announce';
    resolveAnnouncements(s, [0], createRng(1));
    expect(s.lastRound?.winner).toBe(1); // égalité Gastronomique : le premier annonceur passe devant
    expect(s.lastRound?.lateAnnouncers).toEqual([0]);
  });

  it('bluff raté : −1 étoile, la Vaisselle, et la manche continue si personne n’avait de menu', () => {
    const s = table();
    s.players[0].hand = [c('savoie-entree'), ...junk.slice(0, 7)];
    s.players[0].etoiles = 2;
    resolveAnnouncements(s, [0], createRng(1));
    passTwo(s, 1);
    passTwo(s, 2);
    resolveExchange(s, createRng(1));
    const ev = resolveAnnouncements(s, [], createRng(1));
    expect(ev.some((e) => e.type === 'bluff')).toBe(true);
    expect(s.players[0].etoiles).toBe(1);
    expect(vaisselleHolder(s)).toBe(0);
    expect(s.phase).toBe('choose');
    expect(s.frozen).toEqual([]);
  });

  it('sans annonce face cachée, on ne peut pas bluffer', () => {
    const s = table({ blindAnnounce: false });
    s.players[0].hand = [c('savoie-entree'), ...junk.slice(0, 7)];
    expect(() => resolveAnnouncements(s, [0], createRng(1))).toThrow(/complet/);
  });

  it('dénoncer : on montre une carte ; si c’est juste, elle part chez l’accusé contre une carte au hasard', () => {
    const s = table();
    s.phase = 'choose';
    expect(() => denounce(s, 2, 1, 'bretagne', createRng(1), undefined, { reveal: 'vaisselle' })).toThrow(/Montre/);
    denounce(s, 2, 1, 'bretagne', createRng(1), 'nord-plat', { reveal: 'corse-entree', rewardCardId: 'bretagne-plat' });
    expect(s.denunciation?.revealed?.id).toBe('corse-entree');
    expect(ids(s.players[1].hand)).toContain('corse-entree');
    expect(ids(s.players[2].hand)).toContain('bretagne-plat');
    expect(s.denunciation?.rewardTaken?.id).toBe('bretagne-plat');
    expect(vaisselleHolder(s)).toBe(1);
    s.players.forEach((p) => expect(p.hand).toHaveLength(8));
  });

  it('Marché ouvert : le receveur peut prendre la carte visible de la défausse', () => {
    const s = table();
    s.phase = 'choose';
    // J0 envoie une carte au Marché : J1 reçoit à la place la Kougelhopf visible.
    submitChoice(s, 0, { cardId: 'nord-entree', mode: 'market', extra: [{ cardId: 'corse-plat', mode: 'pass' }] });
    passTwo(s, 1);
    submitChoice(s, 2, { cardId: 'vaisselle', mode: 'pass', extra: [{ cardId: 'corse-entree', mode: 'pass' }] });
    const [ev] = resolveExchange(s, createRng(1), { 1: 'defausse' });
    expect(ids(s.players[1].hand)).toContain('alsace-dessert');
    expect(ev.type === 'exchange' && ev.moves.find((m) => m.mode === 'market')?.fromDiscard).toBe(true);
    expect(ids(s.discard)).toEqual(['nord-entree']);
  });

  it('commande : chacun répond honnêtement s’il a le plat demandé', () => {
    const s = table();
    s.phase = 'choose';
    const [ev] = placeOrder(s, 0, { cardId: 'bretagne-plat' });
    expect(ev.type === 'order' && ev.order.yes).toEqual([1]);
    expect(() => placeOrder(s, 0, { cardId: 'alsace-entree' })).toThrow(/déjà/);
  });

  it('Plat du jour : fromages au Marché, 3 cartes par tour, pas de dénonciation, 2 étoiles', () => {
    const s = table();
    s.phase = 'choose';
    s.event = 'fromagesBloques';
    expect(() => submitChoice(s, 0, { cardId: 'lyonnais-fromage', mode: 'pass', extra: [{ cardId: 'nord-entree', mode: 'pass' }] })).toThrow(/fromages/);
    expect(() => submitChoice(s, 0, { cardId: 'lyonnais-fromage', mode: 'market', extra: [{ cardId: 'nord-entree', mode: 'pass' }] })).not.toThrow();
    s.event = 'troisCartes';
    expect(() => submitChoice(s, 0, { cardId: 'lyonnais-fromage', mode: 'pass', extra: [{ cardId: 'nord-entree', mode: 'pass' }] })).toThrow(/3 cartes/);
    s.event = 'sansDenonciation';
    expect(checkDenounce(s, 2)).toMatch(/Repas de famille/);
    const t = table({ lastService: false });
    t.event = 'doubleEtoile';
    resolveAnnouncements(t, [0], createRng(1));
    expect(t.players[0].etoiles).toBe(2);
  });

  it('Chapardeur et Contrôle sanitaire', () => {
    const s = table({ effects: {} });
    s.phase = 'choose';
    s.players[0].hand[7] = effectCard('chapardeur', 1);
    s.players[1].hand[7] = effectCard('controle', 1);
    submitChoice(s, 0, { cardId: 'chapardeur-1', mode: 'effect', target: 1, give: 'corse-plat', extra: [{ cardId: 'nord-entree', mode: 'pass' }] });
    submitChoice(s, 1, { cardId: 'controle-1', mode: 'effect', target: 0, extra: [{ cardId: 'lorraine-plat', mode: 'pass' }] });
    submitChoice(s, 2, { cardId: 'corse-dessert', mode: 'pass', extra: [{ cardId: 'corse-entree', mode: 'pass' }] });
    const [ev] = resolveExchange(s, createRng(2));
    const steal = ev.type === 'exchange' ? ev.moves.find((m) => m.card.id === 'chapardeur-1') : undefined;
    expect(steal?.stolen).toBeTruthy();
    expect(ids(s.players[0].hand)).toContain(steal!.stolen!.id);
    expect(ids(s.players[1].hand)).toContain('corse-plat');
    expect(checkAnnounce(s, 0)).toMatch(/Contrôle sanitaire/);
    expect(s.specialPile.map((x) => x.id).sort()).toEqual(['chapardeur-1', 'controle-1']);
    s.players.forEach((p) => expect(p.hand).toHaveLength(8));
  });

  it('les parties entre IA se terminent avec toutes les règles de la version 4', () => {
    for (const d of ['facile', 'moyen', 'difficile'] as const)
      for (const n of [2, 3, 4]) {
        const s = createGame(setups(n, d), createRng(n * 13));
        const rng = createRng(n + 7);
        let guard = 0;
        while (s.phase !== 'gameOver' && guard++ < 5000) {
          if (s.phase === 'roundOver') nextRound(s, rng);
          else playBotTurn(s, rng);
          expect(totalCards(s)).toBe(TOTAL_DEFAULT);
          s.players.forEach((p) => expect(p.hand).toHaveLength(8));
        }
        expect(s.phase).toBe('gameOver');
      }
  });
});

describe('variante « un menu » (une région à terminer, carte Région avec un plat)', () => {
  it('distribution : 2 régions par joueur avec un plat fourni, régions partagées possibles', () => {
    let shared = false;
    for (let seed = 1; seed <= 60; seed++) {
      const s = createGame(setups(4), createRng(seed), { rules: { mode: 'unMenu', regionsPerPlayer: 2, passCount: 4, regionCards: 'partagees', effects: { demitour: 0, troc: 0 } } });
      s.players.forEach((p) => {
        expect(p.regions).toHaveLength(2);
        expect(new Set(p.regions).size).toBe(2);
        p.bonus.forEach((b) => expect(['entree', 'plat', 'fromage', 'dessert']).toContain(b));
      });
      const all = s.players.flatMap((p) => p.regions);
      if (new Set(all).size < all.length) shared = true;
      expect(s.regionReserve).toHaveLength(12 * 4 - 8);
    }
    expect(shared).toBe(true);
  });

  it('il suffit des 3 plats manquants d’une seule de ses régions', () => {
    const own = ['alsace', 'savoie'];
    const bonus = ['plat', 'dessert'] as const;
    const junk = ['nord-entree', 'corse-plat', 'lyonnais-fromage', 'bretagne-dessert', 'auvergne-plat'].map(c);
    expect(evaluateOneMenu([c('alsace-entree'), c('alsace-fromage'), c('alsace-dessert'), ...junk], own, [...bonus])?.type).toBe('gastronomique');
    expect(evaluateOneMenu([c('alsace-entree'), c('alsace-fromage'), BAGUETTE, ...junk], own, [...bonus])?.type).toBe('maison');
    expect(evaluateOneMenu([c('alsace-entree'), c('alsace-fromage'), ...junk, c('normandie-plat')], own, [...bonus])).toBeNull();
    // Plus de menu Volé : les 4 plats d'une autre région ne suffisent pas.
    expect(evaluateOneMenu([...R('nord'), ...junk.slice(1)], own, [...bonus])).toBeNull();
    expect(evaluateOneMenu([c('alsace-entree'), c('alsace-fromage'), c('alsace-dessert'), VAISSELLE, ...junk.slice(1)], own, [...bonus])).toBeNull();
  });

  it('4 cartes données par tour : chacun garde 8 cartes et une partie se termine', () => {
    const s = createGame(setups(3, 'difficile'), createRng(3), { rules: { mode: 'unMenu', regionsPerPlayer: 2, passCount: 4, regionCards: 'partagees', effects: { demitour: 0, troc: 0 } } });
    const rng = createRng(4);
    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 5000) {
      if (s.phase === 'roundOver') nextRound(s, rng);
      else playBotTurn(s, rng);
      expect(totalCards(s)).toBe(TOTAL);
      s.players.forEach((p) => expect(p.hand).toHaveLength(8));
    }
    expect(s.phase).toBe('gameOver');
  });
});

describe('annonces et départage', () => {
  /** Met le jeu en phase d'annonce avec des mains et régions imposées. */
  function announceState(hands: Card[][], regions: string[][]) {
    const s = createGame(setups(hands.length), createRng(5), V2);
    s.players.forEach((p, i) => {
      p.hand = hands[i];
      p.regions = regions[i];
    });
    s.phase = 'announce';
    return s;
  }
  const junk = () => [...R('lyonnais'), ...R('lorraine')];
  const junkV = () => [...R('lyonnais'), ...R('lorraine').slice(0, 3), VAISSELLE];

  it('on ne peut pas annoncer sans 2 menus complets, ni avec la Vaisselle', () => {
    const s = announceState([[...R('alsace'), ...R('savoie').slice(1), VAISSELLE], [...R('nord'), ...R('corse')]], [['alsace', 'savoie'], ['nord', 'corse']]);
    expect(() => resolveAnnouncements(s, [0], createRng(1))).toThrow();
  });

  it('sans annonce, on passe au tour suivant', () => {
    const s = announceState([junkV(), junk()], [['alsace', 'savoie'], ['nord', 'corse']]);
    resolveAnnouncements(s, [], createRng(1));
    expect(s.phase).toBe('choose');
    expect(s.turn).toBe(2);
  });

  it('la meilleure annonce gagne l’Étoile', () => {
    const s = announceState(
      [junkV(), [...R('alsace'), ...R('savoie')], [...R('nord'), ...R('corse').slice(1), BAGUETTE]],
      [['provence', 'bourgogne'], ['alsace', 'savoie'], ['nord', 'corse']],
    );
    resolveAnnouncements(s, [1, 2], createRng(1));
    expect(s.lastRound?.winner).toBe(1);
    expect(s.lastRound?.menu?.type).toBe('gastronomique');
    expect(s.players[1].etoiles).toBe(1);
    expect(s.phase).toBe('roundOver');
    expect(s.lastRound?.regions[1]).toEqual(['alsace', 'savoie']);
  });

  it('égalité : le plus proche à gauche du porteur de la Vaisselle gagne', () => {
    // 4 joueurs, J1 a la Vaisselle. J0 et J3 font un Volé : J3 est plus près à gauche de J1 (J2, J3, J0).
    const s = announceState(
      [[...R('nord'), ...R('corse')], junkV(), junk(), [...R('alsace'), ...R('savoie')]],
      [['provence', 'auvergne'], ['bretagne', 'normandie'], ['bourgogne', 'sud-ouest'], ['provence', 'bourgogne']],
    );
    resolveAnnouncements(s, [0, 3], createRng(1));
    expect(s.lastRound?.winner).toBe(3);
    expect(s.lastRound?.tieBreak).toBe('vaisselle');
  });

  it('égalité sans Vaisselle en main : au hasard', () => {
    const s = announceState([[...R('nord'), ...R('corse')], [...R('alsace'), ...R('savoie')]], [['nord', 'corse'], ['alsace', 'savoie']]);
    resolveAnnouncements(s, [0, 1], createRng(1));
    expect([0, 1]).toContain(s.lastRound?.winner);
    expect(s.lastRound?.tieBreak).toBe('hasard');
  });
});

describe('victoire', () => {
  it('le premier à 3 Étoiles est Chef 3 étoiles', () => {
    const s = createGame(setups(2), createRng(9), V2);
    s.players[0].etoiles = 2;
    s.players[0].hand = [...R(s.players[0].regions[0]), ...R(s.players[0].regions[1])];
    s.players[1].hand = [VAISSELLE, ...R('lyonnais'), ...R('lorraine').slice(0, 3)];
    s.phase = 'announce';
    const events = resolveAnnouncements(s, [0], createRng(1));
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe(0);
    expect(events.some((e) => e.type === 'gameWon')).toBe(true);
  });

  it.each(['facile', 'moyen', 'difficile'] as const)('une partie complète entre IA (%s) se termine', (d) => {
    for (const n of [2, 3, 4]) {
      const s = createGame(setups(n, d), createRng(n * 31), V2);
      const rng = createRng(n);
      let guard = 0;
      while (s.phase !== 'gameOver' && guard++ < 20000) {
        if (s.phase === 'roundOver') nextRound(s, rng);
        else playBotTurn(s, rng);
      }
      expect(s.phase).toBe('gameOver');
      expect(s.players[s.winner!].etoiles).toBe(3);
    }
  });
});
