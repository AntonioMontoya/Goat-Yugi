import { getCard, getCardByName } from "./cards.js";

function cardNameFromInstance(card) {
  return getCard(card?.cardId)?.name ?? null;
}

export function auditViewSnapshot(view) {
  if (!view) return null;
  return {
    turn: view.turn,
    turnPlayer: view.turnPlayer,
    priorityPlayer: view.priorityPlayer,
    phase: view.phase,
    pendingType: view.pendingType,
    winner: view.winner,
    players: view.players.map((player) => ({
      lp: player.lp,
      hand: player.hand.map(cardNameFromInstance),
      monsterZone: player.monsterZone.map(cardNameFromInstance),
      spellTrapZone: player.spellTrapZone.map(cardNameFromInstance),
      graveyard: player.graveyard.map(cardNameFromInstance),
      banished: player.banished.map(cardNameFromInstance),
      deckCount: player.deckCount,
    })),
    actions: view.actions.map((action) => action.label),
    errors: [...(view.errors ?? [])],
  };
}

export function recordedAuditStep(action, before) {
  return {
    pendingType: before?.pendingType ?? null,
    select: {
      label: action?.label ?? null,
      actionKind: action?.actionKind ?? null,
      cardName: action?.cardCode ? getCardByName(action.cardName)?.name ?? action.cardName ?? null : action?.cardName ?? null,
      selectionCards: action?.selectionCards?.map((card) => card.cardName ?? getCard(card.cardId)?.name).filter(Boolean) ?? [],
      placement: action?.placement ? { player: action.placement.player, location: action.placement.location, sequence: action.placement.sequence } : null,
    },
  };
}
