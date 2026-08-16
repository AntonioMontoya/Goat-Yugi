// Small, explicit GOAT-era corrections layered over the upstream script set.
// Keep these separate from generated vendor data so a refresh never erases a
// ruling correction. The CSV text is the source of truth for these overrides.
export const HISTORICAL_SCRIPT_OVERRIDES = Object.freeze({
  "c97077563.lua": `-- GOAT Format correction: Call of the Haunted
-- A Fusion Monster that completed its Fusion procedure may be revived from
-- the Graveyard. Monsters summoned directly from the Extra Deck by an effect
-- (for example Metamorphosis or Summoner of Illusions) do not have that flag.
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetDescription(aux.Stringid(id,0))
  e1:SetCategory(CATEGORY_SPECIAL_SUMMON)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
  e1:SetCode(EVENT_FREE_CHAIN)
  e1:SetTarget(s.target)
  e1:SetOperation(s.activate)
  e1:SetHintTiming(0,TIMING_STANDBY_PHASE|TIMING_MAIN_END|TIMINGS_CHECK_MONSTER_E)
  c:RegisterEffect(e1)
  local e2=Effect.CreateEffect(c)
  e2:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_CONTINUOUS)
  e2:SetProperty(EFFECT_FLAG_CANNOT_DISABLE)
  e2:SetCode(EVENT_LEAVE_FIELD_P)
  e2:SetOperation(function(e) e:SetLabel(e:GetHandler():IsDisabled() and 1 or 0) end)
  c:RegisterEffect(e2)
  local e3=Effect.CreateEffect(c)
  e3:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_CONTINUOUS)
  e3:SetCode(EVENT_LEAVE_FIELD)
  e3:SetOperation(s.mondesop)
  e3:SetLabelObject(e0)
  c:RegisterEffect(e3)
  local e4=Effect.CreateEffect(c)
  e4:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
  e4:SetCode(EVENT_LEAVE_FIELD)
  e4:SetRange(LOCATION_SZONE)
  e4:SetCondition(s.selfdescon)
  e4:SetOperation(function(e) Duel.Destroy(e:GetHandler(),REASON_EFFECT) end)
  c:RegisterEffect(e4)
end
function s.spfilter(c,e,tp)
  return c:IsCanBeSpecialSummoned(e,0,tp,false,false,POS_FACEUP_ATTACK)
    or (c:IsType(TYPE_FUSION) and c:IsStatus(STATUS_PROC_COMPLETE)
      and c:IsCanBeSpecialSummoned(e,0,tp,true,false,POS_FACEUP_ATTACK))
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  if chkc then return chkc:IsControler(tp) and chkc:IsLocation(LOCATION_GRAVE) and s.spfilter(chkc,e,tp) end
  if chk==0 then return Duel.GetLocationCount(tp,LOCATION_MZONE)>0
    and Duel.IsExistingTarget(s.spfilter,tp,LOCATION_GRAVE,0,1,nil,e,tp) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_SPSUMMON)
  local g=Duel.SelectTarget(tp,s.spfilter,tp,LOCATION_GRAVE,0,1,1,nil,e,tp)
  Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,g,1,tp,0)
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  local tc=Duel.GetFirstTarget()
  if tc:IsRelateToEffect(e) and Duel.SpecialSummonStep(tc,0,tp,tp,false,false,POS_FACEUP_ATTACK)
    and c:IsRelateToEffect(e) then
    c:SetCardTarget(tc)
  end
  Duel.SpecialSummonComplete()
end
function s.mondesop(e,tp,eg,ep,ev,re,r,rp)
  if e:GetLabelObject():GetLabel()~=0 then return end
  local tc=e:GetHandler():GetFirstCardTarget()
  if tc and tc:IsLocation(LOCATION_MZONE) then Duel.Destroy(tc,REASON_EFFECT) end
end
function s.selfdescon(e,tp,eg,ep,ev,re,r,rp)
  local tc=e:GetHandler():GetFirstCardTarget()
  return tc and eg:IsContains(tc) and tc:IsReason(REASON_DESTROY)
end`,
  "c8131171.lua": `-- GOAT Format override: Sinister Serpent
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetDescription(aux.Stringid(id,0))
  e1:SetCategory(CATEGORY_TOHAND)
  e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_O)
  e1:SetCode(EVENT_PHASE+PHASE_STANDBY)
  e1:SetRange(LOCATION_GRAVE)
  e1:SetCountLimit(1,id)
  e1:SetCondition(function(_,tp) return Duel.IsTurnPlayer(tp) end)
  e1:SetTarget(s.target)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return e:GetHandler():IsAbleToHand() end
  Duel.SetOperationInfo(0,CATEGORY_TOHAND,e:GetHandler(),1,tp,0)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  if c:IsRelateToEffect(e) then Duel.SendtoHand(c,nil,REASON_EFFECT) end
end`,
  "c504700151.lua": `-- GOAT Format correction: Firebird
-- The imported GOAT script omitted tp in its battle-destruction filter call.
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetDescription(aux.Stringid(id,0))
  e1:SetCategory(CATEGORY_ATKCHANGE)
  e1:SetType(EFFECT_TYPE_TRIGGER_F+EFFECT_TYPE_FIELD)
  e1:SetCode(EVENT_DESTROYED)
  e1:SetRange(LOCATION_MZONE)
  e1:SetCondition(s.atkcon)
  e1:SetTarget(s.atktg)
  e1:SetOperation(s.atkop)
  c:RegisterEffect(e1)
  local e2=e1:Clone()
  e2:SetCode(EVENT_BATTLED)
  e2:SetCondition(s.atkcon2)
  c:RegisterEffect(e2)
end
function s.cfilter(c,tp)
  return not c:IsReason(REASON_BATTLE) and c:IsPreviousControler(tp)
    and c:IsPreviousLocation(LOCATION_MZONE) and c:IsPreviousPosition(POS_FACEUP)
    and (c:GetPreviousRaceOnField()&RACE_WINGEDBEAST)~=0
end
function s.atkcon(e,tp,eg,ep,ev,re,r,rp)
  return eg:IsExists(s.cfilter,1,nil,tp)
end
function s.cfilter2(c,tp)
  return c and c:IsLocation(LOCATION_MZONE) and c:IsPosition(POS_FACEUP)
    and c:IsControler(tp) and c:IsRace(RACE_WINGEDBEAST) and c:IsBattleDestroyed()
end
function s.atkcon2(e,tp,eg,ep,ev,re,r,rp)
  return s.cfilter2(Duel.GetAttacker(),tp) or s.cfilter2(Duel.GetAttackTarget(),tp)
end
function s.atktg(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return e:GetHandler():IsRelateToEffect(e) and e:GetHandler():IsFaceup() end
end
function s.atkop(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  if c:IsFaceup() and c:IsRelateToEffect(e) then
    local e1=Effect.CreateEffect(c)
    e1:SetType(EFFECT_TYPE_SINGLE)
    e1:SetProperty(EFFECT_FLAG_COPY_INHERIT)
    e1:SetCode(EFFECT_UPDATE_ATTACK)
    e1:SetReset(RESET_EVENT+RESETS_STANDARD)
    e1:SetValue(500)
    c:RegisterEffect(e1)
  end
end`,
  "c85802526.lua": `-- GOAT Format override: Cure Mermaid
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_RECOVER)
  e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_O)
  e1:SetCode(EVENT_PHASE+PHASE_STANDBY)
  e1:SetRange(LOCATION_MZONE)
  e1:SetCountLimit(1,id)
  e1:SetCondition(function(e,tp) return Duel.IsTurnPlayer(tp) end)
  e1:SetTarget(s.target)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return Duel.GetLP(tp)>0 end
  Duel.SetOperationInfo(0,CATEGORY_RECOVER,nil,0,tp,800)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  Duel.Recover(tp,800,REASON_EFFECT)
end`,
  "c54415063.lua": `-- GOAT Format override: Harpie Lady 3
-- The attack lock must survive both of the opponent's next turns.  The
-- vendor reset used PHASE_END and expired after only one self turn.
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_CONTINUOUS)
  e1:SetCode(EVENT_BATTLED)
  e1:SetRange(LOCATION_MZONE)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
s.listed_names={CARD_HARPIE_LADY}
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  local bc=c:GetBattleTarget()
  if not bc then return end
  local e1=Effect.CreateEffect(c)
  e1:SetType(EFFECT_TYPE_SINGLE)
  e1:SetCode(EFFECT_CANNOT_ATTACK_ANNOUNCE)
  e1:SetReset(RESETS_STANDARD_PHASE_END|RESET_SELF_TURN,3)
  bc:RegisterEffect(e1)
end`,
  "c21297224.lua": `-- GOAT Format override: Hysteric Fairy
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_RECOVER)
  e1:SetType(EFFECT_TYPE_IGNITION)
  e1:SetRange(LOCATION_MZONE)
  e1:SetCost(s.cost)
  e1:SetTarget(s.target)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
function s.cost(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return Duel.CheckReleaseGroup(tp,s.releasefilter,2,nil,e) end
  local g=Duel.SelectReleaseGroup(tp,s.releasefilter,2,2,nil,e)
  Duel.Release(g,REASON_COST)
end
function s.releasefilter(c,e) return c:IsFaceup() and c~=e:GetHandler() end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return Duel.GetLP(tp)>0 end
  Duel.SetOperationInfo(0,CATEGORY_RECOVER,nil,0,tp,1000)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  Duel.Recover(tp,1000,REASON_EFFECT)
end`,
  "c12953226.lua": `-- GOAT Format override: Nuvia the Wicked
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)
  e1:SetCode(EVENT_SUMMON_SUCCESS)
  e1:SetCondition(function(e) return e:GetHandler():IsSummonType(SUMMON_TYPE_NORMAL) end)
  e1:SetOperation(function(e,_,_,_,_,_,_,_) Duel.Destroy(e:GetHandler(),REASON_EFFECT) end)
  c:RegisterEffect(e1)
  local e2=Effect.CreateEffect(c)
  e2:SetType(EFFECT_TYPE_SINGLE)
  e2:SetProperty(EFFECT_FLAG_SINGLE_RANGE)
  e2:SetRange(LOCATION_MZONE)
  e2:SetCode(EFFECT_UPDATE_ATTACK)
  e2:SetValue(s.value)
  c:RegisterEffect(e2)
end
function s.value(e,c)
  return -200*Duel.GetMatchingGroupCount(aux.TRUE,1-c:GetControler(),LOCATION_MZONE,0,nil)
end`,
  "c84080938.lua": `-- GOAT Format override: The Forgiving Maiden
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_TOHAND)
  e1:SetType(EFFECT_TYPE_IGNITION)
  e1:SetRange(LOCATION_MZONE)
  e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
  e1:SetCost(Cost.SelfTribute)
  e1:SetTarget(s.target)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
function s.filter(c,e,tp)
  return c:IsPreviousControler(tp) and c:IsPreviousLocation(LOCATION_MZONE)
    and c:IsReason(REASON_BATTLE) and c:IsAbleToHand()
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  if chkc then return chkc:IsLocation(LOCATION_GRAVE) and s.filter(chkc,e,tp) end
  if chk==0 then return Duel.IsExistingTarget(s.filter,tp,LOCATION_GRAVE,0,1,nil,e,tp) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_RTOHAND)
  local g=Duel.SelectTarget(tp,s.filter,tp,LOCATION_GRAVE,0,1,1,nil,e,tp)
  Duel.SetOperationInfo(0,CATEGORY_TOHAND,g,1,0,0)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  local tc=Duel.GetFirstTarget()
  if tc:IsRelateToEffect(e) then Duel.SendtoHand(tc,nil,REASON_EFFECT) end
end`,
  "c21597117.lua": `-- GOAT Format override: A Hero Emerges
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_SPECIAL_SUMMON+CATEGORY_TOGRAVE)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetCode(EVENT_ATTACK_ANNOUNCE)
  e1:SetCondition(function(e,tp) return Duel.IsTurnPlayer(1-tp) end)
  e1:SetTarget(s.target)
  e1:SetOperation(s.activate)
  c:RegisterEffect(e1)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return Duel.GetLocationCount(tp,LOCATION_MZONE)>0
    and Duel.IsExistingMatchingCard(aux.TRUE,tp,LOCATION_HAND,0,1,nil) end
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
  if Duel.GetLocationCount(tp,LOCATION_MZONE)<=0 then return end
  local g=Duel.GetFieldGroup(tp,LOCATION_HAND,0)
  local sg=g:RandomSelect(1-tp,1)
  local tc=sg:GetFirst()
  if not tc then return end
  Duel.ConfirmCards(1-tp,tc)
  if tc:IsCanBeSpecialSummoned(e,0,tp,false,false) then
    Duel.SpecialSummon(tc,0,tp,tp,false,false,POS_FACEUP)
  else
    Duel.SendtoGrave(tc,REASON_EFFECT)
  end
end`,
  "c303660.lua": `-- GOAT Format override: Amplifier
local s,id=GetID()
function s.initial_effect(c)
  local e0=Effect.CreateEffect(c)
  e0:SetCategory(CATEGORY_EQUIP)
  e0:SetType(EFFECT_TYPE_ACTIVATE)
  e0:SetProperty(EFFECT_FLAG_CARD_TARGET+EFFECT_FLAG_CANNOT_INACTIVATE+EFFECT_FLAG_CANNOT_DISABLE+EFFECT_FLAG_CANNOT_NEGATE)
  e0:SetCode(EVENT_FREE_CHAIN)
  e0:SetTarget(s.eqtg)
  e0:SetOperation(s.eqop)
  c:RegisterEffect(e0)
  local e1=Effect.CreateEffect(c)
  e1:SetType(EFFECT_TYPE_FIELD)
  e1:SetCode(EFFECT_IMMUNE_EFFECT)
  e1:SetProperty(EFFECT_FLAG_SET_AVAILABLE)
  e1:SetRange(LOCATION_SZONE)
  e1:SetTargetRange(LOCATION_ONFIELD,LOCATION_ONFIELD)
  e1:SetTarget(s.etarget)
  e1:SetValue(s.efilter)
  c:RegisterEffect(e1)
  local e2=Effect.CreateEffect(c)
  e2:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
  e2:SetCode(EVENT_LEAVE_FIELD_P)
  e2:SetRange(LOCATION_SZONE)
  e2:SetOperation(function(e) e:SetLabelObject(e:GetHandler():GetEquipTarget()) end)
  c:RegisterEffect(e2)
  local e3=Effect.CreateEffect(c)
  e3:SetType(EFFECT_TYPE_CONTINUOUS+EFFECT_TYPE_SINGLE)
  e3:SetCode(EVENT_LEAVE_FIELD)
  e3:SetLabelObject(e2)
  e3:SetOperation(s.desop)
  c:RegisterEffect(e3)
  local e4=Effect.CreateEffect(c)
  e4:SetType(EFFECT_TYPE_SINGLE)
  e4:SetCode(EFFECT_CANNOT_DISABLE)
  c:RegisterEffect(e4)
end
s.listed_names={CARD_JINZO}
function s.eqtg(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  if chkc then return chkc:IsLocation(LOCATION_MZONE) and chkc:IsFaceup() and chkc:IsCode(CARD_JINZO) end
  if chk==0 then return Duel.GetLocationCount(tp,LOCATION_SZONE)>0 and Duel.IsExistingTarget(Card.IsCode,tp,LOCATION_MZONE,LOCATION_MZONE,1,nil,CARD_JINZO) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_EQUIP)
  local g=Duel.SelectTarget(tp,Card.IsCode,tp,LOCATION_MZONE,LOCATION_MZONE,1,1,nil,CARD_JINZO)
  Duel.SetOperationInfo(0,CATEGORY_EQUIP,e:GetHandler(),1,tp,0)
end
function s.eqop(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  local tc=Duel.GetFirstTarget()
  if c:IsRelateToEffect(e) and tc and tc:IsFaceup() and tc:IsRelateToEffect(e) and Duel.Equip(tp,c,tc) then
    c:SetCardTarget(tc)
    e:SetLabelObject(tc)
    local e1=Effect.CreateEffect(c)
    e1:SetType(EFFECT_TYPE_SINGLE)
    e1:SetProperty(EFFECT_FLAG_CANNOT_DISABLE)
    e1:SetCode(EFFECT_EQUIP_LIMIT)
    e1:SetValue(function(_,card) return card==tc end)
    e1:SetReset(RESET_EVENT|RESETS_STANDARD)
    c:RegisterEffect(e1)
  end
end
function s.etarget(e,c)
  local ec=e:GetHandler():GetEquipTarget()
  return c:IsTrap() and ec and c:GetControler()==ec:GetControler()
end
function s.efilter(e,re)
  return re:GetHandler()==e:GetHandler():GetEquipTarget()
end
function s.desop(e,tp,eg,ep,ev,re,r,rp)
  local tc=e:GetHandler():GetEquipTarget()
  if not tc and e:GetLabelObject() then tc=e:GetLabelObject():GetLabelObject() end
  if not tc then tc=e:GetHandler():GetFirstCardTarget() end
  if tc and tc:IsLocation(LOCATION_MZONE) then Duel.Destroy(tc,REASON_EFFECT) end
end`,
  "c17092736.lua": `-- GOAT Format override: Ancient Telescope
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetCode(EVENT_FREE_CHAIN)
  e1:SetTarget(s.target)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return Duel.GetFieldGroupCount(tp,0,LOCATION_DECK)>0 end
  Duel.SetTargetPlayer(tp)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  local p=Duel.GetChainInfo(0,CHAININFO_TARGET_PLAYER)
  local ct=math.min(5,Duel.GetFieldGroupCount(p,0,LOCATION_DECK))
  if ct>0 then Duel.ConfirmCards(p,Duel.GetDecktopGroup(1-p,ct)) end
end`,
  "c48539234.lua": `-- GOAT Format override: Appropriate
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_DRAW)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetCode(EVENT_DRAW)
  e1:SetCondition(s.condition)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
  local e2=Effect.CreateEffect(c)
  e2:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
  e2:SetProperty(EFFECT_FLAG_DELAY)
  e2:SetRange(LOCATION_SZONE)
  e2:SetCode(EVENT_DRAW)
  e2:SetCondition(s.condition)
  e2:SetOperation(s.operation)
  c:RegisterEffect(e2)
end
function s.condition(e,tp,eg,ep,ev,re,r,rp)
  return ep~=tp and Duel.GetCurrentPhase()~=PHASE_DRAW
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  Duel.Hint(HINT_CARD,0,id)
  Duel.Draw(tp,2,REASON_EFFECT)
end`,
  "c504700072.lua": `-- GOAT Format override: Castle Walls
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_DEFCHANGE)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetProperty(EFFECT_FLAG_CARD_TARGET+EFFECT_FLAG_DAMAGE_CAL)
  e1:SetCode(EVENT_FREE_CHAIN)
  e1:SetHintTiming(TIMING_DAMAGE_STEP)
  e1:SetCondition(function() return Duel.GetCurrentPhase()~=PHASE_DAMAGE or not Duel.IsDamageCalculated() end)
  e1:SetTarget(s.target)
  e1:SetOperation(s.activate)
  c:RegisterEffect(e1)
end
function s.filter(c) return c:IsFaceup() end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  if chkc then return chkc:IsLocation(LOCATION_MZONE) and s.filter(chkc) end
  if chk==0 then return Duel.IsExistingTarget(s.filter,tp,LOCATION_MZONE,LOCATION_MZONE,1,nil) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_FACEUP)
  Duel.SelectTarget(tp,s.filter,tp,LOCATION_MZONE,LOCATION_MZONE,1,1,nil)
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
  local tc=Duel.GetFirstTarget()
  if tc and tc:IsRelateToEffect(e) and tc:IsFaceup() then
    local e1=Effect.CreateEffect(e:GetHandler())
    e1:SetType(EFFECT_TYPE_SINGLE)
    e1:SetCode(EFFECT_UPDATE_DEFENSE)
    e1:SetReset(RESET_EVENT|RESETS_STANDARD|RESET_PHASE|PHASE_END)
    e1:SetValue(500)
    tc:RegisterEffect(e1)
  end
end`,
  "c504700110.lua": `-- GOAT Format override: Continuous Destruction Punch
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetCode(EVENT_FREE_CHAIN)
  c:RegisterEffect(e1)
  local e2=Effect.CreateEffect(c)
  e2:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
  e2:SetCode(EVENT_DAMAGE_STEP_END)
  e2:SetRange(LOCATION_SZONE)
  e2:SetCondition(s.descon)
  e2:SetOperation(s.desop)
  c:RegisterEffect(e2)
end
function s.descon(e,tp,eg,ep,ev,re,r,rp)
  local a=Duel.GetAttacker()
  local at=Duel.GetAttackTarget()
  return at and a and a:IsControler(1-tp) and a:IsRelateToBattle()
    and at:IsDefensePos() and at:IsRelateToBattle() and a:GetAttack()<at:GetDefense()
end
function s.desop(e,tp,eg,ep,ev,re,r,rp)
  local a=Duel.GetAttacker()
  if a and a:IsRelateToBattle() then Duel.Destroy(a,REASON_EFFECT) end
end`,
  "c504700127.lua": `-- GOAT Format override: Covering Fire
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_ATKCHANGE)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetProperty(EFFECT_FLAG_CARD_TARGET+EFFECT_FLAG_DAMAGE_STEP)
  e1:SetCode(EVENT_FREE_CHAIN)
  e1:SetHintTiming(TIMING_DAMAGE_STEP)
  e1:SetCondition(s.condition)
  e1:SetTarget(s.target)
  e1:SetOperation(s.activate)
  c:RegisterEffect(e1)
end
function s.condition(e,tp,eg,ep,ev,re,r,rp)
  local bc=Duel.GetAttackTarget()
  return Duel.IsPhase(PHASE_DAMAGE) and not Duel.IsDamageCalculated()
    and bc and bc:IsControler(tp) and bc:IsFaceup()
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  local bc=Duel.GetAttackTarget()
  if chkc then return chkc:IsLocation(LOCATION_MZONE) and chkc:IsControler(tp)
    and chkc:HasNonZeroAttack() and chkc~=bc end
  if chk==0 then return Duel.IsExistingTarget(Card.HasNonZeroAttack,tp,LOCATION_MZONE,0,1,bc) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_TARGET)
  Duel.SelectTarget(tp,Card.HasNonZeroAttack,tp,LOCATION_MZONE,0,1,1,bc)
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
  local tc=Duel.GetFirstTarget()
  local bc=Duel.GetAttackTarget()
  if bc and bc:IsFaceup() and bc:IsRelateToBattle() and tc and tc:IsRelateToEffect(e)
    and tc:IsFaceup() and tc:IsControler(tp) then
    local e1=Effect.CreateEffect(e:GetHandler())
    e1:SetType(EFFECT_TYPE_SINGLE)
    e1:SetProperty(EFFECT_FLAG_CANNOT_DISABLE)
    e1:SetCode(EFFECT_UPDATE_ATTACK)
    e1:SetValue(tc:GetAttack())
    e1:SetReset(RESET_EVENT|RESETS_STANDARD|RESET_PHASE|PHASE_DAMAGE_CAL)
    bc:RegisterEffect(e1)
  end
end`,
  "c40737112.lua": `-- GOAT Format override: Dark Magician of Chaos
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_TOHAND)
  e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)
  e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
  e1:SetCode(EVENT_SUMMON_SUCCESS)
  e1:SetTarget(s.thtg)
  e1:SetOperation(s.thop)
  c:RegisterEffect(e1)
  local e2=e1:Clone()
  e2:SetCode(EVENT_SPSUMMON_SUCCESS)
  c:RegisterEffect(e2)
  local e3=Effect.CreateEffect(c)
  e3:SetCategory(CATEGORY_REMOVE)
  e3:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)
  e3:SetCode(EVENT_BATTLED)
  e3:SetCondition(s.rmcon)
  e3:SetTarget(s.rmtg)
  e3:SetOperation(s.rmop)
  c:RegisterEffect(e3)
  local e4=Effect.CreateEffect(c)
  e4:SetType(EFFECT_TYPE_SINGLE)
  e4:SetProperty(EFFECT_FLAG_CANNOT_DISABLE)
  e4:SetCode(EFFECT_LEAVE_FIELD_REDIRECT)
  e4:SetCondition(function(e) return e:GetHandler():IsReason(REASON_EFFECT+REASON_BATTLE) end)
  e4:SetValue(LOCATION_REMOVED)
  c:RegisterEffect(e4)
end
function s.thfilter(c) return c:IsSpell() and c:IsAbleToHand() end
function s.thtg(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  if chkc then return chkc:IsLocation(LOCATION_GRAVE) and chkc:IsControler(tp) and s.thfilter(chkc) end
  if chk==0 then return Duel.IsExistingTarget(s.thfilter,tp,LOCATION_GRAVE,0,1,nil) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_ATOHAND)
  local g=Duel.SelectTarget(tp,s.thfilter,tp,LOCATION_GRAVE,0,1,1,nil)
  Duel.SetOperationInfo(0,CATEGORY_TOHAND,g,1,tp,0)
end
function s.thop(e,tp,eg,ep,ev,re,r,rp)
  local tc=Duel.GetFirstTarget()
  if tc and tc:IsRelateToEffect(e) then Duel.SendtoHand(tc,nil,REASON_EFFECT) end
end
function s.rmcon(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  local bc=c:GetBattleTarget()
  e:SetLabelObject(bc)
  return bc and bc:IsStatus(STATUS_BATTLE_DESTROYED) and c:IsStatus(STATUS_OPPO_BATTLE)
end
function s.rmtg(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return true end
  Duel.SetOperationInfo(0,CATEGORY_REMOVE,e:GetLabelObject(),1,0,0)
end
function s.rmop(e,tp,eg,ep,ev,re,r,rp)
  local bc=e:GetLabelObject()
  if bc and bc:IsRelateToEffect(e) then Duel.Remove(bc,POS_FACEUP,REASON_EFFECT) end
end`,
  "c53982768.lua": `-- GOAT Format override: Dark Ruler Ha Des
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetProperty(EFFECT_FLAG_CANNOT_DISABLE+EFFECT_FLAG_UNCOPYABLE+EFFECT_FLAG_SINGLE_RANGE)
  e1:SetType(EFFECT_TYPE_SINGLE)
  e1:SetRange(LOCATION_GRAVE)
  e1:SetCode(EFFECT_SPSUMMON_CONDITION)
  e1:SetValue(aux.FALSE)
  c:RegisterEffect(e1)
  local e2=Effect.CreateEffect(c)
  e2:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
  e2:SetCode(EVENT_BATTLED)
  e2:SetRange(LOCATION_MZONE)
  e2:SetOperation(s.operation)
  c:RegisterEffect(e2)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  local a=Duel.GetAttacker()
  local d=Duel.GetAttackTarget()
  if not d then return end
  local p=e:GetHandler():GetControler()
  local tc=nil
  if a:IsControler(p) and a:IsRace(RACE_FIEND) and d:IsStatus(STATUS_BATTLE_DESTROYED) then tc=d
  elseif d:IsControler(p) and d:IsRace(RACE_FIEND) and a:IsStatus(STATUS_BATTLE_DESTROYED) then tc=a end
  if not tc then return end
  local e1=Effect.CreateEffect(e:GetHandler())
  e1:SetType(EFFECT_TYPE_SINGLE)
  e1:SetCode(EFFECT_DISABLE)
  e1:SetReset(RESET_EVENT|RESETS_STANDARD_EXC_GRAVE)
  tc:RegisterEffect(e1)
  local e2=e1:Clone()
  e2:SetCode(EFFECT_DISABLE_EFFECT)
  tc:RegisterEffect(e2)
end`,
  "c83555666.lua": `-- GOAT Format override: Ring of Destruction
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_DESTROY+CATEGORY_DAMAGE)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
  e1:SetCode(EVENT_FREE_CHAIN)
  e1:SetCountLimit(1,id,EFFECT_COUNT_CODE_OATH)
  e1:SetTarget(s.target)
  e1:SetOperation(s.activate)
  c:RegisterEffect(e1)
end
function s.filter(c) return c:IsFaceup() and c:IsAbleToGrave() end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  if chkc then return chkc:IsLocation(LOCATION_MZONE) and s.filter(chkc) end
  if chk==0 then return Duel.IsExistingTarget(s.filter,tp,LOCATION_MZONE,LOCATION_MZONE,1,nil) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_DESTROY)
  local g=Duel.SelectTarget(tp,s.filter,tp,LOCATION_MZONE,LOCATION_MZONE,1,1,nil)
  Duel.SetOperationInfo(0,CATEGORY_DESTROY,g,1,0,0)
  Duel.SetOperationInfo(0,CATEGORY_DAMAGE,nil,0,PLAYER_ALL,0)
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
  local tc=Duel.GetFirstTarget()
  if tc and tc:IsRelateToEffect(e) and Duel.Destroy(tc,REASON_EFFECT)~=0 then
    local atk=math.max(0,tc:GetTextAttack())
    Duel.Damage(tp,atk,REASON_EFFECT)
    Duel.Damage(1-tp,atk,REASON_EFFECT)
  end
end`,
  "c12580477.lua": `-- Auxiliary GOAT card: Raigeki (for Anti Raigeki regression)
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_DESTROY)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetCode(EVENT_FREE_CHAIN)
  e1:SetTarget(function(e,tp,eg,ep,ev,re,r,rp,chk) if chk==0 then return Duel.IsExistingMatchingCard(aux.TRUE,tp,0,LOCATION_MZONE,1,nil) end end)
  e1:SetOperation(function(e,tp) Duel.Destroy(Duel.GetMatchingGroup(aux.TRUE,tp,0,LOCATION_MZONE,nil),REASON_EFFECT) end)
  c:RegisterEffect(e1)
end`,
  "c83764718.lua": `-- Auxiliary GOAT card: Monster Reborn (for Call of the Grave regression)
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetCategory(CATEGORY_SPECIAL_SUMMON)
  e1:SetType(EFFECT_TYPE_ACTIVATE)
  e1:SetCode(EVENT_FREE_CHAIN)
  e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
  e1:SetTarget(s.target)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
function s.filter(c,e,tp) return c:IsMonster() and c:IsCanBeSpecialSummoned(e,0,tp,true,false) end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
  if chkc then return chkc:IsLocation(LOCATION_GRAVE) and s.filter(chkc,e,tp) end
  if chk==0 then return Duel.IsExistingTarget(s.filter,tp,LOCATION_GRAVE,LOCATION_GRAVE,1,nil,e,tp) end
  Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_SPSUMMON)
  local g=Duel.SelectTarget(tp,s.filter,tp,LOCATION_GRAVE,LOCATION_GRAVE,1,1,nil,e,tp)
  Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,g,1,0,0)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  local tc=Duel.GetFirstTarget()
  if tc and tc:IsRelateToEffect(e) then Duel.SpecialSummon(tc,0,tp,tp,true,false,POS_FACEUP) end
end`,
  "c59784896.lua": `-- GOAT Format override: Dark Zebra
local s,id=GetID()
function s.initial_effect(c)
  local e1=Effect.CreateEffect(c)
  e1:SetDescription(aux.Stringid(id,0))
  e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_F)
  e1:SetCategory(CATEGORY_POSITION)
  e1:SetCode(EVENT_PHASE|PHASE_STANDBY)
  e1:SetRange(LOCATION_MZONE)
  e1:SetCountLimit(1)
  e1:SetCondition(s.condition)
  e1:SetTarget(s.target)
  e1:SetOperation(s.operation)
  c:RegisterEffect(e1)
end
function s.condition(e,tp,eg,ep,ev,re,r,rp)
  return tp==Duel.GetTurnPlayer() and Duel.GetFieldGroupCount(tp,LOCATION_MZONE,0)==1
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return true end
  Duel.SetOperationInfo(0,CATEGORY_POSITION,e:GetHandler(),1,0,0)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
  local c=e:GetHandler()
  if c:IsRelateToEffect(e) and c:IsPosition(POS_FACEUP_ATTACK) and Duel.ChangePosition(c,POS_FACEUP_DEFENSE)~=0 then
    local e1=Effect.CreateEffect(c)
    e1:SetType(EFFECT_TYPE_SINGLE)
    e1:SetCode(EFFECT_CANNOT_CHANGE_POSITION)
    e1:SetProperty(EFFECT_FLAG_CANNOT_DISABLE+EFFECT_FLAG_COPY_INHERIT)
    e1:SetReset(RESETS_STANDARD_PHASE_END)
    c:RegisterEffect(e1)
  end
end`,
  "c23995346.lua": `-- Auxiliary GOAT card: Blue-Eyes Ultimate Dragon (tribute material)
local s,id=GetID()
function s.initial_effect(c)
  c:EnableReviveLimit()
end`,
});

export const HISTORICAL_SCRIPT_OVERRIDE_SOURCE = Object.freeze({
  provider: "GoatFormat CSV ruling override",
  cards: Object.keys(HISTORICAL_SCRIPT_OVERRIDES),
});
