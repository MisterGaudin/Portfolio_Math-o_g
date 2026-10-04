// Un tour complet joué uniquement par des ordinateurs (simulation et tests).
import { aiAnnounce, aiChooseAll, aiDenounce, aiOrder, aiReveal, aiTake } from './ai';
import { activePlayers, denounce, marketReceivers, placeOrder, resolveAnnouncements, resolveExchange, submitChoice } from './game';
import type { Rng } from './rng';
import type { GameEvent, GameState } from './types';

export function playBotTurn(state: GameState, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  // 1. Dénonciation : la première IA (dans l'ordre des joueurs) qui le souhaite.
  for (let p = 0; p < state.players.length; p++) {
    const d = aiDenounce(state, p);
    if (d) {
      events.push(...denounce(state, p, d.target, d.region, rng, undefined, { reveal: aiReveal(state, p) }));
      break;
    }
  }
  // 2. Commandes, choix secrets, 3. révélation et échange simultané.
  for (const p of activePlayers(state)) {
    const want = aiOrder(state, p);
    if (want) events.push(...placeOrder(state, p, { cardId: want }));
  }
  for (const p of activePlayers(state)) submitChoice(state, p, aiChooseAll(state, p, rng));
  const takes = Object.fromEntries(marketReceivers(state).map((p) => [p, aiTake(state, p)]));
  events.push(...resolveExchange(state, rng, takes));
  // 4. Annonces.
  const announcers = activePlayers(state).filter((p) => aiAnnounce(state, p, rng));
  events.push(...resolveAnnouncements(state, announcers, rng));
  return events;
}
