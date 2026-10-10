import { integer, STATS } from '../core/rules.js';
import { safeParse, object } from '../core/scenes.js';
import { validateLedger } from '../core/ledger.js';
export function parseReply(type,text) {
  if(typeof text!=='string')throw new Error('Model returned non-text output');
  if(type==='narration') {if(!text.trim())throw new Error('Empty narration');return text.trim();}
  if(['creativity','uniqueness','death'].includes(type)) {
    const answer=text.trim().toUpperCase().replace(/[.!]$/,'');
    if(!['YES','NO'].includes(answer))throw new Error('Expected exactly YES or NO');return answer==='YES';
  }
  const data=safeParse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''),100000);
  if(!object(data))throw new Error('Expected a JSON object');
  if(type==='cv')integer(data.cv,-7,7,'CV');
  if(type==='check') {if(!STATS.includes(data.stat))throw new Error('Invalid stat');integer(data.dv,-7,7,'DV');}
  if(['actions','continuity'].includes(type)&&(!Array.isArray(data.actions)||data.actions.length>3||data.actions.some(x=>typeof x!=='string')))throw new Error('Invalid actions list');
  if(type==='continuity')validateLedger(data.ledger);
  if(type==='compass') {
    for(const key of ['premise','pressure','possible_ending'])if(typeof data[key]!=='string'||!data[key].trim())throw new Error('Invalid compass '+key);
    for(const key of ['anchors','movements'])if(!Array.isArray(data[key])||data[key].some(x=>typeof x!=='string'))throw new Error('Invalid compass '+key);
    if(data.movements.length!==3||data.anchors.length<1||data.anchors.length>4)throw new Error('Invalid compass lengths');
    integer(data.target_turns,1,200,'target_turns');
  }
  return data;
}
function extract(data) {
  const content=data?.choices?.[0]?.message?.content??data?.content??data?.completion;
  if(typeof content==='string')return content;
  if(Array.isArray(content))return content.filter(x=>x.type==='text').map(x=>x.text).join('');
  throw new Error('Provider returned no readable content');
}
export class LlmService {
  constructor(context=()=>SillyTavern.getContext(),native=()=>import('/scripts/openai.js')) {this.context=context;this.native=native;}
  async request(type,messages,{signal,onText=()=>{},characterNarrator=false}={}) {
    if(JSON.stringify(messages).length>80000)throw new Error('Prompt exceeds the 80,000-character safety limit. Reduce the scene bank or character description before retrying.');
    const abort=new AbortController();
    const stop=()=>abort.abort(signal?.reason);
    signal?.addEventListener('abort',stop,{once:true});
    if(signal?.aborted)stop();
    const timer=setTimeout(()=>abort.abort(new Error('Model request timed out after 180 seconds')),180000);
    try {
      const c=this.context(),attempts=type==='narration'?1:3;
      if(type==='narration'&&characterNarrator) {
        if(typeof c.generateQuietPrompt!=='function')throw new Error('This SillyTavern version cannot generate with the selected character card');
        const cancel=()=>c.stopGeneration?.();
        abort.signal.addEventListener('abort',cancel,{once:true});
        try {
          abort.signal.throwIfAborted();
          const raw=await c.generateQuietPrompt({quietPrompt:messages.at(-1)?.content||'',quietToLoud:true});
          abort.signal.throwIfAborted();
          let reply;
          try {reply=parseReply(type,raw);}
          catch(error) {error.invalidModelReply=true;throw error;}
          onText(reply);return reply;
        } finally {abort.signal.removeEventListener('abort',cancel);}
      }
      for(let attempt=0;attempt<attempts;attempt++) {
        abort.signal.throwIfAborted();
        let raw;
        if(c.mainApi==='openai') {
          const native=await this.native();
          if(typeof native.sendOpenAIRequest!=='function')throw new Error('This SillyTavern version does not expose the chat-completion adapter');
          const result=await native.sendOpenAIRequest(type==='narration'?'normal':'quiet',messages,abort.signal);
          if(typeof result==='function') {
            raw='';for await(const chunk of result()) {abort.signal.throwIfAborted();raw=chunk.text;if(type==='narration')onText(raw);}
          } else raw=extract(result);
        } else {
          // generateRaw has no AbortSignal argument. Stop via the native lifecycle event.
          const cancel=()=>c.eventSource.emit(c.eventTypes.GENERATION_STOPPED);
          abort.signal.addEventListener('abort',cancel,{once:true});
          try {raw=await c.generateRaw({prompt:messages,trimNames:false});}
          finally {abort.signal.removeEventListener('abort',cancel);}
          abort.signal.throwIfAborted();if(type==='narration')onText(raw);
        }
        try {return parseReply(type,raw);}
        catch(error) {if(attempt===attempts-1){error.invalidModelReply=true;throw error;}messages=[...messages,{role:'system',content:'Your previous response was invalid: '+error.message+'. Return only the requested format.'}];}
      }
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',stop);}
  }
}
