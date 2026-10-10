import {AdventureEngine} from './engine.js';
import {SillyTavernAdapter,annotatedTurn} from './adapters/sillytavern.js';
import {LlmService} from './services/llm.js';
import {STATS,signed} from './core/rules.js';
import {parseSceneBank} from './core/scenes.js';
import {characterWizard} from './ui/wizard.js';
import {sceneBuilder} from './ui/scene-builder.js';
import {el,button,row,field,modal,confirmAction,download,pickFile} from './ui/elements.js';

export function boot({adapter=new SillyTavernAdapter(),ai=new LlmService(),rootURL=new URL('../',import.meta.url)}={}) {
 const engine=new AdventureEngine(adapter,ai),subscriptions=[];
 const app={adapter,engine,rootURL,working:false,error:'',text:'',stat:null,conflict:null};
 const panel=el('section',{id:'filigree-panel',class:'dm-ui','aria-label':'Filigree adventure'});
 const container=document.querySelector('#form_sheld')||document.querySelector('#extensions_settings2')||document.body;
 container.prepend(panel);
 const settings=el('section',{class:'dm-ui','aria-label':'Filigree settings'});
 const enabled=el('input',{type:'checkbox',checked:adapter.settings().enabled!==false});
 enabled.addEventListener('change',()=>{engine.cancel();adapter.settings().enabled=enabled.checked;adapter.saveSettings();app.render();});
 settings.append(el('h3',{text:'Filigree'}),el('p',{class:'dm-note',text:'Filigree: A Narrative RPG.'}),field('Enable Filigree controls',enabled),button('Scene builder',()=>app.perform(()=>sceneBuilder(app))),el('p',{class:'dm-note',text:'Use a separate solo DM character chat. Your existing API connection is used; no new API key is needed.'}));
 (document.querySelector('#extensions_settings2')||document.querySelector('#extensions_settings')||document.body).append(settings);
 app.loadPreset=async name=>{
   if(!/^[\w.-]+$/.test(name))throw Error('Invalid preset name');
   const res=await fetch(new URL('presets/'+name+'.json',rootURL));if(!res.ok)throw Error('Could not load scene preset');
   return parseSceneBank(await res.text());
 };
 app.selectedBank=async()=>adapter.settings().customBank?parseSceneBank(JSON.stringify(adapter.settings().customBank)):app.loadPreset(adapter.settings().preset||'scenes');
 app.perform=async fn=>{
   if(app.working)return;app.working=true;app.error='';app.render();
   try{return await fn();}catch(error){app.error=error.message||String(error);}
   finally{app.working=false;reconcile();}
 };
 adapter.status=text=>{const node=panel.querySelector('[data-status]');if(node)node.textContent=text;};
 adapter.preview=text=>{const node=panel.querySelector('[data-preview]');if(node){node.textContent=text;node.hidden=!text;}};
 const doAction=fn=>()=>app.perform(fn);
 app.render=()=>{
   const state=engine.state(),active=adapter.settings().enabled!==false&&!!adapter.id()&&!adapter.context().groupId;
   panel.hidden=!active;document.body.classList.toggle('dm-active',active&&!!state);
   const focused=panel.contains(document.activeElement)?document.activeElement?.getAttribute('aria-label'):null;
   panel.replaceChildren();
   if(!active)return;
   panel.setAttribute('aria-busy',String(app.working));
   panel.append(row(el('h2',{text:'Filigree'}),button('Scene builder',doAction(()=>sceneBuilder(app)),{disabled:app.working})),el('p',{class:'dm-note',text:'Filigree: A Narrative RPG.'}));
   const error=el('p',{class:'dm-error',role:'alert',text:app.error});
   panel.append(error,el('p',{'data-status':'',role:'status',text:app.working?'Working…':''}),el('div',{'data-preview':'',class:'dm-preview',hidden:true,'aria-label':'Streaming narration'}));
   if(!state) {
     panel.append(el('p',{text:'A character, a local problem, and whatever you decide to do next.'}),
       button(adapter.draft()?'Resume character draft':'New adventure',doAction(()=>characterWizard(app)),{disabled:app.working}),
       button('Import campaign',doAction(()=>importCampaign()),{disabled:app.working}));
     return;
   }
   const stats=row(...STATS.map(stat=>button(stat+' '+signed(state.character.stats[stat]),()=>{app.stat=app.stat===stat?null:stat;app.render();panel.querySelector('textarea')?.focus();},{'aria-pressed':app.stat===stat,disabled:state.status!=='idle'||app.working||!!state.operation||!!app.conflict})));
   panel.append(stats);
   if(app.conflict) {
     const canRestore=state.checkpoints.some(x=>x.turnId===app.conflict);
     panel.append(el('p',{text:'A Filigree narration was edited, swiped, or deleted. Gameplay is paused to keep the rules and story consistent.',class:'dm-error'}));
     if(canRestore)panel.append(button('Restore before changed turn',doAction(async()=>{
         if(await confirmAction('Restore campaign checkpoint','Restore game state before the changed turn. Existing chat text remains as an abandoned branch; it is not erased.','Restore checkpoint')){
           await engine.rewind(app.conflict);app.conflict=null;
         }
       }),{disabled:app.working}));
     else panel.append(el('p',{text:'This change is older than the retained checkpoints. Restore the original chat text, or export this state and import a known-good campaign backup using Campaign tools.'}));
   } else if(state.operation) {
     panel.append(el('p',{text:'An action was interrupted. Retry keeps its recorded dice and completed evaluations.'}),
       row(button('Retry action',doAction(()=>engine.retry()),{disabled:app.working}),button('Discard interrupted action',doAction(async()=>{
         if(await confirmAction('Discard interrupted action','Keep the last committed story and discard this unfinished action?','Discard action'))await engine.discardInterrupted();
       }),{disabled:app.working,class:'dm-danger'})));
   } else if(state.outbox?.length) {
     panel.append(button('Recover saved narration',doAction(()=>engine.flushOutbox()),{disabled:app.working}));
   } else if(state.status==='awaitingDescription') {
     const input=el('textarea',{value:app.text,rows:3,oninput:e=>{app.text=e.target.value;}});
     panel.append(field('Character description',input),button('Begin adventure',doAction(()=>engine.describe(app.text)),{disabled:app.working}));
   } else if(state.status==='awaitingRoll') {
     const p=state.pending;
     panel.append(el('p',{text:(Math.abs(p.cv)>=5?'Critical action: ':'Roll-bearing action: ')+p.action}),
       el('p',{text:p.stat+' '+signed(state.character.stats[p.stat])+' | DV '+p.dv+' | CV '+signed(p.cv)+' | FV '+signed(p.fv.value)+' ('+(p.fv.reasons.join(', ')||'None')+')'}),
       row(button('Roll '+p.stat+' vs DV '+p.dv,doAction(()=>engine.roll()),{disabled:app.working}),
         button('Cancel check',doAction(()=>engine.dispatch({type:'cancelCheck'})),{disabled:app.working})));
   } else if(state.status==='idle') {
     panel.append(row(...state.actions.map((action,index)=>button(action,doAction(()=>engine.incidental(index)),{disabled:app.working}))));
     const input=el('textarea',{'aria-label':'Your action',value:app.text,maxLength:12000,rows:2,disabled:app.working,oninput:e=>{app.text=e.target.value;}});
     const send=doAction(async()=>{await engine.act(app.text,app.stat);app.text='';app.stat=null;});
     input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}});
     panel.append(field('Your action'+(app.stat?' using '+app.stat:''),input),button('Send action',send,{disabled:app.working}),el('p',{class:'dm-note',text:'Enter sends; Shift+Enter adds a line. Stat buttons choose an approach, not a guaranteed roll.'}));
   } else {
     panel.append(el('p',{text:'Adventure concluded.'}),button('New adventure',doAction(()=>characterWizard(app)),{disabled:app.working}));
   }
   const more=el('details',{},el('summary',{text:'Campaign tools'}),row(
     button('Export campaign',()=>download('filigree-campaign.json',JSON.stringify(engine.state(),null,2)),{disabled:app.working}),
     button('Export transcript',()=>download('filigree-transcript.md',state.history.map(x=>'## '+x.role+'\n\n'+x.content).join('\n\n'),'text/markdown'),{disabled:app.working}),
     button('Import campaign',doAction(()=>importCampaign()),{disabled:app.working}),
     button('End adventure',doAction(async()=>{if(await confirmAction('End adventure','Write a definitive ending from the established story and computed results?','Write the ending'))await engine.conclude();}),{disabled:app.working||state.status==='concluded'||state.status==='awaitingDescription'||!!state.operation||!!app.conflict}),
     button('Cancel Adventure',doAction(async()=>{
       const origin=adapter.id(),epoch=engine.epoch;
       if(await confirmAction('Cancel Adventure','Erase all Filigree game state for this chat without writing an ending? Chat messages remain, but the campaign, draft, import backup, and local controls reset.','Cancel Adventure')){
         if(adapter.id()!==origin||engine.epoch!==epoch)throw Error('Chat changed during adventure cancellation; no campaign was cleared');
         await adapter.clearAdventure();
         app.text='';app.stat=null;app.conflict=null;
       }
     }),{disabled:app.working,class:'dm-danger'})
   ));
   // Keep tools discoverable without making them dominate the story.
   more.open=true;panel.append(more);
   if(app.working)panel.append(button('Cancel generation',()=>{engine.cancel();},{class:'dm-danger'}));
   if(focused)Array.from(panel.querySelectorAll('[aria-label]')).find(x=>x.getAttribute('aria-label')===focused)?.focus();
 };
 async function importCampaign() {
   const origin=adapter.id(),epoch=engine.epoch;
   const text=await pickFile();if(text===null)return;
   if(adapter.id()!==origin||engine.epoch!==epoch)throw Error('Chat changed during file selection');
   if(await confirmAction('Import campaign','Replace the campaign state in this chat? A copy of the current state is retained in chat metadata. Existing transcript text is not deleted.','Import campaign')){
     if(adapter.id()!==origin||engine.epoch!==epoch)throw Error('Chat changed during import confirmation');
     await engine.importCampaign(text);app.conflict=null;
   }
 }
 const context=adapter.context();
 const bind=(name,fn)=>{const event=context.eventTypes?.[name];if(event){context.eventSource.on(event,fn);subscriptions.push([event,fn]);}};
 bind('CHAT_CHANGED',()=>{engine.cancel();app.text='';app.stat=null;app.conflict=null;document.querySelectorAll('.dm-dialog').forEach(x=>x.close());reconcile();});
 const reconcile=()=>{
   const state=engine.state();app.conflict=null;
   if(!state||app.working){app.render();return;}
   const chat=adapter.context().chat;
   for(const canonical of state.history.slice(state.importedHistoryLength||0).filter(x=>x.role==='assistant')) {
     if(state.outbox?.some(x=>x.turnId===canonical.turnId))continue;
     const message=chat.find(x=>annotatedTurn(x)===canonical.turnId&&!x.is_user);
     const expected=canonical.content+(canonical.summary?'\n\n---\n'+canonical.summary:'');
     if(!message||message.mes!==expected) {app.conflict=canonical.turnId;break;}
   }
   app.render();
 };
 for(const name of ['MESSAGE_SWIPED','MESSAGE_DELETED','MESSAGE_EDITED'])bind(name,()=>{if(app.working)engine.cancel();reconcile();});
 globalThis.filigreeInterceptor=(_chat,_size,abort,type)=>{
   if(adapter.settings().enabled!==false&&engine.state()&&!adapter.context().groupId&&!['quiet'].includes(type)) {
     abort(true);app.error='Use the Filigree action controls. Native regeneration and swipes do not resolve Filigree mechanics.';app.render();
   }
 };
 app.destroy=()=>{
   engine.cancel();for(const [event,fn] of subscriptions)context.eventSource.removeListener(event,fn);
   panel.remove();settings.remove();document.body.classList.remove('dm-active');delete globalThis.filigreeInterceptor;
 };
 reconcile();return app;
}
