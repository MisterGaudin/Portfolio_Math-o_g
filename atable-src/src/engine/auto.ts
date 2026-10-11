// Un tour complet joué uniquement par des ordinateurs (simulation et tests).
import { aiAnnounce, aiChooseAll, aiDenounce, aiOrder, aiOrderGive, aiOrderService, aiReveal, aiShow, aiTake } from './ai';
import { activePlayers, denounce, marketReceivers, pendingOrder, placeOrder, resolveAnnouncements, settleOrder, resolveExchange, showCard, submitChoice } from './game';
import type { Rng } from './rng';
import type { GameEvent, GameState } from './types';

/** Commande éventuelle d'un ordinateur (avant ses choix), carte rendue comprise. */
export function botOrder(state: GameState, p: number, rng: Rng): GameEvent[] {
  if (state.rules.commande === 'service') {
    const events: GameEvent[] = [];
    for (let k = 0; k < 3; k++) {
      const o = aiOrderService(state, p, rng);
      if (!o) break;
      try {
        events.push(...placeOrder(state, p, o));
      } catch {
        break; // commande refusée par les règles : on n'insiste pas
      }
      if (pendingOrder(state)) settleOrder(state, p, aiOrderGive(state, p, rng));
    }
    return events;
  }
  const want = aiOrder(state, p);
  return want ? placeOrder(state, p, { cardId: want }) : [];
}

export function playBotTurn(state: GameState, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  // 0. Inspection : chacun montre une carte.
  for (const p of activePlayers(state)) {
    const id = aiShow(state, p, rng);
    if (id) events.push(...showCard(state, p, id));
  }
  // 1. Dénonciation : la première IA (dans l'ordre des joueurs) qui le souhaite.
  for (let p = 0; p < state.players.length; p++) {
    const d = aiDenounce(state, p);
    if (d) {
      events.push(...denounce(state, p, d.target, d.region, rng, undefined, { reveal: aiReveal(state, p) }));
      break;
    }
  }
  // 2. Commandes, choix secrets, 3. révélation et échange simultané.
  // Commandes à tour de rôle : le premier à commander change à chaque tour.
  const act = activePlayers(state);
  const first = (state.turn + state.roundNumber) % act.length;
  for (const p of [...act.slice(first), ...act.slice(0, first)]) events.push(...botOrder(state, p, rng));
  for (const p of activePlayers(state)) submitChoice(state, p, aiChooseAll(state, p, rng));
  const takes = Object.fromEntries(marketReceivers(state).map((p) => [p, aiTake(state, p)]));
  events.push(...resolveExchange(state, rng, takes));
  // 4. Annonces.
  const announcers = activePlayers(state).filter((p) => aiAnnounce(state, p, rng));
  events.push(...resolveAnnouncements(state, announcers, rng));
  return events;
}
