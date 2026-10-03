// Types du moteur de règles de BOULET !
// Le moteur est 100 % TypeScript pur : aucune dépendance au DOM ni à React.

export const COLORS = ['rouge', 'bleu', 'vert', 'jaune'] as const;
export type Color = (typeof COLORS)[number];

/** Nature d'une carte. */
export type CardKind = 'number' | 'plus2' | 'reverse' | 'skip' | 'joker' | 'boulet';

export interface Card {
  /** Identifiant unique dans le paquet (0..100). */
  id: number;
  kind: CardKind;
  /** Couleur imprimée ; null pour le Joker et le Boulet. */
  color: Color | null;
  /** Valeur 1..9 pour les chiffres, null sinon. */
  value: number | null;
}

export type Difficulty = 'facile' | 'moyen' | 'difficile';

export interface PlayerInfo {
  name: string;
  isHuman: boolean;
  difficulty: Difficulty;
}

export interface Player extends PlayerInfo {
  hand: Card[];
}

export interface GameConfig {
  players: PlayerInfo[];
  /** Score qui déclenche la fin de partie (300 par défaut). */
  targetScore: number;
  /** Nombre de cartes distribuées (7 par défaut). */
  handSize: number;
}

/** Une action envoyée au moteur par un joueur (humain ou IA). */
export type Action =
  | {
      type: 'play';
      /** 1 carte (simple) ou 2 cartes de même valeur (double), dans l'ordre de pose. */
      cardIds: number[];
      /** Couleur demandée si la dernière carte posée est un Joker. */
      chosenColor?: Color;
      /** Pour un double : joueur qui reçoit le Boulet (optionnel). */
      giveBouletTo?: number;
    }
  | { type: 'draw' }
  /** Après une pioche : garder la carte piochée et finir son tour. */
  | { type: 'pass' }
  /** Entre deux manches : le gagnant rend 2 cartes au Boulet officiel. */
  | { type: 'exchange'; cardIds: number[] };

/** Événements publics produits par le moteur (journal, animations, IA « difficile »). */
export type GameEvent =
  | { type: 'play'; player: number; cards: Card[]; color: Color }
  | { type: 'draw'; player: number; count: number; reason: 'normal' | 'plus2'; facingColor: Color; facingCard: Card }
  | { type: 'pass'; player: number }
  | { type: 'skip'; player: number }
  | { type: 'reverse'; direction: 1 | -1 }
  | { type: 'boulet'; from: number; to: number }
  | { type: 'reshuffle'; count: number }
  | { type: 'roundEnd'; winner: number }
  | { type: 'exchange'; from: number; to: number; cards: Card[] };

export type Phase =
  /** Le joueur courant doit jouer ou piocher. */
  | 'play'
  /** Le joueur courant vient de piocher : il peut poser la carte piochée ou passer. */
  | 'afterDraw'
  /** Le gagnant humain doit choisir 2 cartes à rendre au Boulet officiel. */
  | 'exchange'
  /** Manche terminée, scores calculés. */
  | 'roundOver'
  /** Partie terminée. */
  | 'gameOver';

export interface RoundResult {
  roundNumber: number;
  winner: number;
  /** Points marqués par chaque joueur pendant cette manche. */
  points: number[];
  /** Joueur qui avait le Boulet en main à la fin (null : il est resté dans la pioche). */
  bouletHolder: number | null;
  turns: number;
  bouletPasses: number;
  starter: number;
  /** Boulet officiel au début de cette manche. */
  officialBoulet: number | null;
}

export interface GameState {
  config: GameConfig;
  players: Player[];
  drawPile: Card[];
  /** Défausse : la dernière carte du tableau est le dessus. */
  discard: Card[];
  activeColor: Color;
  direction: 1 | -1;
  current: number;
  phase: Phase;
  /** Carte piochée pendant ce tour (phase afterDraw). */
  drawnCardId: number | null;

  roundNumber: number;
  /** Joueur qui a ouvert la manche. */
  starter: number;
  /** Boulet officiel de la manche en cours (null en manche 1 ou s'il était dans la pioche). */
  officialBoulet: number | null;
  scores: number[];
  /** Nombre de tours joués dans la manche (un tour = un joueur qui termine son coup ou est sauté). */
  turnCount: number;
  bouletPasses: number;
  /** Historique public de la manche en cours. */
  history: GameEvent[];
  results: RoundResult[];
  /** Échange en attente : le gagnant doit rendre 2 cartes au Boulet officiel. */
  pendingExchange: { official: number; winner: number; received: Card[] } | null;
}
