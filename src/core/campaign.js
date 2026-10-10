import { STATS, integer, manualCharacter } from './rules.js';
import { safeParse, parseSceneBank, object } from './scenes.js';
import { validateLedger } from './ledger.js';
export const clone = value => structuredClone(value);
function validateNarrator(narrator) {
  if(narrator==null)return;
  if(!object(narrator)||narrator.mode!=='card'||typeof narrator.avatar!=='string'||!narrator.avatar||narrator.avatar.length>512)throw new Error('Invalid Dungeon Master card binding');
}
export function newCampaign(stats,method,bank,narrator=null) {
  if(method==='manual') manualCharacter(stats);
  else STATS.forEach(s=>integer(stats[s],-10,10,s));
  validateNarrator(narrator);
  return {schemaVersion:1,id:crypto.randomUUID(),revision:0,status:'awaitingDescription',character:{stats:clone(stats),method,description:''},
    narrator:clone(narrator),bank:parseSceneBank(JSON.stringify(bank)),history:[],actions:[],ledger:null,narrativeHint:null,objectiveTrack:null,pending:null,arc:null,palette:null,pressure:{chance:0,turns:0},criticalMargins:[],
    recentCues:[],recentCards:[],recentNotes:[],faded:{},repetition:{},rngAudit:[],operation:null,lastTurn:null,checkpoints:[],outbox:[]};
}
export function validateCampaign(c) {
  if(!object(c)||c.schemaVersion!==1) throw new Error('Unsupported campaign schema version');
  if(typeof c.id!=='string'||!c.id||!['awaitingDescription','idle','awaitingRoll','concluded'].includes(c.status)) throw new Error('Invalid campaign identity or status');
  integer(c.revision,0,Number.MAX_SAFE_INTEGER,'revision');
  if(!object(c.character)||typeof c.character.description!=='string') throw new Error('Invalid character');
  STATS.forEach(s=>integer(c.character.stats?.[s],-10,10,s));
  if(!['manual','rolled'].includes(c.character.method))throw new Error('Invalid character method');
  validateNarrator(c.narrator);
  if(c.ledger!=null)validateLedger(c.ledger);
  c.bank=parseSceneBank(JSON.stringify(c.bank));
  // Historical objectiveTrack is inert archival metadata, never an active transition contract.
  if(c.objectiveTrack!=null&&!object(c.objectiveTrack))throw Error('Invalid legacy tracker metadata');
  if(c.narrativeHint!=null&&(typeof c.narrativeHint!=='string'||c.narrativeHint.length>600))throw Error('Invalid narrative hint');
  for(const key of ['history','actions','criticalMargins','recentCues','recentCards','recentNotes','rngAudit','checkpoints','outbox']) if(!Array.isArray(c[key])) throw new Error('Invalid campaign '+key);
  if(c.actions.some(x=>typeof x!=='string')||c.history.some(x=>!object(x)||!['user','assistant','system'].includes(x.role)||typeof x.content!=='string')) throw new Error('Invalid history/actions');
  if(!object(c.pressure)||!object(c.faded)||!object(c.repetition)) throw new Error('Invalid campaign counters');
  integer(c.pressure.chance,0,100,'pressure'); integer(c.pressure.turns,0,Number.MAX_SAFE_INTEGER,'pressure turns');
  if(c.status!=='awaitingDescription'&&(!object(c.arc)||!Number.isInteger(c.arc.turn_budget)||c.arc.turn_budget<1||!Array.isArray(c.arc.movements)||!Array.isArray(c.arc.anchors))) throw new Error('Invalid story arc');
  if(c.arc) {
    integer(c.arc.turn_count,0,Number.MAX_SAFE_INTEGER,'arc turn count');
    integer(c.arc.turn_budget,1,200,'arc turn budget');
    for(const key of ['premise','pressure','possible_ending'])if(typeof c.arc[key]!=='string')throw new Error('Invalid arc '+key);
    if(c.arc.movements.length!==3||[...c.arc.movements,...c.arc.anchors].some(x=>typeof x!=='string'))throw new Error('Invalid arc movements/anchors');
  }
  if(c.status==='awaitingRoll') {
    if(!object(c.pending)||!STATS.includes(c.pending.stat)||typeof c.pending.action!=='string') throw new Error('Invalid pending check');
    integer(c.pending.cv,-7,7,'CV'); integer(c.pending.dv,-11,10,'DV'); integer(c.pending.fv?.value,-2,6,'FV');
    if(Math.abs(c.pending.cv)<2||!Array.isArray(c.pending.fv.reasons)||c.pending.fv.reasons.some(x=>typeof x!=='string'))throw new Error('Invalid pending FV reasons or CV');
  }
  if(c.recentCues.some(x=>typeof x!=='string')||c.recentNotes.some(x=>typeof x!=='string')||c.recentCards.some(x=>!object(x)))throw new Error('Invalid scene memory');
  for(const value of Object.values(c.repetition)) {
    if(!object(value)||typeof value.value!=='string')throw new Error('Invalid repetition memory');
    integer(value.count,0,Number.MAX_SAFE_INTEGER,'repetition count');
  }
  for(const values of Object.values(c.faded)) {
    if(!object(values))throw new Error('Invalid faded memory');
    for(const value of Object.values(values))integer(value,0,Number.MAX_SAFE_INTEGER,'fade expiry');
  }
  if(c.importedHistoryLength!==undefined)integer(c.importedHistoryLength,0,c.history.length,'import offset');
  if(c.criticalMargins.some(x=>!Number.isFinite(x))) throw new Error('Invalid critical margin');
  return c;
}
export const parseCampaign = text => validateCampaign(safeParse(text,8_000_000));
export function snapshot(c) {
  const {bank,history,rngAudit,checkpoints,outbox,operation,...rest}=c;
  return {...clone(rest),historyLength:history.length,rngLength:rngAudit.length};
}
export function restoreSnapshot(c,s) {
  const {historyLength,rngLength,...rest}=s;
  return {...clone(c),...clone(rest),ledger:clone(s.ledger??null),narrativeHint:s.narrativeHint??null,objectiveTrack:clone(s.objectiveTrack??null),history:c.history.slice(0,historyLength),rngAudit:c.rngAudit.slice(0,rngLength),operation:null,outbox:[]};
}
export function reduceCampaign(c,event) {
  const next=clone(c);
  if(event.revision!==c.revision) throw new Error('Stale action: campaign has changed');
  if(event.type==='cancelCheck') { if(c.status!=='awaitingRoll') throw new Error('No pending roll'); next.status='idle';next.pending=null; }
  else if(event.type==='bank') { if(c.status==='awaitingRoll'||c.operation) throw new Error('Finish or cancel the pending action before changing the scene bank'); next.bank=parseSceneBank(JSON.stringify(event.bank)); next.palette=null; next.narrativeHint=null; next.checkpoints=[]; next.recentCards=[]; next.recentCues=[];next.faded={};next.repetition={}; }
  else throw new Error('Unknown campaign event');
  next.revision++;return {campaign:next,effects:[]};
}
