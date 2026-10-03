// Un tour complet joué uniquement par des ordinateurs (simulation et tests).
import { aiAnnounce, aiChooseAll, aiDenounce } from './ai';
import { denounce, resolveAnnouncements, resolveExchange, submitChoice } from './game';
import type { Rng } from './rng';
import type { GameEvent, GameState } from './types';

export function playBotTurn(state: GameState, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  // 1. Dénonciation : la première IA (dans l'ordre des joueurs) qui le souhaite.
  for (let p = 0; p < state.players.length; p++) {
    const d = aiDenounce(state, p);
    if (d) {
      events.push(...denounce(state, p, d.target, d.region, rng));
      break;
    }
  }
  // 2. Choix secrets, 3. révélation et échange simultané.
  state.players.forEach((_, p) => submitChoice(state, p, aiChooseAll(state, p, rng)));
  events.push(...resolveExchange(state, rng));
  // 4. Annonces.
  const announcers = state.players.map((_, p) => p).filter((p) => aiAnnounce(state, p, rng));
  events.push(...resolveAnnouncements(state, announcers, rng));
  return events;
}
