import {activeReply,activeLedger} from '/tests/helpers/active-story.js';
import {boot} from '/src/app.js';
import {SillyTavernAdapter} from '/src/adapters/sillytavern.js';
const storageKey='filigree-harness';
const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
const listeners=new Map();
const c={chatId:'test',characterId:0,characters:[{avatar:'DM.png',name:'DM'}],groupId:null,
 name1:'Player',name2:'DM',chat:saved.chat||[],chatMetadata:saved.metadata||{},extensionSettings:saved.settings||{},
 getCharacterCardFields:()=>({description:'A seasoned Dungeon Master',scenario:'A quiet square'}),
 eventTypes:{CHAT_CHANGED:'chat',MESSAGE_SWIPED:'swipe',MESSAGE_DELETED:'delete',MESSAGE_EDITED:'edit'},
 eventSource:{on:(event,fn)=>{if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(fn);},removeListener:(event,fn)=>listeners.set(event,(listeners.get(event)||[]).filter(x=>x!==fn)),emit:async(event,...args)=>{for(const fn of listeners.get(event)||[])await fn(...args);}},
 getRequestHeaders:()=>({}),saveChat:async()=>localStorage.setItem(storageKey,JSON.stringify({metadata:c.chatMetadata,chat:c.chat,settings:c.extensionSettings})),
 saveSettingsDebounced:()=>c.saveChat(),addOneMessage:message=>{const p=document.createElement('article');p.textContent=message.name+': '+message.mes;p.dataset.turn=message.extra?.filigree?.turnId;document.querySelector('#chat').append(p);}
};
c.chat.forEach(c.addOneMessage);globalThis.SillyTavern={getContext:()=>c};
const adapter=new SillyTavernAdapter(()=>c,async()=>({ok:true,json:async()=>[{chat_metadata:JSON.parse(localStorage.getItem(storageKey)||'{}').metadata||{}}]}));
const ai={request:async(type,messages,{signal,onText})=>{
 await new Promise(r=>setTimeout(r,20));signal.throwIfAborted();
 if(type==='narration'){onText('A gate');return 'A gate opens onto a quiet square. What do you do now?';}
 return {compass:{premise:'Gate',pressure:'Rain',anchors:['Square'],movements:['A','B','C'],possible_ending:'Home',target_turns:22},creativity:false,uniqueness:false,cv:{cv:5},check:{stat:'DEX',dv:2},death:false,continuity:activeReply({actions:['Look at the gate.','Listen for footsteps.']})}[type];
}};
globalThis.testApp=boot({adapter,ai,rootURL:new URL('/',location.href)});
globalThis.testApp.engine.rng=min=>min;

globalThis.activeReply=activeReply;globalThis.activeLedger=activeLedger;
