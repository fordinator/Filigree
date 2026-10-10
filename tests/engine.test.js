import {LlmService} from '../src/services/llm.js';
import {activeLedger,activeReply,cleanAudit} from './helpers/active-story.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const m=await import('../src/engine.js').catch(()=>({}));
function fixture(responses={}) {
  assert.equal(typeof m.AdventureEngine,'function','Engine implemented');
  let saved=null, chat='a', avatar='DM.png', messages=[];const requests=[];
  const adapter={id:()=>chat,load:()=>structuredClone(saved),save:async state=>{saved=structuredClone(state);},publish:async entries=>messages.push(...entries),status:()=>{},preview:()=>{},
    narratorCardContext:expected=>{if(expected.avatar!==avatar)throw Error('Dungeon Master character card changed');return {name:'DM',scenario:'A city under a red moon.',description:'A sardonic guide.',personality:'Dry and observant.'};}};
  const ai={request:async(type,messages,options)=>{requests.push({type,messages,options});return type in responses?(typeof responses[type]==='function'?await responses[type](messages,options):responses[type]):({compass:{premise:'Lost key',pressure:'Time',anchors:['Gate'],movements:['A','B','C'],possible_ending:'Open',target_turns:22},narration:'A gate stands before you. What do you do now?',actions:{actions:['Look at the gate.']},continuity:activeReply(),creativity:false,uniqueness:false,cv:{cv:0},check:{stat:'DEX',dv:2},death:false}[type]);}};
  const e=new m.AdventureEngine(adapter,ai,(min)=>min);
  return {e,adapter,get:()=>saved,messages,requests,switchChat:()=>{chat='b';saved=null;},switchCard:()=>{avatar='Other.png';}};
}
const bank={metadata:{name:'Test'},story:{turn_budget:{min:22,max:32}},scene_cues:{situations:['Gate'],details:['Iron']}};
const stats={STR:0,DEX:0,CON:0,INT:0,WIS:0,CHA:0};
async function start(f){await f.e.create(stats,'manual',bank);await f.e.describe('Courier');}
test('CV prompt is independent of player stats and rates action scale not likely success',async()=>{
 const cvPromptFor=async(dex)=>{
   const f=fixture();await f.e.create({...stats,DEX:dex},'manual',bank);await f.e.describe('Courier');
   await f.e.act('I somersault over the alligator pit');
   return f.requests.find(x=>x.type==='cv').messages;
 };
 const nimble=await cvPromptFor(7),clumsy=await cvPromptFor(-7);
 assert.deepEqual(nimble,clumsy);
 const prompt=nimble.at(-1).content;
 assert.match(prompt,/irrespective of the player.s stats/i);
 assert.match(prompt,/CV 6 to somersault over an alligator pit/i);
});
test('card narrator grounds the compass and routes narration through the selected card',async()=>{
 const f=fixture();await f.e.create(stats,'manual',bank,{mode:'card',avatar:'DM.png'});await f.e.describe('Courier');
 assert.deepEqual(f.get().narrator,{mode:'card',avatar:'DM.png'});
 assert.match(f.requests.find(x=>x.type==='compass').messages[0].content,/city under a red moon/i);
 const narration=f.requests.find(x=>x.type==='narration');
 assert.equal(narration.options.characterNarrator,true);
 assert.match(narration.messages.at(-1).content,/DM.*Dungeon Master/i);
 assert.equal(f.messages.filter(x=>x.role==='assistant').length,1);
 f.switchCard();await assert.rejects(()=>f.e.act('I inspect the gate'),/character card changed/i);
 assert.equal(f.messages.filter(x=>x.role==='assistant').length,1);
});
test('card adventure creation rejects a chat switch during card loading',async()=>{
 const f=fixture();let release;
 f.adapter.narratorCardContext=()=>new Promise(resolve=>{release=resolve;});
 const pending=f.e.create(stats,'manual',bank,{mode:'card',avatar:'DM.png'});
 f.switchChat();release({name:'DM'});
 await assert.rejects(()=>pending,/chat changed/i);
 assert.equal(f.get(),null);
});
test('creation and full minor turn persist and reload',async()=>{
 const f=fixture();await start(f);await f.e.act('I inspect the gate');
 assert.equal(f.get().status,'idle');assert.equal(f.get().arc.turn_count,2);assert.equal(f.get().pressure.chance,4);
 assert.equal(f.messages.filter(x=>x.role==='assistant').length,2);
 assert.equal(new m.AdventureEngine(f.adapter,{}).state().character.description,'Courier');
});
test('pending roll is explicit, selected stat honored, duplicate rolls rejected',async()=>{
 const f=fixture({cv:{cv:-5},check:{stat:'DEX',dv:3}});await start(f);await f.e.act('I move the gate','STR');
 assert.equal(f.get().status,'awaitingRoll');assert.equal(f.get().pending.stat,'STR');assert.equal(f.get().pending.dv,0);
 await f.e.roll();assert.equal(f.get().status,'idle');assert.equal(f.get().criticalMargins.length,1);
 await assert.rejects(()=>f.e.roll(),/pending roll/);
});
test('incidental action bypasses EV and classification and records its own text',async()=>{
 const f=fixture({cv:()=>{throw Error('must not evaluate')}});await start(f);await f.e.incidental(0);
 assert.equal(f.get().history.at(-2).content,'Look at the gate.');assert.equal(f.get().arc.turn_count,2);
 assert.equal(f.get().pressure.chance,0);
});
test('erratic interrupts a freeform action without requesting CV',async()=>{
 const f=fixture({cv:()=>{throw Error('must not evaluate')}});await start(f);
 const tape=[6,6,1,1];f.e.rng=(min,max)=>max===6?tape.shift():min;
 await f.e.act('I act');assert.equal(f.get().lastTurn.ev,10);assert.equal(f.get().status,'idle');
});
test('failed narration retains committed history and retry reuses recorded dice',async()=>{
 let fail=false;
 const f=fixture({narration:()=>{if(fail) throw Error('Provider offline');return 'Gate.';}});await start(f);fail=true;
 await assert.rejects(()=>f.e.incidental(0),/offline/);
 assert.equal(f.get().history.length,1);assert.ok(f.get().operation);
 const draws=structuredClone(f.get().operation.draws);
 fail=false;f.e.rng=()=>{throw Error('must reuse draws')};await f.e.retry();
 assert.equal(f.get().history.length,3);assert.deepEqual(f.get().lastTurn.dice,draws.slice(0,2).map(x=>x.value));
});
test('chat switch fences late completions',async()=>{
 let release;const f=fixture();await start(f);
 f.e.ai.request=()=>new Promise(resolve=>{release=resolve;});
 const pending=f.e.act('Wait');await new Promise(r=>setImmediate(r));f.switchChat();release(false);
 await assert.rejects(()=>pending,/chat changed|cancel/i);assert.equal(f.get(),null);
});
test('elapsed budget ends on the next genuine critical even when it fails and objectives remain active',async()=>{
 const f=fixture({cv:{cv:5}});await f.e.create(stats,'manual',{...bank,story:{turn_budget:{min:1,max:1}}});await f.e.describe('');
 await f.e.act('I end the conflict');await f.e.roll();
 assert.equal(f.get().status,'concluded');assert.equal(f.get().lastTurn.finale.result,'defeat');
});
test('manual conclusion with no history closes from established fiction',async()=>{
 const f=fixture();await start(f);await f.e.conclude();
 assert.equal(f.get().status,'concluded');assert.match(f.get().lastTurn.summary,/Player ended/);
});
test('import validation rejects arbitrary broken state before changing current campaign',async()=>{
 const f=fixture();await start(f);const old=f.get();
 await assert.rejects(()=>f.e.importCampaign('{"schemaVersion":99}'),/version|schema/i);
 assert.deepEqual(f.get(),old);
});
test('malformed pending FV and arc cannot replace a valid campaign',async()=>{
 const f=fixture({cv:{cv:5}});await start(f);await f.e.act('I force the gate');
 const original=structuredClone(f.get()),bad=structuredClone(original);delete bad.pending.fv.reasons;
 await assert.rejects(()=>f.e.importCampaign(JSON.stringify(bad)),/FV/);
 assert.deepEqual(f.get(),original);
 bad.pending=original.pending;bad.arc.turn_count='broken';
 await assert.rejects(()=>f.e.importCampaign(JSON.stringify(bad)),/turn|arc/);
 assert.deepEqual(f.get(),original);
});
test('import rejects malformed nested scene memory and forged import offsets',async()=>{
 const f=fixture();await start(f);const original=structuredClone(f.get());
 for(const change of [c=>{c.repetition={place:{value:'gate',count:'bad'}};},c=>{c.faded={place:{gate:'forever'}};},c=>{c.importedHistoryLength=-1;}]) {
   const bad=structuredClone(original);change(bad);
   await assert.rejects(()=>f.e.importCampaign(JSON.stringify(bad)),/memory|repetition|fade|offset/i);
   assert.deepEqual(f.get(),original);
 }
});
test('long adventures use bounded history without changing stored transcript',async()=>{
 const f=fixture();await start(f);const c=f.get();
 c.history.push(...Array.from({length:100},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(2000),turnId:'old'+i})));
 await f.adapter.save(c);let size=0;
 const request=f.e.ai.request;f.e.ai.request=async(type,messages)=>{size=Math.max(size,JSON.stringify(messages).length);return request(type,messages);};
 await f.e.incidental(0);
 assert.ok(size<60000,'prompt grew to '+size);assert.equal(f.get().history.length,103);
});
test('chat switch during import backup never replaces destination campaign',async()=>{
 const f=fixture();await start(f);const text=JSON.stringify(f.get());
 let release;f.adapter.backup=()=>new Promise(resolve=>{release=resolve;});
 const pending=f.e.importCampaign(text);await new Promise(r=>setImmediate(r));f.switchChat();release();
 await assert.rejects(()=>pending,/chat changed/i);assert.equal(f.get(),null);
});
test('unavailable death evaluator produces severe nonfatal consequence',async()=>{
 const f=fixture({cv:{cv:4},death:()=>{throw Error('Death evaluator unavailable');}});await start(f);await f.e.act('I leap');
 const tape=[1,1,1,1,6,6,6,6,1];f.e.rng=()=>tape.shift();
 await f.e.roll();assert.equal(f.get().status,'idle');assert.match(f.get().lastTurn.summary,/nonfatal/i);
});

test('only CV -1 through +1 skips a check; both signs of 2 and 4 roll, without becoming critical',async()=>{
 for(const [cv,status] of [[-4,'awaitingRoll'],[-2,'awaitingRoll'],[-1,'idle'],[0,'idle'],[1,'idle'],[2,'awaitingRoll'],[4,'awaitingRoll']]) {
  const f=fixture({cv:{cv}});await start(f);await f.e.act('I demand the key');
  assert.equal(f.get().status,status,'CV '+cv);
  if(status==='awaitingRoll') {
   assert.equal(f.get().pending.dv,2,'noncritical CV must not alter base DV');
   await f.e.importCampaign(JSON.stringify(f.get()));
   await f.e.roll();assert.deepEqual(f.get().criticalMargins,[]);
  }
 }
});
test('CV and base-DV evaluator inputs exclude player capability, stats and backstory',async()=>{
 const requestsFor=async(value,description)=>{
  const f=fixture({cv:{cv:2}});await f.e.create({...stats,DEX:value},'manual',bank);await f.e.describe(description);
  await f.e.act('I somersault over the alligator pit');
  return {cv:f.requests.find(x=>x.type==='cv').messages,check:f.requests.find(x=>x.type==='check')?.messages};
 };
 const flash=await requestsFor(7,'The Flash, superhuman speed and invulnerable armor');
 const frump=await requestsFor(-7,'Professor Frump, a clumsy novice');
 assert.ok(flash.check,'CV +2 must ask for intrinsic difficulty');
 assert.deepEqual(flash,frump);
 const dv=flash.check.at(-1).content;
 assert.match(dv,/average.*(?:human|adult|man)/i);assert.match(dv,/\+0/);
 assert.doesNotMatch(JSON.stringify(flash),/invulnerable armor|clumsy novice/);
});
test('narrated consequences persist in the ledger, enter the next prompts, and rewind with the turn',async()=>{
 const f=fixture({cv:{cv:2}});await start(f);const before=structuredClone(f.get().ledger);
 const next=activeLedger({direction:'Protect the witness.',threads:['Her husband may retaliate.'],recentEvents:['The witness confessed her husband took the parcel.','The witness is crying.'],lastBeat:'The confession identifies the thief and leaves the witness distraught.'});
 f.e.ai.request=async(type,messages,options)=>{
  f.requests.push({type,messages,options});
  return {creativity:false,uniqueness:false,cv:{cv:2},check:{stat:'CHA',dv:-7},narration:'She confesses that her husband took the parcel, then starts crying. What do you do now?',continuity:{audit:cleanAudit,ledger:next,actions:['Watch the witness.']}}[type];
 };
 await f.e.act('I question the witness');await f.e.roll();
 assert.deepEqual(f.get().ledger,next);
 const turnId=f.get().history.at(-1).turnId;
 await f.e.act('I comfort the witness');
 assert.match(JSON.stringify(f.requests.filter(x=>x.type==='cv').at(-1).messages),/witness is crying/);
 await f.e.dispatch({type:'cancelCheck'});
 await f.e.rewind(turnId);assert.deepEqual(f.get().ledger,before);
});
test('failed ledger extraction leaves committed story intact and retry reuses dice and narration',async()=>{
 const f=fixture({cv:{cv:2}});await start(f);
 await f.e.act('I demand the key');const before=structuredClone(f.get());
 const native=f.e.ai.request;let fail=true;
 f.e.ai.request=async(type,...args)=>{if(type==='continuity'&&fail)throw Error('continuity offline');return native(type,...args);};
 await assert.rejects(()=>f.e.roll(),/ledger|continuity/i);
 assert.deepEqual(f.get().history,before.history);assert.deepEqual(f.get().ledger,before.ledger);
 const narrations=f.requests.filter(x=>x.type==='narration').length;
 fail=false;f.e.rng=()=>{throw Error('dice were rerolled');};await f.e.retry();
 assert.equal(f.requests.filter(x=>x.type==='narration').length,narrations);
 assert.equal(f.get().history.length,before.history.length+2);
 assert.ok(f.get().ledger);
});

test('card narration receives the ledger and a legacy campaign gains one without reset',async()=>{
 const f=fixture();await f.e.create(stats,'manual',bank,{mode:'card',avatar:'DM.png'});await f.e.describe('Courier');
 const legacy=structuredClone(f.get());delete legacy.ledger;
 await f.e.importCampaign(JSON.stringify(legacy));await f.e.incidental(0);
 assert.ok(f.get().ledger);assert.equal(f.get().history.length,3);
 await f.e.incidental(0);
 const request=f.requests.filter(x=>x.type==='narration').at(-1);
 assert.equal(request.options.characterNarrator,true);
 assert.match(JSON.stringify(request.messages),/locked gate by the river/);
});
test('cancel or chat switch during ledger extraction cannot commit the pending narration',async()=>{
 for(const switchChat of [false,true]) {
  const f=fixture();await start(f);const before=structuredClone(f.get());let release;
  const original=f.e.ai.request;
  f.e.ai.request=(type,...args)=>type==='continuity'?new Promise(resolve=>{release=resolve;}):original(type,...args);
  const pending=f.e.incidental(0);while(!release)await new Promise(r=>setImmediate(r));
  if(switchChat)f.switchChat();else f.e.cancel();
  release({ledger:before.ledger,actions:['Wait.']});
  await assert.rejects(()=>pending,/cancel|chat changed/i);
  assert.equal(f.messages.length,1);
  if(switchChat)assert.equal(f.get(),null);
  else {assert.deepEqual(f.get().history,before.history);assert.deepEqual(f.get().ledger,before.ledger);}
 }
});

test('missing audit approval repairs once instead of caching an invalid candidate',async()=>{
 const f=fixture({cv:{cv:5}});await start(f);await f.e.act('I escape');const original=f.e.ai.request;let audits=0;
 f.e.ai.request=async(type,...args)=>{const r=await original(type,...args);if(type==='continuity'&&++audits===1){delete r.audit;}return r;};
 await f.e.roll();assert.equal(audits,2);assert.equal(f.get().status,'idle');assert.equal(f.messages.length,3);
});

// Restored pacing regressions: these catch missing eligibility and state integration,
// not just the already-present pure arithmetic helpers.
async function pendingAt({cv=5,count=22,prior=[],margin=2,pressure={chance:0,turns:0},responses={}}={}) {
 const f=fixture({cv:{cv},...responses});await start(f);await f.e.act('I resolve the obstacle');
 const c=f.get();c.arc.turn_count=count;c.criticalMargins=prior;c.pending.dv=-2-margin;c.pressure=pressure;await f.adapter.save(c);
 f.e.rng=(min,max)=>max===100?100:min;return f;
}
test('budget checks committed count before roll, either critical sign, no success-only gate, and ordinary rolls never enter history',async()=>{
 for(const [cv,count,margin,want] of [[5,21,2,'idle'],[-5,22,-2,'concluded'],[5,22,2,'concluded'],[4,22,2,'idle'],[-4,23,-2,'idle']]){
  const f=await pendingAt({cv,count,margin});await f.e.roll();assert.equal(f.get().status,want);
  assert.deepEqual(f.get().criticalMargins,Math.abs(cv)>=5?[margin]:[]);
  assert.equal(f.get().arc.turn_count,count+1);
 }
});
test('computed finale uses previous genuine critical rolls even when they disagree with final roll success',async()=>{
 for(const [margin,prior,result] of [[2,[-8],'defeat'],[-2,[8],'victory'],[0,[],'victory'],[-5,[-3],'fatal defeat']]){
  const f=await pendingAt({margin,prior});await f.e.roll();assert.equal(f.get().lastTurn.finale.result,result);
  assert.deepEqual(f.get().criticalMargins,[...prior,margin]);assert.equal(f.messages.filter(x=>x.role==='assistant').length,2);
 }
});
test('manual close uses all critical margins with original zero-average defeat and never invents fatality',async()=>{
 for(const [prior,result,percent] of [[[8,-2],'victory',65],[[2,-2],'defeat',50],[[-20],'defeat',1]]){
  const f=fixture();await start(f);const c=f.get();c.criticalMargins=prior;await f.adapter.save(c);await f.e.conclude();
  assert.equal(f.get().lastTurn.finale.result,result);assert.equal(f.get().lastTurn.finale.successPercent,percent);
 }
});
test('immediate fatal failure outranks a historical victory',async()=>{
 const f=await pendingAt({margin:-7,prior:[30],responses:{death:true}});await f.e.roll();
 assert.equal(f.get().lastTurn.finale.result,'fatal defeat');assert.equal(f.get().status,'concluded');
});
test('nonroll adds four, incidental preserves pressure, erratic resets it',async()=>{
 const f=fixture();await start(f);const c=f.get();c.pressure={chance:97,turns:4};await f.adapter.save(c);
 await f.e.act('I inspect the gate');assert.deepEqual(f.get().pressure,{chance:100,turns:5});
 await f.e.incidental(0);assert.deepEqual(f.get().pressure,{chance:100,turns:5});
 const tape=[6,6,1,1];f.e.rng=(min,max)=>max===6?tape.shift():min;await f.e.act('I act');assert.deepEqual(f.get().pressure,{chance:0,turns:0});
});
test('ordinary pressure selects advisory narration cues and critical suppression forbids a separate twist',async()=>{
 for(const cv of [4,5]){
  const f=await pendingAt({cv,count:4,margin:3,pressure:{chance:90,turns:2}});
  const c=f.get();c.bank.scene_cues.developments=['The guard opens the route.'];c.palette=null;await f.adapter.save(c);
  f.e.rng=min=>min;await f.e.roll();const t=f.get().lastTurn;
  assert.equal(t.pressure.triggered,true);assert.equal(t.pressure.suppressed,cv===5);assert.deepEqual(f.get().pressure,{chance:0,turns:0});
  const resolver=f.requests.filter(x=>x.type==='narration').at(-1).messages.at(-1).content;
  assert.match(resolver,cv===4?/moderate development/:/no separate pressure twist/i);
  if(cv===4){assert.ok(f.get().recentCues.includes('The guard opens the route.'));assert.match(resolver,/The guard opens the route/);}
 }
});
test('failed pressure audit reloads and retries cached randomness once; rewind restores counters and critical history',async()=>{
 const f=await pendingAt({cv:4,count:4,margin:3,pressure:{chance:20,turns:2}});const before=structuredClone(f.get());
 const native=f.e.ai.request;let fail=true;
 f.e.ai.request=async(type,...args)=>{if(type==='continuity'&&fail)throw Error('audit offline');return native(type,...args);};
 await assert.rejects(()=>f.e.roll(),/audit offline/);assert.deepEqual(f.get().pressure,before.pressure);assert.deepEqual(f.get().criticalMargins,before.criticalMargins);
 fail=false;const reloaded=new m.AdventureEngine(f.adapter,f.e.ai,()=>{throw Error('rerolled pressure');});await reloaded.retry();
 assert.deepEqual(f.get().pressure,{chance:50,turns:3});await reloaded.rewind(f.get().lastTurn?f.get().history.at(-1).turnId:'');
 assert.deepEqual(f.get().pressure,before.pressure);assert.deepEqual(f.get().criticalMargins,before.criticalMargins);assert.equal(f.get().status,'awaitingRoll');
});
test('finale rejection and cancellation cannot accumulate history or pressure; retry and rewind preserve the original final roll',async()=>{
 const f=await pendingAt({margin:-2,prior:[8],pressure:{chance:40,turns:3}});const before=structuredClone(f.get());const native=f.e.ai.request;
 let reject=true;f.e.ai.request=async(type,...args)=>{const r=await native(type,...args);return type==='continuity'&&reject?{...r,audit:{issues:[{kind:'mechanics',evidence:'A gate stands before you.',reason:'Narration contradicts computed victory.'}]}}:r;};
 await assert.rejects(()=>f.e.roll(),/computed victory/);assert.deepEqual(f.get().criticalMargins,[8]);assert.deepEqual(f.get().pressure,before.pressure);assert.equal(f.get().arc.turn_count,22);
 reject=false;f.e.rng=()=>{throw Error('rerolled finale');};await f.e.retry();assert.deepEqual(f.get().criticalMargins,[8,-2]);assert.equal(f.get().lastTurn.finale.result,'victory');
 await f.e.rewind(f.get().history.at(-1).turnId);assert.deepEqual(f.get().criticalMargins,[8]);assert.deepEqual(f.get().pressure,before.pressure);assert.equal(f.get().status,'awaitingRoll');
 let release;f.e.rng=min=>min;f.e.ai.request=(type,...args)=>type==='continuity'?new Promise(resolve=>{release=resolve;}):native(type,...args);
 const pending=f.e.roll();while(!release)await new Promise(r=>setImmediate(r));f.e.cancel();release({audit:cleanAudit,ledger:before.ledger,actions:[]});
 await assert.rejects(()=>pending,/cancel/);assert.deepEqual(f.get().criticalMargins,[8]);assert.deepEqual(f.get().pressure,before.pressure);assert.equal(f.get().status,'awaitingRoll');
});

// Only native generation is controlled: real LlmService parsing, orchestration,
// engine cache/checkpoints and persistence remain in the integration path.
async function cardRecoveryFixture(outputs) {
 const f=await pendingAt({count:2,margin:2});
 const state=f.get();state.narrator={mode:'card',avatar:'DM.png'};await f.adapter.save(state);
 const external=f.e.ai.request,counts={narration:0,continuity:0};let requestType;
 const service=new LlmService(()=>({mainApi:'openai',generateQuietPrompt:async options=>{
  counts.narration++;if(counts.narration>1)assert.match(options.quietPrompt,/Prior candidate issue/);
  return outputs.shift();
 }}),async()=>({sendOpenAIRequest:async(_mode,messages)=>{
  counts[requestType]++;return {content:JSON.stringify(await external(requestType,messages,{}))};
 }}));
 f.e.ai={request:async(type,...args)=>{requestType=type;return service.request(type,...args);}};
 return {f,counts};
}
for(const malformed of ['   ',{content:'not a string'}])test('real card narration repairs '+(typeof malformed==='string'?'whitespace':'nontext')+' without invoking the removed resolver',async()=>{
 const {f,counts}=await cardRecoveryFixture([malformed,'You open the gate and continue.']);
 await f.e.roll();assert.deepEqual(counts,{narration:2,continuity:1});
 assert.equal(f.get().status,'idle');assert.equal(f.messages.at(-1).content,'You open the gate and continue.');
});
test('real card two malformed outputs stay bounded and reload retries with exact dice',async()=>{
 const {f,counts}=await cardRecoveryFixture(['   ',null,'You open the gate and continue.']);
 const before=structuredClone(f.get());await assert.rejects(()=>f.e.roll(),/rejected two candidates/);
 assert.deepEqual(counts,{narration:2,continuity:0});
 const failed=f.get(),draws=structuredClone(failed.operation.draws);
 assert.deepEqual(failed.history,before.history);assert.deepEqual(failed.pressure,before.pressure);assert.deepEqual(failed.criticalMargins,before.criticalMargins);
 assert.equal(f.messages.length,1);assert.equal(failed.operation.replies['resolution:0'],undefined);
 assert.deepEqual(failed.operation.narrativeStages,{narration:2,continuity:2});
 assert.deepEqual(failed.operation.narrativeRejections,[{stage:'narration',reason:'Empty narration'},{stage:'narration',reason:'Model returned non-text output'}]);
 const reloaded=new m.AdventureEngine(f.adapter,f.e.ai,()=>{throw Error('dice rerolled');});await reloaded.retry();
 assert.deepEqual(counts,{narration:3,continuity:1});assert.equal(f.get().status,'idle');assert.equal(f.messages.length,3);
 assert.deepEqual(f.get().rngAudit.slice(-draws.length).map(({turnId,...d})=>d),draws);
 assert.deepEqual(f.get().criticalMargins,[2]);assert.equal(f.get().arc.turn_count,3);
});
