import test from 'node:test';
import assert from 'node:assert/strict';
const m=await import('../src/adapters/sillytavern.js').catch(()=>({}));
function setup(fail=false) {
 assert.equal(typeof m.SillyTavernAdapter,'function','Adapter implemented');
 let disk, rendered=[];
 const c={chatId:'chat',characterId:0,characters:[{avatar:'DM.png',name:'DM'}],groupId:null,chatMetadata:{},extensionSettings:{},chat:[],name1:'Player',name2:'DM',getRequestHeaders:()=>({'x-csrf-token':'test'}),saveChat:async()=>{if(!fail)disk=structuredClone(c.chatMetadata);},addOneMessage:x=>rendered.push(x)};
 const fetcher=async(url,options)=>{assert.equal(url,'/api/chats/get');assert.deepEqual(JSON.parse(options.body),{avatar_url:'DM.png',file_name:'chat'});return {ok:true,json:async()=>[{chat_metadata:disk||{}}]};};
 return {c,a:new m.SillyTavernAdapter(()=>c,fetcher),rendered};
}
test('namespace persists and verifies exact saved content',async()=>{
 const {a}=setup();await a.save({id:'c',revision:1,history:[]});assert.equal(a.load().revision,1);
});
test('swallowed native save failures cannot claim success',async()=>{
 const {a}=setup(true);await assert.rejects(()=>a.save({id:'c',revision:1}),/save|persist/i);
});
test('clearAdventure removes campaign, draft and import backup in one verified save and rolls all back on failure',async()=>{
 const ok=setup();ok.c.chatMetadata.dmbotAdventure={id:'campaign'};ok.c.chatMetadata.dmbotAdventureDraft={step:'choose'};ok.c.chatMetadata.dmbotAdventureImportBackup={id:'backup'};
 await ok.a.clearAdventure();
 assert.equal(ok.a.load(),null);assert.equal(ok.a.draft(),null);
 const saved=await ok.a.readDiskMetadata(ok.c);assert.equal(saved.dmbotAdventure,null);assert.equal(saved.dmbotAdventureDraft,null);assert.equal(saved.dmbotAdventureImportBackup,null);
 const bad=setup(true);bad.c.chatMetadata.dmbotAdventure={id:'campaign'};bad.c.chatMetadata.dmbotAdventureDraft={step:'choose'};bad.c.chatMetadata.dmbotAdventureImportBackup={id:'backup'};
 await assert.rejects(()=>bad.a.clearAdventure(),/save|persist|verified/i);
 assert.deepEqual(bad.c.chatMetadata.dmbotAdventure,{id:'campaign'});assert.deepEqual(bad.c.chatMetadata.dmbotAdventureDraft,{step:'choose'});assert.deepEqual(bad.c.chatMetadata.dmbotAdventureImportBackup,{id:'backup'});
});

test('outbox delivery is idempotent and uses ordinary native messages',async()=>{
 const {a,c,rendered}=setup();const entry={id:'turn:1',turnId:'turn',role:'assistant',content:'Gate.',summary:'Margin +3'};
 await a.publish([entry]);await a.publish([entry]);
 assert.equal(c.chat.length,1);assert.equal(rendered.length,1);assert.match(c.chat[0].mes,/Gate/);assert.equal(c.chat[0].is_user,false);
});
test('adapter refuses groups and missing character context',async()=>{
 const {a,c}=setup();c.groupId='group';await assert.rejects(()=>a.save({}),/solo/);c.groupId=null;c.characterId=undefined;await assert.rejects(()=>a.save({}),/character/);
});
test('card narrator context follows live card fields but rejects a different selected card',async()=>{
 const {a,c}=setup();c.getCharacterCardFields=()=>({description:'A changed description',scenario:'A changed setting'});
 const binding=a.currentNarratorCard();
 assert.deepEqual(binding,{mode:'card',avatar:'DM.png'});
 assert.match((await a.narratorCardContext(binding)).scenario,/changed setting/);
 c.characters[0].avatar='Other.png';
 await assert.rejects(()=>a.narratorCardContext(binding),/character card changed/i);
});
test('card narrator context rejects a chat switch while loading the card',async()=>{
 const {a,c}=setup();let release;
 c.unshallowCharacter=()=>new Promise(resolve=>{release=resolve;});
 c.getCharacterCardFields=()=>({description:'DM'});
 const pending=a.narratorCardContext(a.currentNarratorCard());
 c.chatId='other';release();
 await assert.rejects(()=>pending,/chat changed/i);
});

test('Filigree reads old campaign and draft, then saves under the new namespace',async()=>{
 const {a,c}=setup();
 c.chatMetadata.dmbotAdventure={id:'old',revision:1,history:[]};
 c.chatMetadata.dmbotAdventureDraft={step:'choose'};
 c.extensionSettings.dmbotAdventure={enabled:true,preset:'dmbot-ULTRA'};
 assert.equal(a.load().id,'old');assert.equal(a.draft().step,'choose');
 assert.equal(a.settings().preset,'ultra');
 await a.save({id:'new',revision:2,history:[]});
 assert.equal(c.chatMetadata.filigree.id,'new');
 assert.equal(c.chatMetadata.dmbotAdventure.id,'old');
 await a.saveDraft(null);assert.equal(a.draft(),null);
 await a.clearAdventure();
 for(const key of ['filigree','filigreeDraft','filigreeImportBackup','dmbotAdventure','dmbotAdventureDraft','dmbotAdventureImportBackup'])assert.equal(c.chatMetadata[key],null);
});
