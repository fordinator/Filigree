import {STATS,createRollDraft,flipRollDie,validateSignedRoll,manualCharacter,signed} from '../core/rules.js';
import {el,button,row,field,modal,confirmAction} from './elements.js';
export async function characterWizard(app) {
 const id=app.adapter.id();app.adapter.assertSolo();
 const view=modal('New adventure'), bank=await app.selectedBank();
 let draft=app.adapter.draft()||{step:'choose',method:null,index:0,stats:{},dice:null,customize:false,description:'',cardNarrator:false};
 let saving=false;
 const guard=()=>{if(app.adapter.id()!==id)throw Error('Chat changed; reopen character setup in the intended chat');};
 const save=async()=>{guard();await app.adapter.saveDraft(draft);guard();};
 const perform=async(fn)=>{if(saving)return;saving=true;view.error.textContent='';try{guard();await fn();await save();render();}catch(e){view.fail(e);}finally{saving=false;}};
 const nextRoll=()=>{draft.dice=createRollDraft();draft.customize=false;draft.step='roll';};
 const render=()=>{
  view.body.replaceChildren();
  if(draft.step==='choose') {
    view.body.append(el('p',{text:'Choose how to build your character. Rolled stats keep the original buff/nerf dice mechanics.'}),
      row(button('Roll character',()=>perform(()=>{draft.method='rolled';nextRoll();})),button('Create character',()=>perform(()=>{draft.method='manual';draft.stats=Object.fromEntries(STATS.map(s=>[s,0]));draft.step='manual';}))));
  } else if(draft.step==='manual') {
    const grid=el('div',{class:'dm-stats'});
    for(const stat of STATS)grid.append(field(stat+' value',el('input',{type:'number',min:-8,max:8,step:1,value:draft.stats[stat],oninput:e=>{draft.stats[stat]=e.target.value===''?null:Number(e.target.value);}})));
    view.body.append(el('p',{text:'Assign an integer from -8 to +8 to each stat.'}),grid,button('Review character',()=>perform(()=>{manualCharacter(draft.stats);draft.step='review';})));
  } else if(draft.step==='roll') {
    const stat=STATS[draft.index],total=draft.dice.reduce((a,b)=>a+b,0),valid=draft.dice.filter(x=>x>0).length===2;
    view.body.append(el('p',{text:'Stat '+(draft.index+1)+' of 6'}),el('h3',{text:stat+' '+signed(total)}),el('p',{text:'Exactly two dice must buff (+), and two must nerf (−).'}),
      row(...draft.dice.map((n,i)=>button(signed(n),()=>perform(()=>{draft.dice=flipRollDie(draft.dice,i);}),{disabled:!draft.customize,'aria-label':'Flip die '+(i+1)+' ('+signed(n)+')','aria-pressed':n>0,class:'dm-die'}))),
      row(button('Customize signs',()=>perform(()=>{draft.customize=true;}),{disabled:draft.customize}),button('Keep stat',()=>perform(()=>{draft.stats[stat]=validateSignedRoll(draft.dice);draft.index++;if(draft.index===6)draft.step='review';else nextRoll();}),{disabled:!valid})));
    if(!valid)view.body.append(el('p',{text:'Choose two positive and two negative signs to continue.',class:'dm-error'}));
  } else if(draft.step==='review') {
    view.body.append(el('h3',{text:'Review your character'}),row(...STATS.map(s=>el('span',{class:'dm-badge',text:s+' '+signed(draft.stats[s])}))),
      row(button(draft.method==='rolled'?'Reroll all':'Edit stats',()=>perform(async()=>{
        if(draft.method==='rolled'){if(!await confirmAction('Reroll all stats','Replace all six rolled stats?','Reroll all'))return;draft.stats={};draft.index=0;nextRoll();}else draft.step='manual';
      })),button('Confirm character',()=>perform(()=>{draft.step='description';}))));
  } else if(draft.step==='description') {
    const input=el('textarea',{value:draft.description,maxLength:12000,rows:5,oninput:e=>{draft.description=e.target.value;}});
    const c=app.adapter.assertSolo(),cardName=c.characters[c.characterId]?.name||c.name2||'current character';
    const cardChoice=el('input',{type:'checkbox',checked:!!draft.cardNarrator,onchange:e=>perform(()=>{draft.cardNarrator=e.target.checked;})});
    const begin=async skip=>{
      if(saving)return;saving=true;view.error.textContent='';
      try{guard();await save();await app.engine.create(draft.stats,draft.method,bank,draft.cardNarrator?app.adapter.currentNarratorCard():null);await app.adapter.saveDraft(null);view.close();await app.perform(()=>app.engine.describe(skip?'':draft.description));}
      catch(e){view.fail(e);}finally{saving=false;app.render();}
    };
    view.body.append(field('Character description',input),el('p',{text:'Name, appearance, temperament, background—or skip and discover the character in play.'}),field('Use '+cardName+' as Dungeon Master',cardChoice),el('p',{text:'Narration uses this character card; Filigree still decides checks and outcomes.'}),row(button('Skip description',()=>begin(true)),button('Begin adventure',()=>begin(false))));
  }
 };
 render();return view;
}
