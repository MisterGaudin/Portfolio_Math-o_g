// Traduction des événements du moteur en phrases du journal de jeu.
import { cardLabel, rankLabel, type GameEvent, type GameState } from '../engine';

export interface LogEntry {
  id: number;
  text: string;
  /** Message important (Boulet, fin de manche) mis en avant. */
  strong?: boolean;
}

const COLOR_NAME = { rouge: 'rouge', bleu: 'bleu', vert: 'vert', jaune: 'jaune' } as const;

/** Joueur humain = index 0 : on le tutoie. */
const isMe = (i: number) => i === 0;

export function describeEvents(state: GameState, events: GameEvent[]): Omit<LogEntry, 'id'>[] {
  const name = (i: number) => state.players[i].name;
  const out: Omit<LogEntry, 'id'>[] = [];
  for (let k = 0; k < events.length; k++) {
    const e = events[k];
    switch (e.type) {
      case 'play': {
        const gift = events[k + 1]?.type === 'boulet' ? (events[k + 1] as Extract<GameEvent, { type: 'boulet' }>) : null;
        const who = isMe(e.player) ? 'Tu poses' : `${name(e.player)} pose`;
        let what = e.cards.length === 2 ? `un double ${rankLabel(e.cards[0])}` : cardLabel(e.cards[0]);
        if (e.cards[e.cards.length - 1].kind === 'joker') what += ` (→ ${COLOR_NAME[e.color]})`;
        if (gift) {
          const verb = isMe(e.player) ? 'refiles' : isMe(gift.to) ? 'te refile' : 'refile';
          const target = isMe(gift.to) ? '' : ` à ${name(gift.to)}`;
          out.push({ text: `${who} ${what} et ${verb} le BOULET${target} !`, strong: true });
          k++;
        } else out.push({ text: `${who} ${what}` });
        break;
      }
      case 'draw':
        if (e.reason === 'plus2')
          out.push({ text: isMe(e.player) ? `Tu pioches ${e.count} cartes et passes ton tour` : `${name(e.player)} pioche ${e.count} cartes et passe son tour` });
        else if (e.count > 0) out.push({ text: isMe(e.player) ? 'Tu pioches' : `${name(e.player)} pioche` });
        break;
      case 'skip':
        if (events[k - 1]?.type !== 'draw')
          out.push({ text: isMe(e.player) ? 'Tu passes ton tour' : `${name(e.player)} passe son tour` });
        break;
      case 'reverse':
        out.push({ text: 'Le sens du jeu change !' });
        break;
      case 'reshuffle':
        out.push({ text: `La défausse est remélangée (${e.count} cartes)` });
        break;
      case 'exchange':
        {
          const cards = e.cards.map(cardLabel).join(' et ');
          if (isMe(e.from)) out.push({ text: `Tu donnes ${cards} à ${name(e.to)}` });
          else if (isMe(e.to)) out.push({ text: `${name(e.from)} te donne ${cards}` });
          else out.push({ text: `${name(e.from)} donne ${cards} à ${name(e.to)}` });
        }
        break;
      case 'roundEnd':
        out.push({ text: isMe(e.winner) ? 'Tu as vidé ta main ! 🎉' : `${name(e.winner)} a vidé sa main !`, strong: true });
        break;
      case 'boulet':
      case 'pass':
        break;
    }
  }
  return out;
}
