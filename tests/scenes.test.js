import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
const m=await import('../src/core/scenes.js').catch(()=>({}));
const run=(n,...a)=>{ assert.equal(typeof m[n],'function',n+' implemented'); return m[n](...a); };
const bank={metadata:{name:'Test'},story:{turn_budget:{min:22,max:32}},scene_cues:{situations:['A','B'],details:['C']},prompt_text:{base:['Be concrete.'],kinds:{opening:['Begin.']},length:['Limit {word_limit} words.']}};
test('bank parser preserves extra author fields and rejects invalid structure',()=>{
  assert.deepEqual(run('parseSceneBank',JSON.stringify({...bank,custom:{notes:'Keep'}})).custom,{notes:'Keep'});
  assert.throws(()=>run('parseSceneBank','[]'),/object/);
  assert.throws(()=>run('parseSceneBank',JSON.stringify({...bank,story:{turn_budget:{min:32,max:22}}})),/turn_budget/);
  assert.throws(()=>run('parseSceneBank','{"__proto__":{"polluted":true}}'),/key/);
  assert.throws(()=>run('parseSceneBank',JSON.stringify({...bank,scene_cards:{common:{focus:'fragments.missing'}}})),/reference/);
});
test('cue selection avoids recently used entries',()=>{
  const c={bank,recentCues:['A'],arc:{turn_count:0,turn_budget:22},recentCards:[],faded:{}};
  assert.deepEqual(run('selectScene',c,'opening',()=>0).cues,['B','C']);
  assert.deepEqual(run('selectScene',c,'success',()=>0).cues,[]);
});
test('manual story and phase inference do not reveal plot in visible controls',()=>{
  const b={...bank,story:{...bank.story,manual_compass:{premise:'P',pressure:'Q',anchors:['R'],movements:['Start','Middle','End'],possible_ending:'Done',target_turns:25}}};
  const a=run('createArc',b,{},()=>0);
  assert.equal(a.premise,'P'); assert.equal(a.turn_budget,25);
  assert.equal(run('phaseForArc',{...a,turn_count:8}).id,'act2');
  assert.equal(run('phaseForArc',{...a,turn_count:200}).id,'act3');
  assert.equal(run('phaseForArc',{...a,turn_count:2},{status:'active',objectives:[{status:'completed'},{status:'active'}]}).id,'act1');
});
test('the only bundled bank is the usable general default',async()=>{
  assert.deepEqual((await readdir(new URL('../presets/',import.meta.url))).filter(name=>name.endsWith('.json')),['scenes.json']);
  const b=run('parseSceneBank',await readFile(new URL('../presets/scenes.json',import.meta.url),'utf8'));
  assert.ok(b.metadata);
});
test('narration prompts include intent, outcome contracts, author text, and definite ending',()=>{
  const c={bank:{...bank,trivial_contracts:{'4':'Reveal a useful detail.'}},character:{stats:{STR:1},description:'Courier'},arc:{premise:'P',pressure:'Q',anchors:[],movements:['A','B','C'],turn_budget:22,turn_count:1},recentNotes:[]};
  const text=run('buildNarrativePrompt',c,{kind:'success',action:'Look around',trivial:4,summary:'Result 4/4',cv:0},{cues:[],card:{}});
  assert.match(text,/Reveal a useful detail/); assert.match(text,/Look around/);
  assert.match(run('buildNarrativePrompt',c,{kind:'conclusion',summary:'victory'},{cues:[],card:{}}),/Do not end with a question/);
});

test('CV ±2 narration carries triggered pressure, bounded escalation and earned success',()=>{
 const c={bank,character:{stats:{STR:0},description:'Courier'},pending:{stat:'CHA'},arc:{premise:'Find the parcel',pressure:'Departure',anchors:['Gate'],movements:['A','B','C'],turn_budget:22,turn_count:3},recentNotes:[],ledger:{objective:'Recover the parcel.',stakes:['The courier loses her job.'],facts:['The witness is hiding her husband.'],lastChange:'The witness is cornered.'}};
 for(const cv of [-2,2]) {
  const text=run('buildNarrativePrompt',c,{kind:'critical',action:'Demand a confession',cv,roll:{outcome:'Good success'},summary:'Good success',pressure:{triggered:true,suppressed:false}},{cues:[],card:{}});
  assert.match(text,/Roll-Bearing Action/);assert.doesNotMatch(text,/Minor State Change/);
  assert.match(text,/Pressure triggered \(advisory pacing permission\)/);assert.match(text,/omission is not an error/);
  assert.match(text,/witness is hiding her husband/);assert.match(text,/Do not negate success/);
  assert.match(text,/stat's value is descriptive only/);
  assert.match(text,/smallest consequence that honestly resolves/);assert.match(text,/no unearned power/);assert.match(text,/Transformations require established causal permission/);
  assert.doesNotMatch(text,/not an ending gate|not a random pacing twist|keep the change local/);
 }
 const critical=run('buildNarrativePrompt',c,{kind:'critical',cv:5,roll:{outcome:'Bad failure'},summary:'Bad failure',pressure:{triggered:true,suppressed:true}},{cues:[],card:{}});
 assert.match(critical,/Critical Action/);assert.doesNotMatch(critical,/Scene pressure triggered/);
});

test('Python arc phases are soft budget-relative suggestions, independent of legacy goals',()=>{
 const arc={turn_budget:10,movements:['Arrive','Develop','Converge']};
 for(const [turn_count,expected] of [[0,'act1'],[2,'act1'],[3,'act2'],[6,'act2'],[7,'act3'],[20,'act3']])assert.equal(run('phaseForArc',{...arc,turn_count},{status:'failed'},'success').id,expected);
 assert.equal(run('phaseForArc',{...arc,turn_count:1},null,'conclusion').id,'act3');
});
