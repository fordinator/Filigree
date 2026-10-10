import test from 'node:test';
import assert from 'node:assert/strict';
const m=await import('../src/services/llm.js').catch(()=>({}));
const parse=(type,text)=>{assert.equal(typeof m.parseReply,'function','Parser implemented');return m.parseReply(type,text);};
test('structured parsing handles fences but rejects invalid CV/check shape',()=>{
 assert.deepEqual(parse('cv','```json\n{"cv":-5}\n```'),{cv:-5});
 assert.throws(()=>parse('cv','{"cv":9}'),/CV/);assert.throws(()=>parse('cv','{"cv":"5"}'),/CV/);
 assert.throws(()=>parse('check','{"stat":"POW","dv":2}'),/stat/);
 assert.throws(()=>parse('check','{"stat":"DEX","dv":8}'),/DV/);
 assert.throws(()=>parse('actions','{"actions":[4]}'),/actions/);
});
test('YES matching is exact, not a substring in prose',()=>{
 assert.equal(parse('creativity','YES'),true);assert.equal(parse('death','NO'),false);
 assert.throws(()=>parse('death','Yesterday, no.'),/YES or NO/);
});
test('native streaming updates preview with accumulated text and aborts via signal',async()=>{
 assert.equal(typeof m.LlmService,'function','Service implemented');
 const previews=[];const svc=new m.LlmService(()=>({mainApi:'openai'}),async()=>({sendOpenAIRequest:async(type,messages,signal)=>{assert.equal(type,'normal');assert.ok(signal);return async function*(){yield{text:'A'};yield{text:'A gate.'};};}}));
 const reply=await svc.request('narration',[{role:'system',content:'Narrate'}],{signal:new AbortController().signal,onText:s=>previews.push(s)});
 assert.equal(reply,'A gate.');assert.deepEqual(previews,['A','A gate.']);
});
test('card narration uses native chat-context quiet generation and never the raw request',async()=>{
 const calls=[];const svc=new m.LlmService(()=>({mainApi:'openai',generateQuietPrompt:async options=>{calls.push(options);return 'The red moon rises.';}}),async()=>{throw Error('raw request was used');});
 const previews=[];const reply=await svc.request('narration',[{role:'system',content:'Preserve the character voice and honor the roll.'}],{signal:new AbortController().signal,onText:text=>previews.push(text),characterNarrator:true});
 assert.equal(reply,'The red moon rises.');
 assert.equal(calls.length,1);assert.match(calls[0].quietPrompt,/honor the roll/);
 assert.deepEqual(previews,['The red moon rises.']);
});

test('continuity validation retries malformed model data and never streams private ledger JSON as prose',async()=>{
 const ledger={objective:'Recover parcel',stakes:['The courier loses her job.'],facts:['The parcel was stolen.'],lastChange:'The thief fled.'};
 let attempts=0;const previews=[];
 const svc=new m.LlmService(()=>({mainApi:'openai'}),async()=>({sendOpenAIRequest:async(type)=>{
  assert.equal(type,'quiet');attempts++;
  const text=JSON.stringify(attempts===1?{actions:[],ledger:{facts:'broken'}}:{actions:[],ledger});
  return async function*(){yield {text};};
 }}));
 const result=await svc.request('continuity',[{role:'system',content:'Record the story.'}],{onText:s=>previews.push(s)});
 assert.equal(attempts,2);assert.deepEqual(result.ledger,ledger);assert.deepEqual(previews,[]);
});

for(const failure of ['generation','abort','preview'])test('card '+failure+' exceptions retain identity and are not invalid model replies',async()=>{
 const error=new Error(failure==='generation'?'Transport offline':failure);const controller=new AbortController();let calls=0;
 const svc=new m.LlmService(()=>({generateQuietPrompt:async()=>{calls++;if(failure==='generation')throw error;if(failure==='abort')controller.abort(error);return 'Valid prose.';}}));
 await assert.rejects(()=>svc.request('narration',[{role:'system',content:'Narrate.'}],{characterNarrator:true,signal:controller.signal,onText:()=>{if(failure==='preview')throw error;}}),e=>{assert.equal(e,error);assert.equal(e.invalidModelReply,undefined);return true;});
 assert.equal(calls,1);
});
