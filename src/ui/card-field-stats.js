/**
 * Helper to render the live attack and defense values on monster cards
 * located face-up on the field during duels.
 */
export function cardFieldStatsMarkup(instance, card, { esc = (s) => String(s ?? "") } = {}) {
  if (!instance || !card || instance.faceUp === false) return "";

  const currentAtk = Number.isFinite(Number(instance.attack))
    ? Number(instance.attack)
    : (Number.isFinite(Number(instance.atk)) ? Number(instance.atk) : card.atk);
  const currentDef = Number.isFinite(Number(instance.defense))
    ? Number(instance.defense)
    : (Number.isFinite(Number(instance.def)) ? Number(instance.def) : card.def);

  const baseAtk = Number(card.atk);
  const baseDef = Number(card.def);

  const atkClass = Number.isFinite(baseAtk) && Number.isFinite(currentAtk)
    ? (currentAtk > baseAtk ? "stat-boosted" : currentAtk < baseAtk ? "stat-reduced" : "stat-normal")
    : "stat-normal";
  const defClass = Number.isFinite(baseDef) && Number.isFinite(currentDef)
    ? (currentDef > baseDef ? "stat-boosted" : currentDef < baseDef ? "stat-reduced" : "stat-normal")
    : "stat-normal";

  const defPart = Number.isFinite(currentDef)
    ? `<span class="stat-slash">/</span><span class="card-stat stat-def ${defClass}">${esc(currentDef)}</span>`
    : "";

  return `<div class="card-field-stats" aria-label="${currentAtk}${Number.isFinite(currentDef) ? `/${currentDef}` : ""}">`
    + `<span class="card-stat stat-atk ${atkClass}">${esc(currentAtk ?? "—")}</span>`
    + `${defPart}`
    + `</div>`;
}
