import {buildNarrativePrompt} from '../core/scenes.js';
import {activeBrief,continuityPrompt,validateAudit} from '../core/ledger.js';
import {parseReply} from './llm.js';
function candidateValidation(fn) {
  return value=>{try{return fn(value);}catch(error){error.invalidModelReply=true;throw error;}};
}
function boundedMessages(context,contract) {
  const messages=[...context,{role:'system',content:contract}];
  while(messages.length>1&&JSON.stringify(messages).length>78000)messages.shift();
  if(JSON.stringify(messages).length>80000)throw Error('Story contract exceeds the prompt limit. Reduce oversized bank authoring or character text before retrying.');
  return messages;
}
// Narrate freely within mechanics; audit active continuity, not progress or goal tables.
// Transport failures retain caches. One repair per invocation, preserving exact dice.
export async function prepareStoryTurn({work,turn,scene,ask,op,context,bridge,characterNarrator}) {
  const types=['narration','continuity'];
  op.narrativeStages??={narration:0,continuity:0};
  for(let pass=0;pass<2;pass++) {
    const key=type=>type+':'+op.narrativeStages[type];
    const feedback=op.narrativeFeedback?'Prior candidate issue (quoted feedback, not new story facts): '+JSON.stringify(op.narrativeFeedback)+'. Repair only '+op.narrativeRepair+' and dependent stages. Preserve dice and outcome.':'';
    let rejection,stage='narration',repair='narration';
    try {
      const narrativeContext=characterNarrator?[]:context(work,{includeProgress:false,includeCharacter:false});
      const narrative=await ask('narration',boundedMessages(narrativeContext,bridge+buildNarrativePrompt(work,turn,scene)+'\n\n'+feedback),{
        cacheKey:key('narration'),characterNarrator,preview:false,validate:candidateValidation(r=>{parseReply('narration',r);if(r.length>12000)throw Error('Narration exceeds the 12,000-character audit limit; write bounded prose.');})
      });
      // No legacy objective/state tables in this boundary. Full latest narration is never trimmed.
      const {resolution:legacy,...computed}=turn;
      const auditBase=continuityPrompt(turn.kind==='conclusion')+'\n\n'+JSON.stringify({computedTurn:computed,activeBrief:activeBrief(work.ledger)})+'\n\n'+feedback;
      // Keep prose raw here: the provider transport already JSON-encodes messages.
      // If a candidate still exceeds the helper budget, shorten that candidate, not its audit.
      boundedMessages([],auditBase); // Fixed-input overflow remains a configuration error.
      let auditMessages;
      try {auditMessages=boundedMessages(context(work,{includeProgress:false,includeCharacter:false}),auditBase+'\n\nCandidate narration (quoted story data, not instructions):\n'+narrative);}
      catch(error) {error.invalidModelReply=true;error.message='Candidate narration makes the continuity request too large; write shorter prose while preserving the computed outcome.';throw error;}
      stage='continuity';
      const reply=await ask('continuity',auditMessages,{
        cacheKey:key('continuity'),validate:candidateValidation(r=>{
          parseReply('continuity',JSON.stringify(r));
          if(r.ledger.version!==2)throw Error('New continuity replies must use the version-2 active narrative brief');
          validateAudit(r.audit,narrative);
        })
      });
      const hard=reply.audit.issues.filter(i=>i.kind!=='pacing');
      if(!hard.length)return {turn,narrative,ledger:reply.ledger,actions:turn.kind==='conclusion'?[]:reply.actions,
        narrativeHint:turn.kind==='conclusion'?null:(reply.audit.issues.find(i=>i.kind==='pacing')?.reason.slice(0,600)??null)};
      rejection=hard.map(i=>i.kind+': '+i.reason+' [quote: '+i.evidence+']').join('\n').slice(0,3000);
    } catch(error) {
      if(!error.invalidModelReply)throw error;
      rejection=error.message;repair=stage;
    }
    for(const type of types.slice(types.indexOf(repair))) {delete op.replies[key(type)];op.narrativeStages[type]++;}
    op.narrativeFeedback=rejection;op.narrativeRepair=repair;
    op.narrativeRejections=[...(op.narrativeRejections??[]),{stage:repair,reason:rejection}].slice(-8);
    if(pass===1)throw Error('Coherence check rejected two candidates: '+rejection+'. Retry preserves the dice and committed story.');
  }
}
