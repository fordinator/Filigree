// Run ONLY against a disposable, credential-free ST process on the reserved test port.
import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:18766');
 await page.waitForFunction(()=>globalThis.filigreeApp);
 // First-run profile setup belongs only to this disposable test data root.
 const welcome=page.locator('dialog[open]').filter({has:page.locator('.onboarding')});
 if(await welcome.waitFor({state:'visible',timeout:10000}).then(()=>true,()=>false)) {
   await welcome.locator('textarea.popup-input').fill('Playtester');
   const saved=page.waitForResponse(r=>r.url().endsWith('/api/settings/save')&&r.status()===200);
   await welcome.locator('.popup-button-ok').click();await saved;
 }
 console.log('onboarding',await page.locator('body').innerText().then(x=>x.slice(-500)));
 const created=await page.evaluate(async()=>{
   const c=SillyTavern.getContext(),body=new FormData();
   body.append('ch_name','Filigree smoke DM');body.append('description','Test DM');body.append('first_mes','Test session.');
   const headers=c.getRequestHeaders();delete headers['Content-Type'];
   const r=await fetch('/api/characters/create',{method:'POST',headers,body});return {status:r.status,text:await r.text()};
 });console.log('create',created);expect(created.status).toBe(200);
 await page.reload();await page.waitForFunction(()=>SillyTavern.getContext().characters.length>0);
 await page.evaluate(avatar=>{const c=SillyTavern.getContext();return c.selectCharacterById(String(c.characters.findIndex(x=>x.avatar===avatar)));},created.text);
 await expect(page.getByRole('button',{name:'New adventure',exact:true})).toBeVisible();
 await page.evaluate(()=>{
   filigreeApp.engine.ai={request:async(type)=>type==='narration'?'The gate opens. What do you do now?':({compass:{premise:'Gate',pressure:'Rain',anchors:['Gate'],movements:['A','B','C'],possible_ending:'Home',target_turns:22},continuity:{audit:{issues:[]},actions:['Look at the gate.'],ledger:{version:2,scene:'The gate is open.',cast:[],recentEvents:['The gate opened.'],threads:['Find shelter.'],direction:'Pass the gate.',lastBeat:'The gate opened.'}},creativity:false,uniqueness:false,cv:{cv:5},check:{stat:'DEX',dv:2},death:false}[type])};
   filigreeApp.engine.rng=min=>min;
 });
 await page.getByRole('button',{name:'New adventure',exact:true}).click();
 await page.getByRole('button',{name:'Create character',exact:true}).click();
 await page.getByLabel('STR value').fill('3');
 await page.getByRole('button',{name:'Review character'}).click();
 await page.getByRole('button',{name:'Confirm character'}).click();
 await page.getByRole('button',{name:'Skip description'}).click();
 await expect(page.getByLabel('Your action')).toBeVisible({timeout:20000});
 await page.getByLabel('Your action').fill('I force open the gate.');
 await page.getByRole('button',{name:'Send action',exact:true}).click();
 await expect(page.getByRole('button',{name:/Roll DEX vs DV/})).toBeVisible({timeout:20000});
 await page.reload();
 await page.waitForFunction(()=>SillyTavern.getContext().characters.length>0);
 await page.evaluate(avatar=>{const c=SillyTavern.getContext();return c.selectCharacterById(String(c.characters.findIndex(x=>x.avatar===avatar)));},created.text);
 await expect(page.getByRole('button',{name:/Roll DEX vs DV/})).toBeVisible({timeout:20000});
 const evidence=await page.evaluate(()=>({status:filigreeApp.engine.state().status,stats:filigreeApp.engine.state().character.stats,nativeMessages:SillyTavern.getContext().chat.filter(x=>x.extra?.filigree).length,appInstances:document.querySelectorAll('#filigree-panel').length}));
 await page.getByRole('button',{name:/Roll DEX vs DV/}).click({trial:true});
 await page.screenshot({path:'test-results/real-st-desktop.png',fullPage:true});
 expect(evidence.status).toBe('awaitingRoll');expect(evidence.stats.STR).toBe(3);expect(evidence.nativeMessages).toBe(1);expect(evidence.appInstances).toBe(1);expect(errors).toEqual([]);
 console.log('Actual SillyTavern smoke PASS',evidence);
}finally{await browser.close();}
