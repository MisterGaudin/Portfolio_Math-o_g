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
  /** « baguette », puis « baguette-2 »… s'il y en a plusieurs. */
  id: string;
  name: string;
}

/** Les effets des cartes spéciales (posées sur la pile spéciale, hors jeu, une fois jouées). */
export type Effect = 'demitour' | 'troc' | 'chapardeur' | 'controle';

/**
 * Carte à effet : « Demi-tour » (le sens s'inverse), « Troc » (échange de main),
 * « Chapardeur » (voler une carte au hasard chez un joueur, lui en rendre une) ou
 * « Contrôle sanitaire » (un joueur ne peut pas annoncer jusqu'à la fin du tour suivant).
 */
export interface EffectCard {
  kind: 'effect';
  id: string;
  effect: Effect;
  name: string;
}

/** La carte qu'on veut refiler : interdit d'annoncer tant qu'on l'a. */
export interface VaisselleCard {
  kind: 'vaisselle';
  id: 'vaisselle';
  name: string;
}

export type Card = DishCard | BaguetteCard | VaisselleCard | EffectCard;

/**
 * Ce qu'on fait de la carte choisie : la passer à gauche, l'envoyer au Marché, ou
 * (carte à effet) la jouer — elle part sur la pile spéciale et le voisin pioche à la place.
 */
export type Mode = 'pass' | 'market' | 'effect';

export interface Pick {
  cardId: string;
  mode: Mode;
  /** Cible d'une carte à effet (Troc, Chapardeur, Contrôle sanitaire). */
  target?: number;
  /** Chapardeur : la carte rendue au joueur volé (choisie à l'avance). */
  give?: string;
}

export interface Choice extends Pick {
  /** Cartes supplémentaires données en même temps (règle « passCount » > 1). */
  extra?: Pick[];
}

export interface PlayerSetup {
  name: string;
  isHuman: boolean;
  difficulty: Difficulty;
}

export interface Player extends PlayerSetup {
  hand: Card[];
  /** Les 2 cartes Région secrètes : les 2 menus à terminer. */
  regions: RegionId[];
  /** Variante « un menu » : le plat déjà fourni par chaque carte Région (même ordre que `regions`). */
  bonus: (Course | null)[];
  etoiles: number;
}

/**
 * Les 3 annonces possibles, du plus fort (3) au plus faible (1). Une main gagnante,
 * ce sont 2 menus complets (4 plats d'une même région chacun) :
 * - Gastronomique : tes 2 régions secrètes, sans Baguette ;
 * - Maison : tes 2 régions secrètes, la Baguette remplaçant un plat manquant ;
 * - Volé : au moins un des 2 menus est d'une autre région que les tiennes.
 */
export type MenuType = 'gastronomique' | 'maison' | 'vole';

export const MENU_RANK: Record<MenuType, number> = { gastronomique: 3, maison: 2, vole: 1 };
export const MENU_LABELS: Record<MenuType, string> = {
  gastronomique: 'Gastronomique',
  maison: 'Maison',
  vole: 'Volé',
};

export interface Menu {
  type: MenuType;
  rank: number;
  /** Les 2 régions des menus. */
  regions: RegionId[];
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
  /** Carte montrée à tous par l'accusateur pour pouvoir dénoncer. */
  revealed?: Card;
  /** Récompense d'une dénonciation juste : carte prise au hasard chez l'accusé (connue de l'accusateur). */
  rewardTaken?: Card;
}

/** Commande : « Qui a le Reblochon ? » — chacun répond oui ou non. */
export interface Order {
  player: number;
  turn: number;
  /** Plat demandé (règle « plat »). */
  cardId?: string;
  /** Type de plat demandé (règle « type »). */
  course?: Course;
  /** Joueurs qui ont répondu « oui ». */
  yes: number[];
}

/** Carte « Plat du jour » : un événement qui change une règle pour toute la manche. */
export type DayEvent = 'service' | 'fromagesBloques' | 'sensInverse' | 'sansBaguette' | 'troisCartes' | 'sansDenonciation' | 'doubleEtoile' | 'commandeLibre';

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
  /** Cible d'une carte à effet jouée. */
  target?: number;
  /** Marché ouvert : le receveur a pris la carte visible de la défausse (public). */
  fromDiscard?: boolean;
  /** Chapardeur : carte rendue (`give`) et carte volée (`stolen`, connue du voleur). */
  give?: string;
  stolen?: Card;
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
  regions: RegionId[][];
  /** Plat fourni par chaque carte Région (variante « un menu »). */
  bonus: (Course | null)[][];
  turns: number;
  /** Comment l'égalité a été tranchée, le cas échéant. */
  tieBreak: 'none' | 'vaisselle' | 'hasard';
  /** Vrai si le menu gagnant contient une carte arrivée par le Marché. */
  thanksToMarket: boolean;
  /** Annonceurs démasqués : main non valide (bluff raté), punis. */
  bluffers: number[];
  /** Annonceurs du « Dernier service » (après la première annonce). */
  lateAnnouncers: number[];
}

/** Réglages de règles, ajustables pour l'équilibrage (page /sim). */
export interface Rules {
  /**
   * Limite des dénonciations :
   * - 'aucune' : pas de limite ;
   * - 'protege' : un joueur démasqué est protégé jusqu'à la fin de la manche ;
   * - 'unique' : chaque joueur ne peut dénoncer qu'une fois par manche.
   */
  denounceLimit: 'aucune' | 'protege' | 'unique';
  /** Cartes de chacune de ses régions garanties dans la main de départ (0 = donne au hasard). */
  headStart: number;
  /** Exemplaires de chaque plat (1 = un seul Camembert ; 2 = deux Camembert…). */
  copies: number;
  /** Nombre de régions en jeu (0 = toutes). */
  regionCount: number;
  /** Nombre de cartes données au voisin à chaque tour. */
  passCount: number;
  /**
   * Condition de victoire :
   * - 'deuxMenus' : terminer les 2 régions secrètes (8 cartes) ;
   * - 'unMenu' : terminer UNE des 2 régions ; chaque carte Région apporte déjà un plat
   *   (il en reste 3 à trouver) et plusieurs joueurs peuvent avoir la même région.
   */
  mode: 'deuxMenus' | 'unMenu';
  /** Nombre de régions secrètes par joueur. */
  regionsPerPlayer: number;
  /**
   * Cartes Région (règle « un menu ») :
   * - 'uniques' : 12 cartes, une par région, chacune comptant comme un plat fixe de sa région
   *   (voir `regionCourse` dans la config) ; deux joueurs n'ont jamais la même région ;
   * - 'partagees' : 48 cartes (région × plat), plusieurs joueurs peuvent avoir la même région.
   */
  regionCards: 'uniques' | 'partagees';
  /** Nombre de Baguettes dans le paquet (une seule peut servir par menu). */
  baguettes: number;
  /** Cartes à effet dans le paquet. */
  effects: Partial<Record<Effect, number>>;
  /** Annonce face cachée : on peut annoncer sans menu valide (bluff, puni si raté). */
  blindAnnounce: boolean;
  /** Dernier service : après une annonce, les autres jouent un dernier tour d'échange. */
  lastService: boolean;
  /** Pour dénoncer, on montre une carte ; si c'est juste, on l'échange contre une carte au hasard de l'accusé. */
  revealToDenounce: boolean;
  /** Marché ouvert : celui qui reçoit choisit entre la pioche et la carte visible de la défausse. */
  openMarket: boolean;
  /** Commande, une fois par manche : 'plat' (« Qui a le Reblochon ? »), 'type' (« Qui a un Fromage ? ») ou 'aucune'. */
  commande: 'aucune' | 'plat' | 'type';
  /** Une carte « Plat du jour » est retournée à chaque manche. */
  dishOfDay: boolean;
}

export interface GameState {
  players: Player[];
  /** Régions en jeu : toutes les régions du jeu, à chaque manche. */
  regionsInPlay: RegionId[];
  /** Cartes Région non distribuées, face cachée (pioche des régions). */
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
  /** Nombre d'étoiles pour devenir Chef 3 étoiles. */
  etoilesToWin: number;
  /** Sécurité : au-delà, la manche s'arrête sans gagnant. */
  maxTurns: number;
  /** Un joueur qui a fait une fausse dénonciation ne peut pas dénoncer avant ce tour. */
  denounceBanUntil: Record<number, number>;
  /** Joueurs déjà démasqués cette manche (protégés jusqu'à la fin de la manche). */
  unmasked: number[];
  /** Réglages de la partie (voir GameOptions). */
  rules: Rules;
  /** Sens de passage : +1 = vers la gauche (joueur suivant), -1 = vers la droite. */
  direction: 1 | -1;
  /** Pile spéciale : cartes à effet déjà jouées, sorties du jeu pour la manche. */
  specialPile: Card[];
  /** Annonceurs dont la main est posée face cachée (figée), dans l'ordre des annonces. */
  frozen: number[];
  /** Vrai pendant le « Dernier service » (après la première annonce). */
  lastService: boolean;
  /** Contrôle sanitaire : le joueur ne peut pas annoncer tant que le tour est ≤ cette valeur. */
  blockedUntil: Record<number, number>;
  /** Carte « Plat du jour » de la manche. */
  event: DayEvent;
  /** Commandes passées cette manche (publiques). */
  orders: Order[];
}

/** Événements renvoyés par le moteur pour l'UI (animations, journal). */
export type GameEvent =
  | { type: 'roundStart'; round: number }
  | { type: 'denounce'; denunciation: Denunciation }
  | { type: 'exchange'; moves: Move[] }
  | { type: 'reshuffle' }
  | { type: 'announce'; announcers: number[] }
  | { type: 'lastService'; announcers: number[] }
  | { type: 'bluff'; players: number[] }
  | { type: 'order'; order: Order }
  | { type: 'noAnnounce' }
  | { type: 'roundWon'; result: RoundResult }
  | { type: 'gameWon'; player: number };
