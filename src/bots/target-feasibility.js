import { OcgPosition } from "../../node_modules/@jsr/n1xx1__ocgcore-wasm/dist/index.js";

function roleSet(roles) {
  return roles instanceof Set ? roles : new Set(roles ?? []);
}

export function publicFaceUp(card) {
  return card?.faceUp === true || (Number(card?.position) & OcgPosition.FACEUP) !== 0;
}

export function hasMonsterPositionConstraint(roles) {
  const values = roleSet(roles);
  return values.has("target-face-up-monster") || values.has("target-face-down-monster");
}

export function matchesPublicMonsterTarget(roles, card) {
  const values = roleSet(roles);
  const needsFaceUp = values.has("target-face-up-monster");
  const needsFaceDown = values.has("target-face-down-monster");
  if (!needsFaceUp && !needsFaceDown) return true;
  if (values.has("turn-face-down") && (card?.isToken === true || (Number(card?.type) & 16384) !== 0)) return false;
  const faceUp = publicFaceUp(card);
  return (needsFaceUp && faceUp) || (needsFaceDown && !faceUp);
}

export function publicMonsterTargetPlan(roles, observation = {}) {
  const own = (observation.ownMonsters ?? []).filter((card) => matchesPublicMonsterTarget(roles, card));
  const opponent = (observation.opponentMonsters ?? []).filter((card) => matchesPublicMonsterTarget(roles, card));
  return {
    constrained: hasMonsterPositionConstraint(roles),
    own,
    opponent,
    ownCount: own.length,
    opponentCount: opponent.length,
  };
}
