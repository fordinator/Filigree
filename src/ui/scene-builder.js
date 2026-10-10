import {parseSceneBank,PRESETS,selectScene,buildNarrativePrompt,createArc} from '../core/scenes.js';
import {newCampaign} from '../core/campaign.js';
import {STATS} from '../core/rules.js';
import {el,button,row,field,modal,download,pickFile,confirmAction} from './elements.js';

export async function sceneBuilder(app) {
 const origin=app.adapter.id();
 const view=modal('Scene builder');let bank=structuredClone(await app.selectedBank()),path=[],advanced=false,jsonInput=null;
 const readEditor=()=>{bank=parseSceneBank(advanced&&jsonInput?jsonInput.value:JSON.stringify(bank));return bank;};
 const safe=fn=>async()=>{view.error.textContent='';try{await fn();}catch(e){view.fail(e);}};
 const valueAt=parts=>parts.reduce((v,k)=>v[k],bank);
 const saveText=(parent,key,input)=>{parent[key]=input.type==='number'?Number(input.value):input.type==='checkbox'?input.checked:input.value;};
 const preset=el('select',{'aria-label':'Scene preset'},...PRESETS.map(x=>el('option',{value:x,text:x})));
 preset.value=app.adapter.settings().preset||'scenes';
 const tools=row(
  preset,button('Load preset',safe(async()=>{if(!await confirmAction('Replace editor contents','Unsaved editor changes will be replaced. Campaigns are not changed.','Load preset'))return;bank=await app.loadPreset(preset.value);path=[];render();})),
  button('Import bank',safe(async()=>{const text=await pickFile('.json',2_000_000);if(text!==null){bank=parseSceneBank(text);path=[];render();}})),
  button('Export bank',safe(()=>download('filigree-scene-bank.json',JSON.stringify(readEditor(),null,2)))),
  button('Advanced JSON',safe(()=>{readEditor();advanced=!advanced;path=[];render();}))
 );
 const body=el('div'),saveStatus=el('p',{role:'status'});
 const apply=async current=>{
  readEditor();
  if(current) {
    if(!await confirmAction('Apply bank to this adventure','Keep active narrative context and the story compass. Replace scene material and reset optional cue repetition memory and old rewind checkpoints. Legacy objective metadata is not enforced. Export first if you want to return to the old bank.','Apply scene bank'))return;
    if(app.adapter.id()!==origin)throw Error('Chat changed; reopen the scene builder');
    await app.perform(()=>app.engine.dispatch({type:'bank',bank}));if(app.error)throw Error(app.error);
  } else {
    const settings=app.adapter.settings();settings.customBank=structuredClone(bank);settings.preset=preset.value;app.adapter.saveSettings();
  }
  saveStatus.textContent=current?'Scene bank applied to this adventure.':'Default scene bank saved for future adventures.';
 };
 view.body.append(el('p',{text:'Authoring view: contains hidden plot material. Every field is editable; legacy fields are preserved on export.'}),tools,body,
  row(button('Save for future adventures',safe(()=>apply(false))),button('Apply to current adventure',safe(()=>apply(true)),{disabled:!app.engine.state()||app.engine.busy})),
  button('Preview scene prompt',safe(()=>{
    readEditor();
    const c=newCampaign(Object.fromEntries(STATS.map(s=>[s,0])),'manual',bank);
    c.arc=createArc(bank,{},min=>min);const scene=selectScene(c,'opening',min=>min);
    const preview=modal('Scene prompt preview');preview.body.append(el('p',{text:'Preview only. No model request or campaign change.'}),el('pre',{class:'dm-preview',text:buildNarrativePrompt(c,{kind:'opening'},scene)}));
  })),saveStatus);
 function render() {
  body.replaceChildren();
  if(advanced) {
    const input=jsonInput=el('textarea',{class:'dm-json',rows:14,value:JSON.stringify(bank,null,2)});
    body.append(field('Scene bank JSON',input),button('Validate JSON',safe(()=>{bank=parseSceneBank(input.value);view.error.textContent='';saveStatus.textContent='Valid scene bank.';})));
    return;
  }
  const node=valueAt(path),crumb=row(button('Bank root',()=>{path=[];render();}),...path.map((p,i)=>button(String(p),()=>{path=path.slice(0,i+1);render();})));
  body.append(crumb);
  for(const [key,value] of Object.entries(node)) {
    const label=String(key),line=el('div',{class:'dm-editor-row'});
    if(value!==null&&typeof value==='object')line.append(button(label+' ('+(Array.isArray(value)?value.length+' entries':Object.keys(value).length+' fields')+')',()=>{path.push(key);render();}));
    else {
      const input=typeof value==='number'?el('input',{type:'number',value}):typeof value==='boolean'?el('input',{type:'checkbox',checked:value}):el('textarea',{value:value??'',rows:2});
      input.addEventListener('input',()=>saveText(node,key,input));line.append(field(label,input));
    }
    const controls=row();
    if(Array.isArray(node)) {
      const index=Number(key);
      controls.append(button('Move up',()=>{[node[index-1],node[index]]=[node[index],node[index-1]];render();},{disabled:index===0,'aria-label':'Move entry '+(index+1)+' up'}),
        button('Move down',()=>{[node[index+1],node[index]]=[node[index],node[index+1]];render();},{disabled:index===node.length-1,'aria-label':'Move entry '+(index+1)+' down'}),
        button('Duplicate',()=>{node.splice(index+1,0,structuredClone(value));render();},{'aria-label':'Duplicate entry '+(index+1)}));
    }
    controls.append(button('Delete',safe(async()=>{if(await confirmAction('Delete '+label,'Remove this entry from the editor draft? This does not change a saved campaign until applied.','Delete entry')){if(Array.isArray(node))node.splice(Number(key),1);else delete node[key];render();}}),{class:'dm-danger','aria-label':'Delete '+label}));
    line.append(controls);body.append(line);
  }
  const type=el('select',{'aria-label':'New value type'},...['text','list','object','number','boolean'].map(x=>el('option',{value:x,text:x})));
  const name=el('input',{type:'text',placeholder:'Field name','aria-label':'New field name'});
  body.append(row(...(Array.isArray(node)?[]:[name]),type,button('Add entry',safe(()=>{
    const key=Array.isArray(node)?node.length:name.value.trim();
    if(!Array.isArray(node)&&(!key||['__proto__','prototype','constructor'].includes(key)||Object.hasOwn(node,key)))throw Error('Choose a unique, non-empty field name');
    node[key]=type.value==='list'?[]:type.value==='object'?{}:type.value==='number'?0:type.value==='boolean'?false:'';
    render();
  }))));
 }
 render();return view;
}
