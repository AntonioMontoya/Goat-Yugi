// User-provided Lunalight expansion cards. These cards are kept separate from
// the historical GoatFormat CSV and are loaded by the same OCGCore bridge.
const SET_LUNALIGHT = 0xdf;
export const LUCELUNARE_CARD_POOL_SOURCE = Object.freeze({
  provider: "User-provided Lucelunare expansion",
  sourceFile: "LUE-IT custom card list",
  sourceKind: "CUSTOM",
  cards: 7,
});

const card = ({ id, name, code, kind, subtype, attribute = null, race = null, level = null, atk = null, def = null, text, className = null, imageFile = null }) => ({
  id,
  name,
  collectorCode: code,
  kind,
  subtype,
  class: className,
  attribute,
  race,
  level,
  atk,
  def,
  text,
  ...(imageFile ? { imageFile } : {}),
  custom: true,
  source: LUCELUNARE_CARD_POOL_SOURCE,
});

export const LUCELUNARE_CARDS = Object.freeze([
  card({ id: 900000003, name: "Lunalight Lunar Priestess", code: "LUE-IT003", kind: "MONSTER", subtype: "Normal", attribute: "DARK", race: "Beast-Warrior", level: 4, atk: 1400, def: 900, imageFile: "Sacerdotessa Lucelunare.png", text: "A mysterious priestess who fights with a large crescent-shaped scythe. Under the light of the moon, her dance becomes increasingly fierce." }),
  card({ id: 900000021, name: "Lunalight White Trickster", code: "LUE-IT021", kind: "MONSTER", subtype: "Effect", attribute: "LIGHT", race: "Beast-Warrior", level: 2, atk: 800, def: 800, className: "Effect", imageFile: "Coniglio Pallido della Lucelunare.png", text: "FLIP: Return 1 Spell or Trap Card on the field to the owner's hand." }),
  card({ id: 900000022, name: "Lunalight Shadow Sheep", code: "LUE-IT022", kind: "MONSTER", subtype: "Effect", attribute: "DARK", race: "Beast-Warrior", level: 2, atk: 500, def: 500, className: "Effect", imageFile: "Lucelunare Pecora d'Ombra.png", text: "When this card is sent to the Graveyard as a Fusion Material Monster: Return this card to the owner's hand." }),
  card({ id: 900000041, name: "Lunalight Essence", code: "LUE-IT054", kind: "SPELL", subtype: "Normal", imageFile: "Essenza Lucelunare.png", text: "Target 1 \"Lunalight\" monster in your Graveyard; Special Summon it. That monster loses 400 ATK and DEF." }),
  card({ id: 900000054, name: "Lunalight Assault", code: "LUE-IT041", kind: "TRAP", subtype: "Continuous", imageFile: "Assalto Lucelunare.png", text: "During your opponent's Battle Phase, all \"Lunalight\" monsters you control gain 500 ATK and DEF until the end of the Battle Phase." }),
  card({ id: 900000034, name: "Lunalight Crescent Dancer", code: "LUE-IT034", kind: "MONSTER", subtype: "Fusion", attribute: "DARK", race: "Beast-Warrior", level: 7, atk: 2200, def: 1800, className: "Effect", imageFile: "Lucelunare Danzatrice della Mezzaluna.png", text: "2 \"Lunalight\" monsters\nThis card can attack up to 3 monsters your opponent controls, once each, during each Battle Phase." }),
  card({ id: 900000035, name: "Lunalight Panther Queen", code: "LUE-IT035", kind: "MONSTER", subtype: "Fusion", attribute: "DARK", race: "Beast-Warrior", level: 8, atk: 2800, def: 2500, className: "Effect", imageFile: "Lucelunare Regina Pantera.png", text: "\"Lunalight Crescent Dancer\" + 1 \"Lunalight\" monster\nThis card can attack up to 3 monsters your opponent controls, once each, during each Battle Phase. If this card would be destroyed by a card effect, you can destroy 1 other \"Lunalight\" monster you control instead." }),
]);

const runtime = (cardId, name, type, level, attribute, race, attack, defense, script) => ({
  id: cardId,
  name,
  sourceName: name,
  passcode: cardId,
  runtimeCode: cardId,
  historicalOverride: true,
  script,
});

export const LUCELUNARE_OCGCORE_CARD_ENTRIES = Object.freeze([
  runtime(990000003, "Lunalight Lunar Priestess", 0x11, 4, 32, 32768, 1400, 900, "c990000003.lua"),
  runtime(990000021, "Lunalight White Trickster", 0x21, 2, 16, 32768, 800, 800, "c990000021.lua"),
  runtime(990000022, "Lunalight Shadow Sheep", 0x21, 2, 32, 32768, 500, 500, "c990000022.lua"),
  runtime(990000041, "Lunalight Essence", 0x02, 0, 0, 0, 0, 0, "c990000041.lua"),
  runtime(990000054, "Lunalight Assault", 0x20004, 0, 0, 0, 0, 0, "c990000054.lua"),
  runtime(990000034, "Lunalight Crescent Dancer", 0x61, 7, 32, 32768, 2200, 1800, "c990000034.lua"),
  runtime(990000035, "Lunalight Panther Queen", 0x61, 8, 32, 32768, 2800, 2500, "c990000035.lua"),
]);

export const LUCELUNARE_OCGCORE_CARD_DATA = Object.freeze(Object.fromEntries([
  [990000003, { code: 990000003, alias: 0, setcodes: [SET_LUNALIGHT], type: 0x11, level: 4, attribute: 32, race: 32768, attack: 1400, defense: 900, lscale: 0, rscale: 0, link_marker: 0 }],
  [990000021, { code: 990000021, alias: 0, setcodes: [SET_LUNALIGHT], type: 0x21, level: 2, attribute: 16, race: 32768, attack: 800, defense: 800, lscale: 0, rscale: 0, link_marker: 0 }],
  [990000022, { code: 990000022, alias: 0, setcodes: [SET_LUNALIGHT], type: 0x21, level: 2, attribute: 32, race: 32768, attack: 500, defense: 500, lscale: 0, rscale: 0, link_marker: 0 }],
  [990000041, { code: 990000041, alias: 0, setcodes: [], type: 0x02, level: 0, attribute: 0, race: 0, attack: 0, defense: 0, lscale: 0, rscale: 0, link_marker: 0 }],
  [990000054, { code: 990000054, alias: 0, setcodes: [], type: 0x20004, level: 0, attribute: 0, race: 0, attack: 0, defense: 0, lscale: 0, rscale: 0, link_marker: 0 }],
  [990000034, { code: 990000034, alias: 0, setcodes: [SET_LUNALIGHT], type: 0x61, level: 7, attribute: 32, race: 32768, attack: 2200, defense: 1800, lscale: 0, rscale: 0, link_marker: 0 }],
  [990000035, { code: 990000035, alias: 0, setcodes: [SET_LUNALIGHT], type: 0x61, level: 8, attribute: 32, race: 32768, attack: 2800, defense: 2500, lscale: 0, rscale: 0, link_marker: 0 }],
]));

export const LUCELUNARE_OCGCORE_SCRIPT_SOURCES = Object.freeze({
  "c990000003.lua": `local s,id=GetID()
function s.initial_effect(c)
end`,
  "c990000021.lua": `local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetDescription(aux.Stringid(id,0))
  e1:SetCategory(CATEGORY_TOHAND)
  e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_FLIP+EFFECT_TYPE_TRIGGER_F)
  e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
  e1:SetCode(EVENT_FLIP)
  e1:SetTarget(s.target)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
function s.filter(c)
  return c:IsSpellTrap() and c:IsAbleToHand()
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  if chkc then return chkc:IsOnField() and s.filter(chkc) end
  if chk==0 then return Duel.IsExistingTarget(s.filter,tp,LOCATION_ONFIELD,LOCATION_ONFIELD,1,nil) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_RTOHAND)
  local g=Duel.SelectTarget(tp,s.filter,tp,LOCATION_ONFIELD,LOCATION_ONFIELD,1,1,nil)
  Duel.SetOperationInfo(0,CATEGORY_TOHAND,g,1,0,0)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  local tc=Duel.GetFirstTarget()
  if tc and tc:IsRelateToEffect(e) then Duel.SendtoHand(tc,nil,REASON_EFFECT) end
end`,
  "c990000022.lua": `local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetDescription(aux.Stringid(id,0))
  e1:SetCategory(CATEGORY_TOHAND)
  e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)
  e1:SetProperty(EFFECT_FLAG_DELAY)
  e1:SetCode(EVENT_BE_MATERIAL)
  e1:SetCondition(function(e,tp,eg,ep,ev,re,r,rp) return e:GetHandler():IsLocation(LOCATION_GRAVE) and (r&REASON_FUSION)~=0 end)
  e1:SetTarget(s.target)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return e:GetHandler():IsAbleToHand() end
  Duel.SetOperationInfo(0,CATEGORY_TOHAND,e:GetHandler(),1,0,0)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  if c:IsRelateToEffect(e) then Duel.SendtoHand(c,nil,REASON_EFFECT) end
end`,
  "c990000041.lua": `local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetDescription(aux.Stringid(id,0))
  e1:SetCategory(CATEGORY_SPECIAL_SUMMON+CATEGORY_ATKCHANGE)
  e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetCode(EVENT_FREE_CHAIN)
  e1:SetTarget(s.target)
  e1:SetOperation(s.activate)
  c:RegisterEffect(e1)
end
s.listed_series={SET_LUNALIGHT}
function s.filter(c,e,tp)
  return c:IsSetCard(SET_LUNALIGHT) and c:IsMonster() and c:IsCanBeSpecialSummoned(e,0,tp,false,false,POS_FACEUP)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  if chkc then return chkc:IsLocation(LOCATION_GRAVE) and chkc:IsControler(tp) and s.filter(chkc,e,tp) end
  if chk==0 then return Duel.GetLocationCount(tp,LOCATION_MZONE)>0 and Duel.IsExistingTarget(s.filter,tp,LOCATION_GRAVE,0,1,nil,e,tp) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_SPSUMMON)
  local g=Duel.SelectTarget(tp,s.filter,tp,LOCATION_GRAVE,0,1,1,nil,e,tp)
  Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,g,1,0,0)
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
  local tc=Duel.GetFirstTarget()
  if tc and tc:IsRelateToEffect(e) and Duel.SpecialSummon(tc,0,tp,tp,false,false,POS_FACEUP)>0 then
    local e1=Effect.CreateEffect(e:GetHandler())
    e1:SetType(EFFECT_TYPE_SINGLE)
    e1:SetCode(EFFECT_UPDATE_ATTACK)
    e1:SetValue(-400)
    e1:SetReset(RESETS_STANDARD)
    tc:RegisterEffect(e1)
    local e2=e1:Clone()
    e2:SetCode(EFFECT_UPDATE_DEFENSE)
    tc:RegisterEffect(e2)
  end
end`,
  "c990000054.lua": `local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetDescription(aux.Stringid(id,0))
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetCode(EVENT_FREE_CHAIN)
  c:RegisterEffect(e1)
  local e2=Effect.CreateEffect(c)
  e2:SetType(EFFECT_TYPE_FIELD)
  e2:SetRange(LOCATION_SZONE)
  e2:SetTargetRange(LOCATION_MZONE,0)
  e2:SetCode(EFFECT_UPDATE_ATTACK)
  e2:SetCondition(s.condition)
  e2:SetTarget(s.target)
  e2:SetValue(500)
  c:RegisterEffect(e2)
  local e3=e2:Clone()
  e3:SetCode(EFFECT_UPDATE_DEFENSE)
  c:RegisterEffect(e3)
end
s.listed_series={SET_LUNALIGHT}
function s.condition(e,tp,eg,ep,ev,re,r,rp)
  return not Duel.IsTurnPlayer(e:GetHandlerPlayer()) and Duel.IsBattlePhase()
end
function s.target(e,c)
  return c:IsFaceup() and c:IsSetCard(SET_LUNALIGHT)
end`,
  "c990000034.lua": `local s,id=GetID()
function s.initial_effect(c)
  Fusion.AddProcMix(c,false,true,s.substitute_or_lunalight,s.lunalight_material)
  c:EnableReviveLimit()
  local e1=Effect.CreateEffect(c)
  e1:SetType(EFFECT_TYPE_SINGLE)
  e1:SetCode(EFFECT_EXTRA_ATTACK_MONSTER)
  e1:SetValue(2)
  c:RegisterEffect(e1)
  local e2=Effect.CreateEffect(c)
  e2:SetType(EFFECT_TYPE_SINGLE)
  e2:SetCode(EFFECT_CANNOT_SELECT_BATTLE_TARGET)
  e2:SetValue(s.atlimit)
  c:RegisterEffect(e2)
  local e3=Effect.CreateEffect(c)
  e3:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_CONTINUOUS)
  e3:SetCode(EVENT_ATTACK_ANNOUNCE)
  e3:SetOperation(s.attackop)
  c:RegisterEffect(e3)
end
s.listed_series={SET_LUNALIGHT}
s.material_setcode=SET_LUNALIGHT
function s.lunalight_material(c)
  return c:IsSetCard(SET_LUNALIGHT)
end
function s.substitute_or_lunalight(c,fc)
  return c:IsSetCard(SET_LUNALIGHT) or c:CheckFusionSubstitute(fc)
end
function s.wasattacked(c,fid)
  for _,label in ipairs({c:GetFlagEffectLabel(id)}) do
    if label==fid then return true end
  end
  return false
end
function s.atlimit(e,c)
  return s.wasattacked(c,e:GetHandler():GetFieldID())
end
function s.attackop(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  local tc=Duel.GetAttackTarget()
  if c==Duel.GetAttacker() and tc then
    tc:RegisterFlagEffect(id,RESET_PHASE|PHASE_BATTLE,0,1,c:GetFieldID())
  end
end`,
  "c990000035.lua": `local s,id=GetID()
local CRESCENT_DANCER=990000034
function s.initial_effect(c)
  Fusion.AddProcMix(c,true,true,CRESCENT_DANCER,aux.FilterBoolFunctionEx(Card.IsSetCard,SET_LUNALIGHT))
  c:EnableReviveLimit()
  local e1=Effect.CreateEffect(c)
  e1:SetType(EFFECT_TYPE_SINGLE)
  e1:SetCode(EFFECT_EXTRA_ATTACK_MONSTER)
  e1:SetValue(2)
  c:RegisterEffect(e1)
  local e2=Effect.CreateEffect(c)
  e2:SetType(EFFECT_TYPE_SINGLE)
  e2:SetCode(EFFECT_CANNOT_SELECT_BATTLE_TARGET)
  e2:SetValue(s.atlimit)
  c:RegisterEffect(e2)
  local e3=Effect.CreateEffect(c)
  e3:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_CONTINUOUS)
  e3:SetCode(EVENT_ATTACK_ANNOUNCE)
  e3:SetOperation(s.attackop)
  c:RegisterEffect(e3)
  local e4=Effect.CreateEffect(c)
  e4:SetType(EFFECT_TYPE_CONTINUOUS+EFFECT_TYPE_SINGLE)
  e4:SetProperty(EFFECT_FLAG_SINGLE_RANGE)
  e4:SetRange(LOCATION_MZONE)
  e4:SetCode(EFFECT_DESTROY_REPLACE)
  e4:SetTarget(s.desreptg)
  e4:SetOperation(s.desrepop)
  c:RegisterEffect(e4)
end
s.listed_series={SET_LUNALIGHT}
s.listed_names={CRESCENT_DANCER}
s.material_setcode=SET_LUNALIGHT
function s.wasattacked(c,fid)
  for _,label in ipairs({c:GetFlagEffectLabel(id)}) do
    if label==fid then return true end
  end
  return false
end
function s.atlimit(e,c)
  return s.wasattacked(c,e:GetHandler():GetFieldID())
end
function s.attackop(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  local tc=Duel.GetAttackTarget()
  if c==Duel.GetAttacker() and tc then
    tc:RegisterFlagEffect(id,RESET_PHASE|PHASE_BATTLE,0,1,c:GetFieldID())
  end
end
function s.repfilter(c,e,tp)
  return c:IsControler(tp) and c:IsSetCard(SET_LUNALIGHT) and c:IsDestructable(e) and not c:IsStatus(STATUS_DESTROY_CONFIRMED|STATUS_BATTLE_DESTROYED)
end
function s.desreptg(e,tp,eg,ep,ev,re,r,rp,chk)
  local c=e:GetHandler()
  if chk==0 then return c:IsReason(REASON_EFFECT) and not c:IsReason(REASON_REPLACE) and Duel.IsExistingMatchingCard(s.repfilter,tp,LOCATION_MZONE,0,1,c,e,tp) end
  if Duel.SelectEffectYesNo(tp,c,96) then
    Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_DESREPLACE)
    local tc=Duel.SelectMatchingCard(tp,s.repfilter,tp,LOCATION_MZONE,0,1,1,c,e,tp):GetFirst()
    e:SetLabelObject(tc)
    tc:SetStatus(STATUS_DESTROY_CONFIRMED,true)
    return true
  end
  return false
end
function s.desrepop(e,tp,eg,ep,ev,re,r,rp)
  local tc=e:GetLabelObject()
  if tc then
    tc:SetStatus(STATUS_DESTROY_CONFIRMED,false)
    Duel.Destroy(tc,REASON_EFFECT|REASON_REPLACE)
  end
end`,
});
