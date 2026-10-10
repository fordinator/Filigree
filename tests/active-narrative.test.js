import test from 'node:test';
import assert from 'node:assert/strict';
import {AdventureEngine,campaignContext} from '../src/engine.js';
import {parseCampaign} from '../src/core/campaign.js';
import {activeLedger,activeReply} from './helpers/active-story.js';
const stats={STR:0,DEX:0,CON:0,INT:0,WIS:0,CHA:0};
const bank={story:{turn_budget:{min:22,max:22}},scene_cues:{developments:['The guard MUST reveal his secret.']}};
function fixture() {
 let saved=null;const requests=[],published=[];
 const adapter={id:()=> 'chat',load:()=>structuredClone(saved),save:async s=>{saved=structuredClone(s);},publish:async rows=>published.push(...rows),narratorCardContext:()=>({name:'DM',scenario:'River',description:'Guide',personality:'Dry'})};
 const answers={narration:'The guard waits at the gate.',continuity:()=>activeReply(),compass:{premise:'River gate',pressure:'Night',anchors:['Guard'],movements:['Arrive','Explore','Finish'],possible_ending:'Home',target_turns:22},creativity:false,uniqueness:false,cv:{cv:2},check:{stat:'DEX',dv:0},death:false};
 const ai={request:async(type,messages,options)=>{requests.push({type,messages,options});if(type==='resolution')throw Error('Obsolete resolver invoked');const r=answers[type];return typeof r==='function'?r(messages,options):structuredClone(r);}};
 const e=new AdventureEngine(adapter,ai,min=>min);
 return {e,adapter,requests,published,answers,get:()=>structuredClone(saved)};
}
async function start(f,card=false){await f.e.create(stats,'manual',bank,card?{mode:'card',avatar:'DM.png'}:null);await f.e.describe('Courier');}

test('direct narration permits a tangent and a rolled scene with no durable state delta',async()=>{
 const f=fixture();await start(f);f.answers.narration='You ask about the guard’s daughter; he answers quietly.';
 f.answers.continuity=()=>activeReply({ledger:activeLedger({direction:'Talk about family.',lastBeat:'The guard answers without changing the situation.'})});
 await f.e.act('I ask about his daughter');await f.e.roll();
 assert.equal(f.get().status,'idle');assert.equal(f.get().ledger.version,2);assert.equal(f.get().ledger.direction,'Talk about family.');
 assert.equal(f.requests.some(r=>r.type==='resolution'),false);assert.equal(f.get().objectiveTrack,null);
 assert.doesNotMatch(f.requests.filter(r=>r.type==='narration').at(-1).messages.at(-1).content,/BINDING RESOLUTION|one bank-owned objective tracker|every roll needs an actual before/i);
});
test('legacy goals are inert and legacy brief migrates without losing committed history',async()=>{
 const f=fixture();await start(f);const c=f.get();
 c.ledger={objective:'LEGACY_REQUIRED_ESCAPE',facts:['The courier reached the river.'],stakes:['Nightfall'],lastChange:'Waiting.'};
 c.objectiveTrack={status:'active',objectives:[{id:'old',title:'LEGACY_REQUIRED_ESCAPE',success:'Original success',failure:'Original failure',required:true,status:'active'}],facts:[]};
 c.bank.objective_tracker={name:'Old',mode:'authored',instructions:'NEVER CHANGE OBJECTIVES',objectives:[{...c.objectiveTrack.objectives[0],title:'A different imported definition'}]};
 const imported=parseCampaign(JSON.stringify(c));await f.adapter.save(imported);const before=f.get().history;
 assert.doesNotMatch(JSON.stringify(campaignContext(c)),/NEVER CHANGE OBJECTIVES|Original success|Original failure/);
 await f.e.incidental(0);assert.deepEqual(f.get().history.slice(0,before.length),before);assert.equal(f.get().ledger.version,2);
 assert.deepEqual(f.get().objectiveTrack,c.objectiveTrack);
});
test('pacing concern commits as a one-turn advisory hint, clears and rewinds correctly',async()=>{
 const f=fixture();await start(f);
 f.answers.continuity=()=>activeReply({audit:{issues:[{kind:'pacing',evidence:'The guard waits',reason:'Repeated stalled exchange, not deliberate rest.'}]}});
 await f.e.incidental(0);const hinted=f.get();assert.match(hinted.narrativeHint,/stalled/);
 f.answers.continuity=()=>activeReply();await f.e.incidental(0);
 const prompt=f.requests.filter(r=>r.type==='narration').at(-1).messages.at(-1).content;
 assert.match(prompt,/advisory.*anti-loop/i);assert.match(prompt,/same scale/i);assert.equal(f.get().narrativeHint,null);
 await f.e.rewind(f.get().checkpoints.at(-1).turnId);assert.equal(f.get().narrativeHint,hinted.narrativeHint);
});
test('hard continuity rejection repairs prose once; reload retry keeps exact dice and accepted story',async()=>{
 const f=fixture();await start(f);await f.e.act('I force the gate');const before=f.get();
 f.answers.narration='You teleport to the moon.';
 f.answers.continuity=()=>activeReply({audit:{issues:[{kind:'continuity',evidence:'teleport to the moon',reason:'The river scene has no teleportation event or power.'}]}});
 await assert.rejects(()=>f.e.roll(),/Coherence.*two candidates/);
 assert.deepEqual(f.get().history,before.history);const op=f.get().operation;assert.equal(f.published.length,1);
 f.answers.narration='The gate opens.';f.answers.continuity=()=>activeReply();f.e=new AdventureEngine(f.adapter,f.e.ai,()=>{throw Error('reroll');});
 await f.e.retry();assert.equal(f.get().status,'idle');assert.deepEqual(f.get().lastTurn.roll.dice,op.draws.slice(0,8).map(d=>d.value));assert.equal(f.published.length,3);
});
test('malformed audit evidence repairs only audit, preserving sound prose',async()=>{
 const f=fixture();await start(f);const n=f.requests.filter(r=>r.type==='narration').length;let calls=0;
 f.answers.continuity=()=>++calls===1?activeReply({audit:{issues:[{kind:'continuity',evidence:'a quote not in the candidate',reason:'Unsupported accusation'}]}}):activeReply();
 await f.e.incidental(0);assert.equal(calls,2);assert.equal(f.requests.filter(r=>r.type==='narration').length,n+1);
});
test('card narration includes active context, and never requires following pressure cues',async()=>{
 const f=fixture();await start(f,true);await f.e.act('I try the gate');await f.e.roll();
 const request=f.requests.filter(r=>r.type==='narration').at(-1);assert.equal(request.options.characterNarrator,true);
 assert.match(request.messages.at(-1).content,/A locked gate by the river/);
 assert.match(request.messages.at(-1).content,/suggestions.*not commands/i);
 assert.doesNotMatch(request.messages.at(-1).content,/must change what someone can do/i);
});
test('old interrupted policy is fenced, but discard preserves pending roll',async()=>{
 const f=fixture();await start(f);await f.e.act('I try the gate');const c=f.get();c.operation={flowVersion:4,event:{type:'roll'},draws:[],replies:{}};await f.adapter.save(c);
 await assert.rejects(()=>f.e.retry(),/older engine/);await f.e.discardInterrupted();assert.deepEqual(f.get().pending,c.pending);assert.equal(f.get().status,'awaitingRoll');
});

test('concurrent revision during narration cannot rebase or publish a stale candidate',async()=>{
 const f=fixture();await start(f);const before=f.get();
 f.answers.narration=async()=>{const c=f.get();c.revision++;c.ledger.direction='Changed by another editor.';await f.adapter.save(c);return 'The guard waits at the gate.';};
 await assert.rejects(()=>f.e.incidental(0),/Campaign changed/);
 assert.deepEqual(f.get().history,before.history);assert.equal(f.get().ledger.direction,'Changed by another editor.');assert.equal(f.published.length,1);
});
test('one hard mechanics repair publishes only corrected prose and leaves no hidden goal state',async()=>{
 const f=fixture();await start(f);let n=0,a=0;
 f.answers.narration=()=>++n===1?'You fail to look at the gate.':'You see the gate clearly.';
 f.answers.continuity=()=>++a===1?activeReply({audit:{issues:[{kind:'mechanics',evidence:'fail to look',reason:'The observation succeeded.'}]}}):activeReply();
 await f.e.incidental(0);assert.equal(n,2);assert.equal(a,2);assert.equal(f.published.at(-1).content,'You see the gate clearly.');
 assert.doesNotMatch(JSON.stringify(f.get().history),/fail to look/);
});
test('brief and advisory hint preserve export/import; bank replacement clears only the hint',async()=>{
 const f=fixture();await start(f);const c=f.get();c.narrativeHint='A repeated wait could use a new local response.';await f.adapter.save(c);
 await f.e.importCampaign(JSON.stringify(c));assert.deepEqual(f.get().ledger,c.ledger);assert.equal(f.get().narrativeHint,c.narrativeHint);
 await f.e.dispatch({type:'bank',bank:{story:{turn_budget:{min:5,max:6}}}});assert.deepEqual(f.get().ledger,c.ledger);assert.equal(f.get().narrativeHint,null);assert.equal(f.get().arc.turn_budget,22);
});
