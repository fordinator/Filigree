import {activeBrief} from './core/ledger.js';
import { STATS, integer, randomInt, rollDice, erraticFromDice, computeFlavorValue, difficulty, resolveActionRoll, trivialFromDice, cleanActions, signed, advancePressure, finaleDecision, successPercent } from './core/rules.js';
import { createArc, samplePalette, selectScene, recordScene, buildNarrativePrompt, buildCompassPrompt } from './core/scenes.js';
import { clone, newCampaign, parseCampaign, snapshot, restoreSnapshot, reduceCampaign } from './core/campaign.js';
import { prepareStoryTurn } from './services/story-turn.js';

// Bound request context independently of how long an exported adventure becomes.
export function campaignContext(c,{includeCharacter=true,includeProgress=true}={}) {
  const recent=[];let size=0,index=c.history.length;
  const historyBudget=24000;
  while(index>0&&recent.length<16) {
    const h=c.history[index-1];if(size+h.content.length>historyBudget)break;
    recent.unshift({role:h.role,content:h.content});size+=h.content.length;index--;
  }
  const earlier=c.history.slice(0,index).slice(-30).map(h=>h.role+': '+h.content.slice(0,180)).join('\n').slice(-6000);
  return [{role:'system',content:'Solo one-shot RPG. '+(includeCharacter?'Character: '+JSON.stringify(c.character)+'\n':'')+'Story compass: '+JSON.stringify(c.arc)+(includeProgress&&c.ledger?'\nActive narrative brief (descriptive, revisable focus): '+JSON.stringify(activeBrief(c.ledger)):'')+'\nRecent continuity notes: '+JSON.stringify(c.recentNotes)+(earlier?'\nEarlier transcript excerpts (incomplete; do not invent missing details):\n'+earlier:'')},...recent];
}

export class AdventureEngine {
  constructor(adapter,ai,rng=randomInt) { this.adapter=adapter;this.ai=ai;this.rng=rng;this.busy=false;this.abort=null;this.epoch=0; }
  state() { return this.adapter.load(); }
  cancel() { this.epoch++;this.abort?.abort(); }
  async create(stats,method,bank,narrator=null) {
    if(this.busy) throw new Error('An action is still running');
    const origin=this.adapter.id();
    const current=this.state();if(current&&current.status!=='concluded') throw new Error('This chat already has an adventure');
    if(narrator?.mode==='card')await this.adapter.narratorCardContext(narrator);
    if(this.adapter.id()!==origin)throw new Error('Chat changed during adventure creation');
    const state=newCampaign(stats,method,bank,narrator);await this.adapter.save(state);return state;
  }
  describe(text) { return this.run({type:'describe',text}); }
  act(text,stat=null) { return this.run({type:'act',text,stat}); }
  incidental(index) { return this.run({type:'incidental',index}); }
  roll() { return this.run({type:'roll'}); }
  conclude() { return this.run({type:'conclude'}); }
  retry() { const op=this.state()?.operation;if(!op) throw new Error('No interrupted action');return this.run(op.event,true); }
  async discardInterrupted() {
    if(this.busy) throw new Error('Cancel the running action first');
    const s=this.state();if(!s) return;s.operation=null;s.revision++;await this.adapter.save(s);
  }
  async dispatch(event) {
    if(this.busy) throw new Error('An action is still running');
    const s=this.state();if(!s) throw new Error('No active adventure');
    if(s.operation) throw new Error('Retry or discard the interrupted action first');
    await this.adapter.save(reduceCampaign(s,{...event,revision:s.revision}).campaign);
  }
  async importCampaign(text) {
    if(this.busy) throw new Error('An action is still running');
    const origin=this.adapter.id(),epoch=this.epoch,previous=this.state(),incoming=parseCampaign(text);
    if(incoming.narrator?.mode==='card')await this.adapter.narratorCardContext(incoming.narrator);
    // Imported pending network requests are never executed implicitly.
    incoming.operation=null;incoming.outbox=[];incoming.checkpoints=[];
    incoming.id=crypto.randomUUID();incoming.revision=(previous?.revision||0)+1;
    incoming.importedHistoryLength=incoming.history.length;
    await this.adapter.backup?.(previous);
    if(this.adapter.id()!==origin||this.epoch!==epoch||this.state()?.id!==previous?.id||this.state()?.revision!==previous?.revision)throw new Error('Chat changed during import; no campaign was replaced');
    await this.adapter.save(incoming);return incoming;
  }
  async rewind(turnId) {
    if(this.busy) throw new Error('An action is still running');
    const c=this.state(), index=c?.checkpoints.findIndex(x=>x.turnId===turnId);
    if(index===undefined||index<0) throw new Error('No checkpoint is available; import a saved campaign instead');
    const state=restoreSnapshot(c,c.checkpoints[index].before);
    state.checkpoints=c.checkpoints.slice(0,index);state.revision=c.revision+1;
    state.branchFence=turnId;await this.adapter.save(state);
  }
  async flushOutbox() {
    const c=this.state();if(!c?.outbox?.length)return;
    const id=this.adapter.id();
    await this.adapter.publish(c.outbox,c);
    if(this.adapter.id()!==id)throw new Error('Chat changed while publishing');
    c.outbox=[];c.revision++;await this.adapter.save(c);
  }
  async run(event,retry=false) {
    if(this.busy) throw new Error('An action is still running');
    let base=this.state();if(!base)throw new Error('Create a character first');
    if(base.outbox?.length) {await this.flushOutbox();base=this.state();}
    if(retry&&base.operation?.flowVersion!==5)throw new Error('This interrupted action belongs to an older engine. Discard it before continuing; committed story and pending checks are preserved.');
    if(base.operation&&!retry)throw new Error('Retry or discard the interrupted action first');
    if(event.type==='roll'&&base.status!=='awaitingRoll')throw new Error('No pending roll');
    if(event.type==='describe'&&base.status!=='awaitingDescription')throw new Error('Character is already described');
    if(['act','incidental'].includes(event.type)&&base.status!=='idle')throw new Error('Finish the current check first');
    if(event.type==='conclude'&&!['idle','awaitingRoll'].includes(base.status))throw new Error('No active adventure to conclude');
    if(event.type==='act') {
      if(typeof event.text!=='string'||!event.text.trim()||event.text.length>12000)throw new Error('Enter an action of 1–12000 characters');
      if(event.stat&&!STATS.includes(event.stat))throw new Error('Invalid stat');
    }
    if(event.type==='incidental')integer(event.index,0,base.actions.length-1,'Action index');
    this.busy=true;this.abort=new AbortController();const epoch=++this.epoch,id=this.adapter.id();
    const work=clone(base), op=retry?clone(base.operation):{id:crypto.randomUUID(),flowVersion:5,event:clone(event),draws:[],replies:{}};
    let drawIndex=0;
    const guard=()=>{
      if(this.epoch!==epoch||this.adapter.id()!==id||this.abort.signal.aborted)throw new Error('Action cancelled or chat changed');
      if(this.state()?.revision!==base.revision)throw new Error('Campaign changed during this action');
    };
    const draw=(min,max)=>{
      const existing=op.draws[drawIndex];
      if(existing&&(existing.min!==min||existing.max!==max))throw new Error('Retry RNG sequence no longer matches');
      const value=existing?existing.value:this.rng(min,max);integer(value,min,max,'Random draw');
      if(!existing)op.draws.push({min,max,value});drawIndex++;return value;
    };
    const checkpoint=async()=>{
      guard();base={...base,operation:clone(op),revision:base.revision+1};await this.adapter.save(base);guard();
    };
    const ask=async(type,messages,requestOptions={})=>{
      const {cacheKey=type,validate,preview=true,...options}=requestOptions;
      guard();if(Object.hasOwn(op.replies,cacheKey)){const cached=clone(op.replies[cacheKey]);validate?.(cached);return cached;}
      await checkpoint();this.adapter.status?.('Working: '+type);
      const result=await this.ai.request(type,messages,{...options,signal:this.abort.signal,onText:text=>{guard();if(preview)this.adapter.preview?.(text);}});
      guard();validate?.(result);op.replies[cacheKey]=result;return result;
    };
    try {
      let turn=null, entries=[];
      const context=options=>campaignContext(work,options);
      if(event.type==='describe') {
        work.character.description=['skip','no','n'].includes(event.text.trim().toLowerCase())?'':event.text.trim();
        work.palette=samplePalette(work.bank,draw);
        const narratorCard=work.narrator?.mode==='card'?await this.adapter.narratorCardContext(work.narrator):null;
        const cardCompass=narratorCard?'\nSillyTavern DM card: '+narratorCard.name+'\nCard description: '+narratorCard.description+'\nCard personality: '+narratorCard.personality+'\nCard scenario: '+narratorCard.scenario:'';
        let raw={};
        if(!work.bank.story?.manual_compass&&!work.bank.authoring?.story?.manual_synopsis&&!work.bank.story?.manual_synopsis) {
          try { raw=await ask('compass',[{role:'system',content:buildCompassPrompt(work.character,work.palette.story)+(narratorCard?'\nRespect the DM card setting.':'')+cardCompass}]); }
          catch(error) {guard();if(error.name==='AbortError')throw error;op.replies.compass={};}
        }
        work.arc=createArc({...work.bank,story:work.palette.story},raw,draw);turn={kind:'opening',summary:'Introduce the adventure.'};
      } else if(event.type==='act') {
        const action=event.text.trim();
        const binary=type=>ask(type,[{role:'system',content:(type==='creativity'?'You are an evaluator of player actions in a role-playing game. Your sole purpose is to determine if an action is creative. \'Creative\' means it is imaginative, clever, or not a straightforward, predictable choice.':'You are an evaluator of player actions in a role-playing game. Your sole purpose is to determine if an action is unique. \'Unique\' means it avoids common fantasy tropes and is not an action that is tried constantly by players (e.g., \'I attack the monster\', \'I look for traps\').')+' Respond with only a single word: YES or NO.\n\nPlayer action: '+action}]);
        const creative=await binary('creativity'),unique=await binary('uniqueness'),fv=computeFlavorValue(action,creative,unique);
        const ev=erraticFromDice(rollDice(4,draw));
        if(ev.triggered) {work.pressure={chance:0,turns:0};turn={kind:'erratic',action,ev:ev.ev,dice:ev.dice,summary:'ERRATIC EVENT (EV '+signed(ev.ev)+')'};}
        else {
          const {cv}=await ask('cv',[...context({includeCharacter:false}),{role:'user',content:action},{role:'system',content:'Analyze this action\'s potential to fundamentally change the current situation or advance the narrative. Classify its scale and stakes irrespective of the player’s stats, abilities, powers, equipment, backstory, or likely chance of success. CV measures what the attempt puts at stake or could change, not whether this character is capable of succeeding; the same action in the same circumstances gets the same CV for any character.\n- CV -1 to +1: minor state change, no roll. Resolve the small stated intent; a lasting plot change is not required.\n- CV -4 to -2 or +2 to +4: roll-bearing action when there is uncertainty, resistance, meaningful stakes, or opposing interests; multiple affected elements are not required.\n- CV <= -5 or >= +5: Critical Action. The action can create a major event, drastic plot change, or possible death.\nDo not classify ordinary observation, orientation, or tiny preparation as roll-bearing. Do classify attempts to cross danger, force access, confront opposition, seize key evidence, escape, expose the central truth, or resolve a major obstacle as roll-bearing or Critical when uncertain or consequential. Example: CV 6 to somersault over an alligator pit, whether the protagonist is exceptionally nimble or clumsy. Return only {"cv": integer -7..7}.'}]);
          if(Math.abs(cv)<=1) {work.pressure={chance:Math.min(100,work.pressure.chance+4),turns:work.pressure.turns+1};turn={kind:'success',action,cv,fv,summary:'The action succeeds without a roll.'};}
          else {
            const check=await ask('check',[{role:'system',content:'Your task is to determine the most logical character stat (STR, DEX, CON, INT, WIS, CHA) to use for this action, and its intrinsic difficulty. You MUST IGNORE the player\'s character, their stats, abilities, powers, equipment, and backstory, and all previous events. Your assessment must be based SOLELY on how difficult the stated action would be for a normal, average adult man or woman with all stats at +0, not this player character. Determine a base Difficulty Value (DV) from -7 (trivial for a normal person) to +7 (nearly impossible for a normal person). Return only JSON {"stat":"STR|DEX|CON|INT|WIS|CHA","dv":integer -7..7}. '+(event.stat?'Use '+event.stat+'.':'First choose the most logical stat.')+'\nAction: '+action}]);
            work.pending={action,stat:event.stat||check.stat,dv:difficulty(check.dv,cv),baseDv:check.dv,cv,fv,ev};
            work.status='awaitingRoll';
          }
        }
      } else if(event.type==='incidental') {
        const result=trivialFromDice(rollDice(2,draw));
        turn={kind:'success',action:work.actions[event.index],trivial:result.value,dice:result.dice,summary:'Trivial action result: '+result.value+'/4'};
      } else if(event.type==='roll') {
        const p=work.pending,roll=resolveActionRoll(rollDice(8,draw),work.character.stats[p.stat],p.fv.value,p.dv);
        const critical=Math.abs(p.cv)>=5;
        const pressure=advancePressure(work.pressure,roll.margin,critical,draw(1,100));
        work.pressure={chance:pressure.chance,turns:pressure.turns};
        const summary='Check '+p.stat+' '+signed(roll.stat)+' vs DV '+p.dv+' | CV '+signed(p.cv)+' | FV '+signed(p.fv.value)+' ('+(p.fv.reasons.join(', ')||'None')+')\nDice ['+roll.dice.slice(0,4).join(', ')+'] - ['+roll.dice.slice(4).join(', ')+'] + '+roll.stat+' + '+roll.fv+' = '+roll.total+'\nMargin '+signed(roll.margin)+' | '+roll.outcome;
        turn={kind:'critical',action:p.action,cv:p.cv,roll,pressure,summary};
        if(roll.outcome==='Very bad failure') {
          let fatal=false;
          try {fatal=await ask('death',[...context(),{role:'system',content:'Does this specific very bad failure plausibly and immediately kill the character? Only YES or NO.\nAction: '+p.action+'\n'+summary}]);}
          catch(error) {guard();turn.summary+='\nDeath evaluator unavailable: apply a severe nonfatal consequence.';op.replies.death=false;}
          if(fatal)turn={...turn,kind:'conclusion',finale:{result:'fatal defeat',source:'immediate-fatal'},summary:'Fatal failure. The character died as an immediate consequence.\n'+summary};
        }
        if(critical) {
          if(turn.kind!=='conclusion'&&work.arc.turn_count>=work.arc.turn_budget) {
            turn={...turn,kind:'conclusion',finale:{...finaleDecision(roll.margin,work.criticalMargins),source:'budget-critical'}};
          }
          work.criticalMargins.push(roll.margin);
        }
      } else if(event.type==='conclude') {
        turn={kind:'conclusion',summary:'Player ended the session. No Critical Action margins recorded: close honestly from established fiction, resolved goals and remaining costs.'};
        if(work.criticalMargins.length) {
          const average=work.criticalMargins.reduce((a,b)=>a+b,0)/work.criticalMargins.length;
          turn.finale={source:'manual-history',average,successPercent:successPercent(average),result:average>0?'victory':'defeat'};
          turn.summary='Player ended the session. Overall average of all genuine Critical Actions: '+average+'.';
        }
      }
      if(turn) {
        if(turn.finale)turn.summary+='\nComputed final result: '+turn.finale.result+(turn.finale.successPercent!==undefined?' ('+turn.finale.successPercent+'%)':'')+'. Resolve the final action and ending together now; no extra ordinary turn. The final action outcome and overall adventure verdict are distinct: honor both.';
        const scene=selectScene(work,turn.kind,draw,turn.cv,turn.pressure);
        const characterNarrator=work.narrator?.mode==='card';
        const narratorCard=characterNarrator?await this.adapter.narratorCardContext(work.narrator):null;
        const bridge=narratorCard?'Remain '+narratorCard.name+' as established by the current SillyTavern character card. Act as Dungeon Master in your own voice; portray the world and NPCs without taking over the player character. Filigree rules and computed outcomes below are binding.\n\n':'';
        const result=await prepareStoryTurn({work,turn,scene,ask,op,context:campaignContext,bridge,characterNarrator});
        turn=result.turn;const narrative=result.narrative;
        work.ledger=clone(result.ledger);work.narrativeHint=result.narrativeHint;
        const transcript=[...(turn.action?[{role:'user',content:turn.action}]:[]),{role:'assistant',content:narrative}];
        work.history.push(...transcript.map(x=>({...x,turnId:op.id,summary:x.role==='assistant'&&turn.kind!=='opening'?turn.summary:''})));
        recordScene(work,scene,turn);
        work.status=turn.kind==='conclusion'?'concluded':'idle';work.pending=null;work.lastTurn=turn;
        work.actions=work.status==='idle'?cleanActions(result.actions):[];
        entries=transcript.map((x,i)=>({...x,id:op.id+':'+i,turnId:op.id,summary:x.role==='assistant'&&turn.kind!=='opening'?turn.summary:''}));
        work.checkpoints=[...work.checkpoints,{turnId:op.id,before:snapshot(base)}].slice(-40);
      }
      guard();work.revision=base.revision+1;work.operation=null;work.rngAudit.push(...op.draws.map(x=>({...x,turnId:op.id})));work.outbox=entries;
      await this.adapter.save(work);
      await this.flushOutbox();
      return this.state();
    } catch(error) {
      if(this.adapter.id()===id&&this.state()?.id===base.id&&this.state()?.revision===base.revision) {
        base.operation={...clone(op),error:String(error.message||error)};base.revision++;
        await this.adapter.save(base);
      }
      throw error;
    } finally {this.busy=false;this.abort=null;this.adapter.preview?.('');this.adapter.status?.('');}
  }
}
