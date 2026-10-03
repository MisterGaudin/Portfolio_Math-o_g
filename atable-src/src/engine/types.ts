// Types du moteur de règles d'« À TABLE ! ».
// Le moteur est du TypeScript pur : aucune dépendance à React ni au navigateur.
import type { Course } from '../config/cards';

export type { Course };
export type RegionId = string;
export type Difficulty = 'facile' | 'moyen' | 'difficile';

/** Une spécialité régionale (Entrée, Plat, Fromage ou Dessert). */
export interface DishCard {
  kind: 'dish';
  /** Identifiant stable, utilisé aussi pour l'image : « alsace-plat ». */
  id: string;
  region: RegionId;
  course: Course;
  name: string;
}

/** Le joker : remplace n'importe quelle carte d'un menu. */
export interface BaguetteCard {
  kind: 'baguette';
  id: 'baguette';
  name: string;
}

/** La carte qu'on veut refiler : interdit d'annoncer tant qu'on l'a. */
export interface VaisselleCard {
  kind: 'vaisselle';
  id: 'vaisselle';
  name: string;
}

export type Card = DishCard | BaguetteCard | VaisselleCard;

/** Ce qu'on fait de la carte choisie : la passer à gauche ou l'envoyer au Marché. */
export type Mode = 'pass' | 'market';

export interface Choice {
  cardId: string;
  mode: Mode;
}

export interface PlayerSetup {
  name: string;
  isHuman: boolean;
  difficulty: Difficulty;
}

export interface Player extends PlayerSetup {
  hand: Card[];
  /** Carte Région secrète. */
  region: RegionId;
  toques: number;
}

/** Les 4 menus, du plus fort (4) au plus faible (1). */
export type MenuType = 'gastronomique' | 'maison' | 'vole' | 'jour';

export const MENU_RANK: Record<MenuType, number> = { gastronomique: 4, maison: 3, vole: 2, jour: 1 };
export const MENU_LABELS: Record<MenuType, string> = {
  gastronomique: 'Gastronomique',
  maison: 'Maison',
  vole: 'Volé',
  jour: 'Menu du Jour',
};

export interface Menu {
  type: MenuType;
  rank: number;
  /** Région du menu (Gastronomique, Maison, Volé). */
  region?: RegionId;
}

/** Résultat public d'une dénonciation. */
export interface Denunciation {
  accuser: number;
  target: number;
  region: RegionId;
  correct: boolean;
  /** Qui a reçu la Vaisselle (null si elle était déjà chez lui). */
  vaisselleTo: number | null;
  vaisselleFrom: number | null;
}

/** Un mouvement de carte pendant l'échange simultané. */
export interface Move {
  player: number;
  mode: Mode;
  /** Carte jouée. Publique si mode = 'market', sinon connue seulement du receveur. */
  card: Card;
  /** Voisin de gauche qui reçoit (la carte passée, ou la carte de la pioche). */
  to: number;
  /** Carte de la pioche reçue par le voisin en cas de Marché (connue du seul receveur). */
  drawn?: Card;
}

/** Mémoire d'un tour, utilisée par l'IA et les statistiques. */
export interface TurnRecord {
  turn: number;
  denunciation?: Denunciation;
  moves: Move[];
  reshuffled: boolean;
}

/** D'où vient une carte (pour mesurer l'effet du Marché). */
export type Origin = 'deal' | 'pass' | 'market' | 'swap';

export type Phase = 'choose' | 'announce' | 'roundOver' | 'gameOver';

export interface RoundResult {
  winner: number | null;
  menu: Menu | null;
  announcers: number[];
  /** Mains révélées des annonceurs. */
  hands: Record<number, Card[]>;
  /** Régions secrètes de tout le monde en fin de manche. */
  regions: RegionId[];
  turns: number;
  /** Comment l'égalité a été tranchée, le cas échéant. */
  tieBreak: 'none' | 'vaisselle' | 'hasard';
  /** Vrai si le menu gagnant contient une carte arrivée par le Marché. */
  thanksToMarket: boolean;
}

/**
 * Variantes du Menu du Jour (pour l'équilibrage) :
 * - standard : règle officielle (4 types, régions mélangées, Baguette autorisée) ;
 * - sansBaguette : Baguette interdite dans le Menu du Jour ;
 * - deuxRegions : cartes de 2 régions au maximum ;
 * - deuxMaison : au moins 2 cartes de SA région ;
 * - interdit : pas de Menu du Jour du tout.
 */
export type MenuDuJourRule = 'standard' | 'sansBaguette' | 'deuxRegions' | 'deuxMaison' | 'interdit';

export interface GameState {
  players: Player[];
  /** Régions en jeu pour la manche (joueurs + 2 leurres). Publiques. */
  regionsInPlay: RegionId[];
  /** Cartes Région non distribuées, face cachée. */
  regionReserve: RegionId[];
  /** Pioche face cachée : le dessus est la FIN du tableau. */
  drawPile: Card[];
  /** Défausse face visible : le dessus est la FIN du tableau. */
  discard: Card[];
  phase: Phase;
  roundNumber: number;
  /** Numéro du tour dans la manche (commence à 1). */
  turn: number;
  /** Choix secrets du tour en cours, par joueur. */
  choices: Record<number, Choice>;
  /** Dénonciation déjà faite ce tour-ci. */
  denunciation: Denunciation | null;
  history: TurnRecord[];
  origins: Record<string, Origin>;
  /** Statistiques de la manche en cours. */
  stats: { vaisselleMoves: number; denunciations: number; correctDenunciations: number; reshuffles: number };
  lastRound: RoundResult | null;
  winner: number | null;
  /** Nombre de Toques pour devenir Grand Chef. */
  toquesToWin: number;
  /** Sécurité : au-delà, la manche s'arrête sans gagnant. */
  maxTurns: number;
  /** Variante du Menu du Jour ('standard' = règle officielle). */
  menuDuJour: MenuDuJourRule;
}

/** Événements renvoyés par le moteur pour l'UI (animations, journal). */
export type GameEvent =
  | { type: 'roundStart'; round: number }
  | { type: 'denounce'; denunciation: Denunciation }
  | { type: 'exchange'; moves: Move[] }
  | { type: 'reshuffle' }
  | { type: 'announce'; announcers: number[] }
  | { type: 'noAnnounce' }
  | { type: 'roundWon'; result: RoundResult }
  | { type: 'gameWon'; player: number };
