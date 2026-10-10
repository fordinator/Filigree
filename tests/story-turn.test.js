import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStoryTurn} from '../src/services/story-turn.js';
import {campaignContext} from '../src/engine.js';
import {activeLedger,activeReply} from './helpers/active-story.js';
test('large legal active brief and full narration fit requests without cached-output deadlock',async()=>{
 const ledger=activeLedger({scene:'S'.repeat(800),cast:Array(6).fill('C'.repeat(400)),recentEvents:Array(6).fill('E'.repeat(400)),threads:Array(6).fill('T'.repeat(400)),direction:'D'.repeat(400),lastBeat:'B'.repeat(600)});
 const work={bank:{story:{}},ledger,character:{description:'C'.repeat(2000),stats:{}},arc:{premise:'P',pressure:'Q',anchors:[],movements:['A','B','C'],turn_count:10,turn_budget:22},recentNotes:[],history:Array.from({length:20},()=>({role:'assistant',content:'H'.repeat(2000)}))};
 const ask=async(type,messages,{validate})=>{assert.ok(JSON.stringify(messages).length<=80000);const r=type==='narration'?'N'.repeat(12000):activeReply({ledger});validate?.(r);return r;};
 const result=await prepareStoryTurn({work,turn:{kind:'critical',cv:5,action:'A'.repeat(12000),roll:{outcome:'Good success'},summary:'Good success'},scene:{cues:[],card:{}},ask,op:{replies:{}},context:campaignContext,bridge:'',characterNarrator:false});
 assert.deepEqual(result.ledger,ledger);assert.equal(result.turn.resolution,undefined);
});
test('escape-heavy legal prose survives audit transport retry without regenerating narration',async()=>{
 const ledger=activeLedger({scene:'S'.repeat(800),cast:Array(6).fill('C'.repeat(400)),recentEvents:Array(6).fill('E'.repeat(400)),threads:Array(6).fill('T'.repeat(400)),direction:'D'.repeat(400),lastBeat:'B'.repeat(600)});
 const work={bank:{story:{}},ledger,character:{stats:{}},arc:{premise:'P',pressure:'Q',anchors:[],movements:['A','B','C'],turn_count:10,turn_budget:22},history:[]};
 const turn={kind:'critical',cv:5,action:'Read the inscription: '+'"A"\n'.repeat(2900),roll:{outcome:'Good success',margin:3},summary:'Good success'};
 const narrative='You read the inscription: '+'"A"\n'.repeat(2900);
 const op={replies:{}};let narrations=0,audits=0;
 const ask=async(type,messages,{validate,cacheKey})=>{
  assert.ok(JSON.stringify(messages).length<=80000);
  if(op.replies[cacheKey])return op.replies[cacheKey];
  if(type==='continuity'&&++audits===1)throw Error('transport offline');
  const reply=type==='narration'?(narrations++,narrative):activeReply({ledger});validate?.(reply);op.replies[cacheKey]=reply;return reply;
 };
 const args={work,turn,scene:{cues:[],card:{}},ask,op,context:campaignContext,bridge:'',characterNarrator:false};
 await assert.rejects(prepareStoryTurn(args),/transport offline/);
 const result=await prepareStoryTurn(args);
 assert.equal(result.narrative,narrative);assert.equal(narrations,1);assert.equal(audits,2);assert.deepEqual(result.turn,turn);
});
test('oversized audit candidate repairs prose once while oversized authored input does not loop',async()=>{
 const ledger=activeLedger();
 const work={bank:{story:{},authoring:{}},ledger,character:{stats:{}},arc:{premise:'P',pressure:'Q',anchors:[],movements:['A','B','C'],turn_count:10,turn_budget:22},history:[]};
 const turn={kind:'critical',cv:5,action:'A'.repeat(12000),roll:{outcome:'Good success',margin:3},summary:'Good success'};
 const op={replies:{}};let narrations=0,audits=0;
 const ask=async(type,messages,{validate,cacheKey})=>{
  assert.ok(JSON.stringify(messages).length<=80000);
  const reply=type==='narration'?(++narrations===1?'\u0001'.repeat(11999):'The door opens.'):activeReply({ledger});
  if(type==='continuity')audits++;validate?.(reply);op.replies[cacheKey]=reply;return reply;
 };
 const args={work,turn,scene:{cues:[],card:{}},ask,op,context:campaignContext,bridge:'',characterNarrator:false};
 const result=await prepareStoryTurn(args);
 assert.equal(narrations,2);assert.equal(audits,1);assert.equal(result.narrative,'The door opens.');assert.deepEqual(result.turn,turn);
 assert.equal(op.narrativeRepair,'narration');assert.equal(op.replies['narration:0'],undefined);
 work.bank.authoring.notes='A'.repeat(81000);
 const fresh={replies:{}};
 await assert.rejects(prepareStoryTurn({...args,op:fresh}),/Story contract exceeds/);
 assert.equal(narrations,2);assert.equal(fresh.narrativeFeedback,undefined);
});
