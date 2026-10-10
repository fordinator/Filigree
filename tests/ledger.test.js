import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReply} from '../src/services/llm.js';
import {newCampaign,parseCampaign} from '../src/core/campaign.js';
const valid={objective:'Recover the parcel.',stakes:['The courier may lose her job.'],facts:['The guard holds the parcel.'],lastChange:'The guard refused access.'};
const reply=ledger=>JSON.stringify({actions:['Look at the gate.'],ledger});

test('continuity replies validate a bounded ledger instead of accepting arbitrary model JSON',()=>{
 assert.deepEqual(parseReply('continuity',reply(valid)).ledger,valid);
 for(const bad of [null,{}, {...valid,objective:4}, {...valid,stakes:['']}, {...valid,facts:Array(17).fill('Noise')}, {...valid,lastChange:'x'.repeat(601)}, {...valid,stats:{DEX:99}}]) {
  assert.throws(()=>parseReply('continuity',reply(bad)),/ledger/i);
 }
 assert.throws(()=>parseReply('continuity',JSON.stringify({ledger:valid,actions:[1]})),/actions/i);
});

test('legacy exports remain valid but malformed ledger metadata cannot be imported',()=>{
 const c=newCampaign({STR:0,DEX:0,CON:0,INT:0,WIS:0,CHA:0},'manual',{story:{}});
 delete c.ledger;
 assert.equal(parseCampaign(JSON.stringify(c)).status,'awaitingDescription');
 c.ledger=valid;assert.deepEqual(parseCampaign(JSON.stringify(c)).ledger,valid);
 c.ledger={...valid,facts:{anything:'goes'}};
 assert.throws(()=>parseCampaign(JSON.stringify(c)),/ledger/i);
});

test('rewinding to a legacy checkpoint clears future ledger facts',async()=>{
 const {snapshot,restoreSnapshot}=await import('../src/core/campaign.js');
 const c=newCampaign({STR:0,DEX:0,CON:0,INT:0,WIS:0,CHA:0},'manual',{story:{}});
 delete c.ledger;const before=snapshot(c);
 c.ledger=valid;
 assert.equal(restoreSnapshot(c,before).ledger,null);
});

test('v2 brief allows empty threads and stable scenes but rejects oversized or executable-shaped data',async()=>{
 const {activeLedger}=await import('./helpers/active-story.js');
 const {validateLedger,activeBrief,validateAudit}=await import('../src/core/ledger.js');
 const quiet=activeLedger({cast:[],recentEvents:[],threads:[],lastBeat:'The player rests; nothing new happens.'});
 assert.deepEqual(validateLedger(quiet),quiet);
 for(const bad of [{...quiet,scene:'x'.repeat(801)},{...quiet,cast:Array(7).fill('Someone')},{...quiet,direction:4},{...quiet,objectives:[]}])assert.throws(()=>validateLedger(bad),/brief|ledger/);
 assert.equal(activeBrief(valid).direction,valid.objective);assert.equal(activeBrief(valid).version,2);assert.deepEqual(activeBrief(valid).recentEvents,valid.facts);
 for(const audit of [{},{issues:[{kind:'goals',reason:'missing',evidence:'gate'}]},{issues:[{kind:'mechanics',reason:'conflict',evidence:'not in prose'}]}])assert.throws(()=>validateAudit(audit,'The gate opens.'),/audit|issue|evidence/i);
});
