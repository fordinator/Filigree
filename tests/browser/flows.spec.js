import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async({page})=>{await page.goto('/');});
async function manual(page) {
 await page.getByRole('button',{name:'New adventure',exact:true}).click();
 await page.getByRole('button',{name:'Create character',exact:true}).click();
 await page.getByLabel('STR value').fill('3');
 await page.getByRole('button',{name:'Review character'}).click();
 await page.getByRole('button',{name:'Confirm character'}).click();
 await page.getByLabel('Character description').fill('A tired courier.');
 await page.getByRole('button',{name:'Begin adventure'}).click();
 await expect(page.getByRole('button',{name:'Look at the gate.',exact:true})).toBeVisible();
}
test('manual character -> action -> roll -> reload -> conclude',async({page})=>{
 await manual(page);
 await page.getByRole('button',{name:'STR +3',exact:true}).click();
 await page.getByLabel('Your action').fill('I force open the gate.');
 await page.getByRole('button',{name:'Send action',exact:true}).click();
 await expect(page.getByRole('button',{name:/Roll STR vs DV/})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:/Roll STR vs DV/})).toBeVisible();
 await page.getByRole('button',{name:/Roll STR vs DV/}).click();
 await expect(page.getByLabel('Your action')).toBeVisible();
 await page.getByRole('button',{name:'End adventure',exact:true}).click();
 await page.getByRole('button',{name:'Write the ending',exact:true}).click();
 await expect(page.getByText('Adventure concluded.',{exact:true})).toBeVisible();
});
test('Cancel Adventure clears campaign state and draft without narrating an ending',async({page})=>{
 await manual(page);
 await page.evaluate(async()=>{await testApp.adapter.saveDraft({step:'choose',method:null,index:0,stats:{},dice:null,customize:false,description:'',cardNarrator:false});});
 await page.getByRole('button',{name:'Cancel Adventure',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Cancel Adventure',exact:true}).click();
 await expect(page.getByRole('button',{name:'New adventure',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state())).toBeNull();
 expect(await page.evaluate(()=>testApp.adapter.draft())).toBeNull();
 expect(await page.evaluate(()=>testApp.text)).toBe('');
 expect(await page.evaluate(()=>testApp.stat)).toBeNull();
 expect(await page.locator('#chat article')).toHaveCount(1);
 await page.reload();
 await expect(page.getByRole('button',{name:'New adventure',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state())).toBeNull();
});

test('Cancel Adventure confirmation can be declined and cannot clear after a chat switch',async({page})=>{
 await manual(page);
 await page.getByRole('button',{name:'Cancel Adventure',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
 expect(await page.evaluate(()=>testApp.engine.state())).not.toBeNull();
 await page.getByRole('button',{name:'Cancel Adventure',exact:true}).click();
 await page.evaluate(()=>{testApp.adapter.context().chatId='other';});
 await page.getByRole('dialog').getByRole('button',{name:'Cancel Adventure',exact:true}).click();
 await expect(page.locator('#filigree-panel [role="alert"]')).toContainText(/chat changed/i);
 expect(await page.evaluate(()=>testApp.engine.state())).not.toBeNull();
});

test('new-adventure card DM choice is opt-in and survives draft reload',async({page})=>{
 await page.getByRole('button',{name:'New adventure',exact:true}).click();
 await page.getByRole('button',{name:'Create character',exact:true}).click();
 await page.getByRole('button',{name:'Review character'}).click();
 await page.getByRole('button',{name:'Confirm character'}).click();
 const choice=page.getByRole('checkbox',{name:'Use DM as Dungeon Master'});
 await expect(choice).not.toBeChecked();await choice.check();
 await page.reload();await page.getByRole('button',{name:'Resume character draft'}).click();
 await expect(page.getByRole('checkbox',{name:'Use DM as Dungeon Master'})).toBeChecked();
 await page.getByRole('button',{name:'Skip description'}).click();
 await expect(page.getByLabel('Your action')).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state().narrator)).toEqual({mode:'card',avatar:'DM.png'});
});
test('rolled character sign constraints and draft reload',async({page})=>{
 await page.getByRole('button',{name:'New adventure',exact:true}).click();
 await page.getByRole('button',{name:'Roll character',exact:true}).click();
 await page.getByRole('button',{name:'Customize signs',exact:true}).click();
 await page.getByRole('button',{name:/Flip die 1/}).click();
 await expect(page.getByRole('button',{name:'Keep stat',exact:true})).toBeDisabled();
 await page.reload();await page.getByRole('button',{name:'Resume character draft',exact:true}).click();
 await expect(page.getByRole('button',{name:'Keep stat',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:/Flip die 1/}).click();
 await page.getByRole('button',{name:'Keep stat',exact:true}).click();
 await expect(page.getByRole('heading',{name:/DEX/})).toBeVisible();
});
test('scene builder edits data, rejects malformed JSON and exports',async({page})=>{
 await page.getByRole('button',{name:'Scene builder',exact:true}).first().click();
 await expect(page.getByLabel('Scene preset').locator('option')).toHaveCount(1);
 await expect(page.getByLabel('Scene preset').locator('option')).toHaveText('scenes');
 await page.getByRole('button',{name:'Advanced JSON',exact:true}).click();
 await page.getByLabel('Scene bank JSON').fill('{broken');
 await page.getByRole('button',{name:'Validate JSON',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).not.toBeEmpty();
});
test('keyboard, narrow layout and accessibility with active campaign',async({page})=>{
 await page.setViewportSize({width:320,height:850});await manual(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
 const results=await new AxeBuilder({page}).include('#filigree-panel').analyze();
 expect(results.violations).toEqual([]);
 await page.screenshot({path:'test-results/active-mobile.png',fullPage:true});
});
test('advanced scene edits save without a separate validate click',async({page})=>{
 await page.getByRole('button',{name:'Scene builder',exact:true}).first().click();
 await page.getByRole('button',{name:'Advanced JSON',exact:true}).click();
 const input=page.getByLabel('Scene bank JSON');
 const bank=JSON.parse(await input.inputValue());bank.title='A saved custom world';
 await input.fill(JSON.stringify(bank));
 await page.getByRole('button',{name:'Save for future adventures',exact:true}).click();
 expect(await page.evaluate(()=>testApp.adapter.settings().customBank.title)).toBe('A saved custom world');
 await input.fill('{broken');
 await page.getByRole('button',{name:'Save for future adventures',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).not.toBeEmpty();
});
test('scene bank can be applied to the current idle adventure',async({page})=>{
 await manual(page);
 await page.getByRole('button',{name:'Scene builder',exact:true}).first().click();
 await expect(page.getByRole('button',{name:'Apply to current adventure',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Apply to current adventure',exact:true}).click();
 await page.getByRole('button',{name:'Apply scene bank',exact:true}).click();
 await expect(page.getByText('Scene bank applied to this adventure.',{exact:true})).toBeVisible();
});
test('edited narration remains fenced after page reload',async({page})=>{
 await manual(page);
 await page.evaluate(async()=>{
  const c=testApp.adapter.context();c.chat.find(x=>!x.is_user).mes='Changed story';await c.saveChat();
  await c.eventSource.emit(c.eventTypes.MESSAGE_EDITED);
 });
 await expect(page.getByRole('button',{name:'Restore before changed turn'})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('button',{name:'Restore before changed turn'})).toBeVisible();
 await expect(page.getByLabel('Your action')).toHaveCount(0);
});
test('older edited narration gives an explicit backup recovery route',async({page})=>{
 await manual(page);
 await page.evaluate(async()=>{
   const state=testApp.engine.state();state.checkpoints=[];await testApp.adapter.save(state);
   const c=testApp.adapter.context();c.chat.find(x=>!x.is_user).mes+=' Changed ending.';await c.saveChat();
   await c.eventSource.emit(c.eventTypes.MESSAGE_EDITED);
 });
 await expect(page.getByText(/older than the retained checkpoints/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Restore before changed turn'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Import campaign',exact:true})).toBeEnabled();
});
test('complete rolled wizard and dark dialog accessibility',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});
 await page.getByRole('button',{name:'New adventure',exact:true}).click();
 await page.getByRole('button',{name:'Roll character',exact:true}).click();
 const results=await new AxeBuilder({page}).include('.dm-dialog').analyze();expect(results.violations).toEqual([]);
 for(let i=0;i<6;i++)await page.getByRole('button',{name:'Keep stat',exact:true}).click();
 await page.getByRole('button',{name:'Confirm character'}).click();
 await page.getByRole('button',{name:'Skip description'}).click();
 await expect(page.getByLabel('Your action')).toBeVisible();
 await page.screenshot({path:'test-results/active-dark.png',fullPage:true});
});
test('cancel generation preserves story and allows explicit retry',async({page})=>{
 await manual(page);
 await page.evaluate(()=>{
  globalThis.originalRequest=testApp.engine.ai.request;
  testApp.engine.ai.request=async(type,messages,options)=>type==='creativity'?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true})):originalRequest(type,messages,options);
 });
 await page.getByLabel('Your action').fill('I force the gate.');
 await page.getByRole('button',{name:'Send action',exact:true}).click();
 await page.getByRole('button',{name:'Cancel generation',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry action',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>testApp.engine.state().history.length)).toBe(1);
 await page.evaluate(()=>{testApp.engine.ai.request=originalRequest;});
 await page.getByRole('button',{name:'Retry action',exact:true}).click();
 await expect(page.getByRole('button',{name:/Roll DEX vs DV/})).toBeVisible();
});

test('CV +2 requests a roll; ledger survives reload and helper failure retries without republishing',async({page})=>{
 await manual(page);
 const openingLedger=await page.evaluate(()=>testApp.engine.state().ledger);
 await page.evaluate(()=>{
  const original=testApp.engine.ai.request;
  globalThis.failLedger=true;globalThis.turnNarrations=0;
  testApp.engine.ai.request=async(type,...args)=>{
   if(type==='cv')return {cv:2};
   if(type==='narration'){turnNarrations++;return 'The witness confesses, then starts crying. What do you do now?';}
   if(type==='continuity'){
    if(failLedger)throw Error('ledger offline');
    return activeReply({actions:['Watch the witness.'],ledger:activeLedger({direction:'Protect the witness.',threads:['Her husband may retaliate.'],recentEvents:['The witness confessed.','The witness is crying.'],lastBeat:'Her confession identified the thief.'})});
   }
   return original(type,...args);
  };
 });
 await page.getByLabel('Your action').fill('I demand a confession.');
 await page.getByRole('button',{name:'Send action',exact:true}).click();
 await expect(page.getByRole('button',{name:/Roll DEX vs DV/})).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state().pending.cv)).toBe(2);
 await page.getByRole('button',{name:/Roll DEX vs DV/}).click();
 await expect(page.getByRole('button',{name:'Retry action',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>testApp.engine.state().ledger)).toEqual(openingLedger);
 expect(await page.locator('#chat article').count()).toBe(1);
 await page.evaluate(()=>{failLedger=false;});
 await page.getByRole('button',{name:'Retry action',exact:true}).click();
 await expect(page.getByRole('button',{name:'Watch the witness.',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>turnNarrations)).toBe(1);
 expect(await page.locator('#chat article').count()).toBe(3);
 await page.reload();
 expect(await page.evaluate(()=>testApp.engine.state().ledger.recentEvents)).toContain('The witness is crying.');
 await expect(page.getByRole('button',{name:'Watch the witness.',exact:true})).toBeVisible();
 await expect(page.locator('#chat')).not.toContainText('lastChange');
});

test('legacy authored metadata roundtrips but never becomes an enforced tracker',async({page})=>{
 await manual(page);
 const before=await page.evaluate(()=>testApp.engine.state().ledger);
 await page.getByRole('button',{name:'Scene builder',exact:true}).first().click();
 const fileChooser=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Import bank',exact:true}).click();
 await (await fileChooser).setFiles('tests/fixtures/legacy-objective-bank.json');
 await expect(page.getByRole('button',{name:/objective_tracker \(/})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export bank',exact:true}).click();
 const exported=await download;
 const {readFile}=await import('node:fs/promises');
 const bank=JSON.parse(await readFile(await exported.path(),'utf8'));
 expect(bank.objective_tracker.mode).toBe('authored');expect(bank.objective_tracker.objectives).toHaveLength(3);
 await page.getByRole('button',{name:'Apply to current adventure',exact:true}).click();
 await page.getByRole('button',{name:'Apply scene bank',exact:true}).click();
 await expect(page.getByText('Scene bank applied to this adventure.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state().ledger)).toEqual(before);
 await page.getByRole('button',{name:'Close Scene builder',exact:true}).click();
 await page.reload();
 expect(await page.evaluate(()=>testApp.engine.state().bank.objective_tracker)).toEqual(bank.objective_tracker);
 await page.getByRole('button',{name:'Look at the gate.',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>testApp.engine.state().arc.turn_count)).toBe(2);
 expect(await page.evaluate(()=>testApp.engine.state().objectiveTrack)).toBeNull();
});

test('hard coherence rejection reloads with exact dice and publishes only accepted prose',async({page})=>{
 await manual(page);
 await page.evaluate(()=>{
  const original=testApp.engine.ai.request;globalThis.auditCount=0;
  testApp.engine.ai.request=async(type,...args)=>{const r=await original(type,...args);if(type==='continuity'){auditCount++;return {...r,audit:{issues:[{kind:'continuity',evidence:'A gate opens',reason:'The gate was already open; this contradicts the active scene.'}]}};}return r;};
 });
 await page.getByLabel('Your action').fill('I break the binding.');await page.getByRole('button',{name:'Send action',exact:true}).click();
 await page.getByRole('button',{name:/Roll DEX vs DV/}).click();
 await expect(page.getByRole('button',{name:'Retry action',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>auditCount)).toBe(2);
 expect(await page.locator('#chat article').count()).toBe(1);
 const dice=await page.evaluate(()=>testApp.engine.state().operation.draws.slice(0,8).map(x=>x.value));
 await page.reload();await page.getByRole('button',{name:'Retry action',exact:true}).click();
 await expect(page.getByLabel('Your action')).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state().lastTurn.roll.dice)).toEqual(dice);
 expect(await page.locator('#chat article').count()).toBe(3);
});

test('failed critical at budget uses historical victory, publishes one ending, and survives reload',async({page})=>{
 await manual(page);
 await page.evaluate(async()=>{const c=testApp.engine.state();c.arc.turn_count=c.arc.turn_budget;c.criticalMargins=[8];await testApp.adapter.save(c);});
 await page.getByLabel('Your action').fill('I resolve the gate conflict.');await page.getByRole('button',{name:'Send action',exact:true}).click();
 await expect(page.getByRole('button',{name:/Roll DEX vs DV/})).toBeVisible();
 await page.evaluate(async()=>{const c=testApp.engine.state();c.pending.dv=0;await testApp.adapter.save(c);});
 await page.getByRole('button',{name:/Roll DEX vs DV/}).click();
 await expect(page.getByText('Adventure concluded.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state().lastTurn.roll.margin)).toBe(-2);
 expect(await page.evaluate(()=>testApp.engine.state().lastTurn.finale.result)).toBe('victory');
 expect(await page.locator('#chat article').count()).toBe(3);
 await page.reload();await expect(page.getByText('Adventure concluded.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state().criticalMargins)).toEqual([8,-2]);
});
test('manual ending preserves Python zero-average history defeat',async({page})=>{
 await manual(page);
 await page.evaluate(async()=>{const c=testApp.engine.state();c.criticalMargins=[4,-4];await testApp.adapter.save(c);});
 await page.getByRole('button',{name:'End adventure',exact:true}).click();await page.getByRole('button',{name:'Write the ending',exact:true}).click();
 await expect(page.getByText('Adventure concluded.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state().lastTurn.finale)).toMatchObject({result:'defeat',successPercent:50});
 expect(await page.evaluate(()=>testApp.engine.state().actions)).toEqual([]);
});
test('ordinary pressure draw survives audit failure, reload and retry without an extra committed update',async({page})=>{
 await manual(page);
 await page.evaluate(async()=>{
  const c=testApp.engine.state();c.pressure={chance:90,turns:5};await testApp.adapter.save(c);
  const original=testApp.engine.ai.request;
  testApp.engine.ai.request=async(type,...args)=>{if(type==='cv')return {cv:2};if(type==='continuity')throw Error('pressure audit offline');return original(type,...args);};
 });
 await page.getByLabel('Your action').fill('I demand access.');await page.getByRole('button',{name:'Send action',exact:true}).click();
 await page.getByRole('button',{name:/Roll DEX vs DV/}).click();await expect(page.getByRole('button',{name:'Retry action',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>testApp.engine.state().pressure)).toEqual({chance:90,turns:5});
 expect(await page.locator('#chat article').count()).toBe(1);
 await page.reload();await page.evaluate(()=>{testApp.engine.rng=()=>{throw Error('pressure rerolled');};});
 await page.getByRole('button',{name:'Retry action',exact:true}).click();await expect(page.getByLabel('Your action')).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state().pressure)).toEqual({chance:0,turns:0});
 expect(await page.evaluate(()=>testApp.engine.state().lastTurn.pressure)).toMatchObject({triggered:true,suppressed:false});
 expect(await page.evaluate(()=>testApp.engine.state().criticalMargins)).toEqual([]);
 expect(await page.locator('#chat article').count()).toBe(3);
});

test('warehouse examine-and-follow discovers next lead, stays playable and survives reload',async({page})=>{
 await manual(page);
 await page.evaluate(async()=>{
  const c=testApp.engine.state();
  c.objectiveTrack={status:'active',objectives:[{id:'trail',title:'Find the next lead',success:'Discover where the drag marks lead.',failure:'The trail is lost permanently.',required:true,status:'active'}],facts:[{id:'marks',kind:'knowledge',value:'Drag marks run behind the warehouse.'}]};
  await testApp.adapter.save(c);const original=testApp.engine.ai.request;globalThis.scenarioCounts={resolution:0,narration:0,continuity:0};
  testApp.engine.ai.request=async(type,...args)=>{
   if(type in scenarioCounts)scenarioCounts[type]++;
   if(type==='cv')return {cv:1};
   if(type==='resolution')throw Error('Obsolete resolver should not run');
   if(type==='narration')return 'You examine the drag marks and follow them to a cellar hatch. You can investigate below or seek another approach. What do you do now?';
   if(type==='continuity')return activeReply({ledger:activeLedger({direction:'Investigate the cellar or choose another approach.',recentEvents:['Drag marks lead to a cellar hatch.'],lastBeat:'The next lead is discovered.'}),actions:['Inspect the hatch.']});
   return original(type,...args);
  };
 });
 await page.getByLabel('Your action').fill('Examine the drag marks and follow them.');await page.getByRole('button',{name:'Send action',exact:true}).click();
 await expect(page.getByRole('button',{name:'Inspect the hatch.',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>scenarioCounts)).toEqual({resolution:0,narration:1,continuity:1});
 expect(await page.evaluate(()=>testApp.engine.state().status)).toBe('idle');
 expect(await page.locator('#chat article').count()).toBe(3);
 await page.reload();await expect(page.getByLabel('Your action')).toBeVisible();
 expect(await page.evaluate(()=>testApp.engine.state().objectiveTrack.objectives.map(o=>o.status))).toEqual(['active']);
 expect(await page.evaluate(()=>testApp.engine.state().ledger.direction)).toMatch(/another approach/);
});


test('pacing warning permits player tangent without goal changes or a blocked turn',async({page})=>{
 await manual(page);
 await page.evaluate(()=>{
  const original=testApp.engine.ai.request;globalThis.narrations=0;
  testApp.engine.ai.request=async(type,...args)=>{
   if(type==='cv')return {cv:1};
   if(type==='narration'){narrations++;return 'You sit down and talk about the guard’s family. Nothing else changes.';}
   if(type==='continuity')return activeReply({ledger:activeLedger({direction:'A conversation about family.'}),audit:{issues:[{kind:'pacing',evidence:'Nothing else changes.',reason:'Possible repeated-limbo pattern; offer a relevant response, not bigger stakes.'}]}});
   return original(type,...args);
  };
 });
 await page.getByLabel('Your action').fill('Forget the gate for now. Tell me about your family.');
 await page.getByRole('button',{name:'Send action',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>testApp.engine.state().arc.turn_count)).toBe(2);
 expect(await page.evaluate(()=>narrations)).toBe(1);
 expect(await page.evaluate(()=>testApp.engine.state().narrativeHint)).toMatch(/Possible repeated/);
 expect(await page.evaluate(()=>testApp.engine.state().status)).toBe('idle');
 await page.reload();expect(await page.evaluate(()=>testApp.engine.state().ledger.direction)).toBe('A conversation about family.');
});

test('existing campaign metadata and annotations migrate without losing the story',async({page})=>{
 await manual(page);
 await page.evaluate(()=>{
   const raw=JSON.parse(localStorage.getItem('filigree-harness'));
   raw.metadata.dmbotAdventure=raw.metadata.filigree;delete raw.metadata.filigree;
   raw.settings.dmbotAdventure={enabled:true,preset:'dmbot-ULTRA'};delete raw.settings.filigree;
   for(const message of raw.chat)if(message.extra?.filigree){message.extra.dmbot=message.extra.filigree;delete message.extra.filigree;}
   localStorage.setItem('filigree-harness',JSON.stringify(raw));
 });
 await page.reload();
 await expect(page.getByLabel('Your action')).toBeVisible();
 expect(await page.evaluate(()=>testApp.adapter.settings().preset)).toBe('scenes');
 await page.getByLabel('Your action').fill('I ask who guards the crossing.');
 await page.getByRole('button',{name:'Send action',exact:true}).click();
 await expect(page.getByRole('button',{name:/Roll DEX vs DV/})).toBeVisible();
 expect(await page.evaluate(()=>{const m=SillyTavern.getContext().chatMetadata;return [!!m.filigree,!!m.dmbotAdventure];})).toEqual([true,true]);
});
