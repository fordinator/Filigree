// Descriptive working memory, not objectives, scores, or an exhaustive world model.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=(s,max)=>typeof s==='string'&&!!s.trim()&&s.length<=max;
const list=(xs,count)=>Array.isArray(xs)&&xs.length<=count&&xs.every(s=>text(s,400));
const exact=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(v,k));
export function validateLedger(value) {
  const modern=value?.version===2;
  const valid=modern
    ? exact(value,['version','scene','cast','recentEvents','threads','direction','lastBeat'])&&text(value.scene,800)&&list(value.cast,6)&&list(value.recentEvents,6)&&list(value.threads,6)&&text(value.direction,400)&&text(value.lastBeat,600)
    : exact(value,['objective','stakes','facts','lastChange'])&&text(value.objective,400)&&list(value.stakes,4)&&list(value.facts,16)&&text(value.lastChange,600);
  if(!valid)throw Error('Invalid plot ledger / active narrative brief: use bounded descriptive text and lists');
  return value;
}
export function activeBrief(value) {
  if(value==null)return null;
  validateLedger(value);
  if(value.version===2)return structuredClone(value);
  return {version:2,scene:(value.facts.join(' ')||'Refer to the recent transcript.').slice(0,800),cast:[],recentEvents:value.facts.slice(-6),threads:[...value.stakes],direction:value.objective,lastBeat:value.lastChange};
}
export function validateAudit(audit,narrative) {
  if(!exact(audit,['issues'])||!Array.isArray(audit.issues)||audit.issues.length>6)throw Error('Coherence audit needs an issues array (0–6)');
  for(const issue of audit.issues) {
    if(!exact(issue,['kind','reason','evidence'])||!['mechanics','continuity','agency','pacing'].includes(issue.kind)||!text(issue.reason,800)||!text(issue.evidence,1200))throw Error('Invalid coherence issue: kind, reason and evidence required');
    if(issue.kind!=='pacing'&&!narrative.includes(issue.evidence))throw Error('Hard audit evidence must quote the candidate narrative exactly');
  }
  return audit;
}
export function continuityPrompt(concluded=false) {
  return [
    'Read the candidate narration and extract a compact ACTIVE narrative brief. Record what was actually narrated, not plans, guessed secrets, desired progress or new consequences.',
    'Return JSON: {"actions":["trivial observation"],"ledger":{"version":2,"scene":"current place and situation","cast":["relevant character and current situation"],"recentEvents":["recent established event"],"threads":["currently relevant tension or unanswered question"],"direction":"loose present focus, not a goal contract","lastBeat":"what happened, including quiet or unchanged situations"},"audit":{"issues":[{"kind":"mechanics|continuity|agency|pacing","reason":"specific concern with its prior evidence","evidence":"exact quote from candidate narration"}]}}.',
    'Brief bounds: scene 800 characters; cast/recentEvents/threads 0–6 strings each, each 400; direction 400; lastBeat 600. Empty lists are valid. Keep only currently relevant elements; update, summarize or drop stale threads freely. A player-led tangent can replace the focus without resolving or failing any prior thread. No objective IDs, immutable goals, required milestones, complete state tables or mandatory before/after changes.',
    'Audit ONLY explicit mechanical contradictions (including binding finale), clear unexplained contradictions of active/recent established facts, and invented player decisions/actions. Causally narrated changes are allowed. Cite the conflicting established fact or computed outcome in reason and copy an exact candidate quote into evidence. Uncertainty or omitted old detail is not proof of a contradiction. No issues means {"issues":[]}. At most six issues; reasons 800 chars, evidence 1200.',
    'Pacing is ADVISORY, never a veto. Only flag a repeated-limbo pattern if recent substantive attempts repeatedly leave the same predicament with another almost/soon beat and no useful answer, response or choice. Compare recent turns: a single quiet beat, deliberate rest, repetition requested by the player, dialogue, tangents, absence of a lasting change, or ignoring scene-bank suggestions is NOT an error. A pacing concern asks for a different relevant response at the SAME scale, not escalating danger or forcing a prescribed route.',
    'Audit the story, not compliance with legacy tracker instructions, plot hits or cue checklists. Preserve the player’s earned action result without demanding a new fact each turn. Distinguish the final action outcome from the code-computed overall ending: both can legitimately differ. A forced finale must close now; unresolved mysteries may remain and bad endings are valid.',
    concluded?'The adventure is concluded. Record its final scene and return "actions": [].':
      'Suggest 1–3 short button labels (fewer than 8 words) for observation/orientation/tiny preparation only. No consequential actions, obstacle crossings, taking valuable objects, confrontation, or skill checks.'
  ].join('\n\n');
}
