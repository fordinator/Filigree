import {activeBrief} from './ledger.js';
import { CV_GUIDANCE, integer, BOUNDED_ESCALATION, pacingPrompt } from './rules.js';
export const PRESETS = ['scenes','ultra','frontier','bridge-gpt','bridge-fantasy-modern','bridge-zim','hybrid','frontier-pre-vtm'];
export const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const list = x => Array.isArray(x) ? x.filter(v=>typeof v==='string'&&v.trim()) : typeof x==='string'&&x.trim() ? [x] : [];
export function safeParse(text, limit=2_000_000) {
  if (typeof text!=='string'||text.length>limit) throw new Error('JSON exceeds the import size limit');
  const data=JSON.parse(text);
  function walk(v,depth=0) {
    if(depth>30) throw new Error('JSON nesting exceeds 30 levels');
    if(v&&typeof v==='object') for(const [key,child] of Object.entries(v)) {
      if(['__proto__','constructor','prototype'].includes(key)) throw new Error('Unsafe JSON key: '+key);
      walk(child,depth+1);
    }
  }
  walk(data); return data;
}
const lookup=(bank,path)=>path.split('.').reduce((v,key)=>object(v)&&Object.hasOwn(v,key)?v[key]:undefined,bank);
export function validateSceneBank(bank) {
  if(!object(bank)) throw new Error('Scene bank must be an object');
  if(bank.schemaVersion!==undefined&&bank.schemaVersion!==1) throw new Error('Unsupported scene bank schemaVersion');
  if(!object(bank.story)&&!object(bank.authoring)&&!object(bank.scene_cues)&&!object(bank.scene_cards)) throw new Error('Expected story, authoring, scene_cues, or scene_cards');
  for(const key of ['metadata','story','authoring','scene_cues','scene_cards','fragments','prompt_text','outcome_contracts','trivial_contracts','stat_guidance']) if(bank[key]!==undefined&&!object(bank[key])) throw new Error(key+' must be an object');
  for(const source of [bank.story,bank.authoring?.story]) if(source?.turn_budget) {
    integer(source.turn_budget.min,1,200,'story.turn_budget.min');
    integer(source.turn_budget.max,source.turn_budget.min,200,'story.turn_budget.max');
  }
  for(const [key,values] of Object.entries(bank.scene_cues||{})) if(!Array.isArray(values)||values.some(v=>typeof v!=='string')) throw new Error('scene_cues.'+key+' must be a text list');
  function checkReferences(value,path) {
    if(typeof value==='string'&&/^(fragments|authoring)\./.test(value)&&lookup(bank,value)===undefined) throw new Error('Invalid scene reference at '+path+': '+value);
    if(value&&typeof value==='object') for(const [k,v] of Object.entries(value)) checkReferences(v,path+'.'+k);
  }
  checkReferences(bank.scene_cards,'scene_cards');
  const ids=new Set();
  for(const category of ['locations','npcs','objects']) {
    const entities=bank.authoring?.[category];
    if(entities!==undefined&&!Array.isArray(entities)) throw new Error('authoring.'+category+' must be a list');
    for(const entity of entities||[]) {
      if(!object(entity)) throw new Error('authoring.'+category+' entries must be objects');
      if(entity.id) { const id=category+':'+entity.id; if(ids.has(id)) throw new Error('Duplicate entity id '+id); ids.add(id); }
    }
  }
  return bank; // Legacy objective_tracker metadata is retained, not enforced or synthesized.
}
export function parseSceneBank(text) { return validateSceneBank(safeParse(text)); }
const choose=(values,rng,fallback='')=>values.length?values[rng(0,values.length-1)]:fallback;
export function createArc(bank,raw={},rng) {
  const config={...bank.story,...bank.authoring?.story}, manual=config.manual_compass;
  const seed=object(manual)?manual:config.manual_synopsis?config:raw;
  const min=config.turn_budget?.min||1,max=config.turn_budget?.max||min;
  let moves=seed.movements||seed.acts||config.movements;
  if(object(moves)) moves=['opening','developing','convergence'].map((k,i)=>choose(list(moves[k]||moves[['act1','act2','act3'][i]]),rng,['Opening','Development','Convergence'][i]));
  moves=[...list(moves), 'Opening','Development','Convergence'].slice(0,3);
  return {
    source:object(manual)||config.manual_synopsis?'authored':Object.keys(raw).length?'generated':'fallback',
    premise:seed.premise||seed.manual_synopsis||seed.synopsis||choose(list(config.premise_seeds),rng,'A local problem is about to become visible.'),
    pressure:seed.pressure||seed.central_pressure||choose(list(config.pressure_seeds),rng,'The situation worsens if nobody acts.'),
    anchors:list(seed.anchors||seed.recurring_cast||config.anchor_seeds).slice(0,4),
    movements:moves, possible_ending:seed.possible_ending||seed.conclusion||choose(list(config.possible_endings),rng,'Resolve the local outcome.'),
    turn_budget:Math.max(min,Math.min(max,Number.isInteger(seed.target_turns)?seed.target_turns:typeof seed.turn_budget==='number'?seed.turn_budget:rng(min,max))),
    turn_count:0
  };
}
export function phaseForArc(arc,track=null,kind=null) {
  const ratio=arc.turn_count/Math.max(1,arc.turn_budget);
  const i=kind==='conclusion'?2:ratio<0.30?0:ratio<0.70?1:2;
  return {id:['act1','act2','act3'][i],label:['Opening pressure','Developing consequences','Convergence'][i],movement:arc.movements?.[i]||''};
}
function fragments(bank,source) {
  return (Array.isArray(source)?source:[source]).flatMap(v=>typeof v==='string'?list(lookup(bank,v)??v):list(v));
}
export function selectScene(campaign,kind,rng,cv=0,pressure=null) {
  const {bank}=campaign, phase=phaseForArc(campaign.arc,campaign.objectiveTrack,kind), recent=campaign.recentCues||[];
  let keys=kind==='opening'?['situations','details']:kind==='erratic'?['pressures','interruptions','details']:kind==='critical'&&Math.abs(cv)>=5?['pressures','details']:[];
  if(!keys.length&&pressure?.triggered&&!pressure.suppressed&&kind!=='conclusion') keys=['developments','pressures'];
  const cueBank=campaign.palette?.scene_cues||bank.scene_cues||{};
  const cues=keys.map(k=>{const values=list(cueBank[k]);return choose(values.filter(x=>!recent.includes(x)).length?values.filter(x=>!recent.includes(x)):values,rng);}).filter(Boolean);
  const slots={...bank.scene_cards?.common,...bank.scene_cards?.by_phase?.[phase.id],...bank.scene_cards?.by_kind?.[kind]};
  const card={}; const recentCards=campaign.recentCards||[], faded=campaign.faded||{};
  for(const [slot,source] of Object.entries(slots)) {
    const author=bank.authoring?.scene_card_overrides;
    const overrides=fragments(bank,author?.[phase.id]?.[slot]??author?.[slot]);
    const all=overrides.length?overrides:fragments(bank,source);
    const available=all.filter(x=>(faded[slot]?.[x]||0)<=campaign.arc.turn_count);
    const pool=available.length?available:all;
    const unused=pool.filter(x=>!recentCards.slice(-6).some(c=>c[slot]===x));
    const value=choose(unused.length?unused:pool,rng);
    if(value) card[slot]=value;
  }
  return {cues,card,phase};
}
export function samplePalette(bank,rng) {
  const sample=(values,count)=>{const pool=[...list(values)], out=[]; while(pool.length&&out.length<count) out.push(pool.splice(rng(0,pool.length-1),1)[0]);return out;};
  return { scene_cues:Object.fromEntries(Object.entries(bank.scene_cues||{}).map(([key,values])=>[key,sample(values,key==='details'?8:key==='questions'?5:key==='interruptions'?4:6)])),
    story:{...bank.story,premise_seeds:sample(bank.story?.premise_seeds,6),pressure_seeds:sample(bank.story?.pressure_seeds,6),anchor_seeds:sample(bank.story?.anchor_seeds,5),possible_endings:sample(bank.story?.possible_endings,4)} };
}
export function recordScene(campaign,scene,turn) {
  campaign.arc.turn_count++;
  campaign.recentCues=[...campaign.recentCues,...scene.cues].slice(-8);
  campaign.recentNotes=[...campaign.recentNotes,turn.action||'',turn.summary||''].filter(Boolean).slice(-6);
  campaign.recentCards=[...campaign.recentCards,scene.card].slice(-8);
  for(const [slot,value] of Object.entries(scene.card)) {
    const previous=campaign.repetition[slot];
    const count=previous?.value===value?previous.count+1:1;
    campaign.repetition[slot]={value,count:count>=3?0:count};
    if(count>=3) { campaign.faded[slot]??={}; campaign.faded[slot][value]=campaign.arc.turn_count+5; }
  }
}
export function buildCompassPrompt(character,palette) {
  return [
    'Create a loose story compass for a solo one-shot RPG. Do not create a fixed plot.',
    'Use the scene-bank palette below as session flavor, not a checklist. It should create variety between games, not force every item into this game.',
    'Balance three inputs equally: the player\'s freeform description, the character stats, and a small local premise.',
    'Keep it grounded, local, and flexible enough that rolls and player choices can redirect the route.',
    'Return only JSON with keys: premise, pressure, anchors, movements, possible_ending, target_turns.',
    'anchors must be 1-4 short strings. movements must be exactly 3 broad directions, not scene-by-scene beats. target_turns must be an integer.',
    'Session style: '+(palette.style||'flexible, local, consequence-driven'),
    'Palette premise seeds: '+list(palette.premise_seeds).join(' | '),
    'Palette pressure seeds: '+list(palette.pressure_seeds).join(' | '),
    'Palette anchor seeds: '+list(palette.anchor_seeds).join(' | '),
    'Palette ending modes: '+list(palette.possible_endings).join(' | '),
    'Character description: '+character.description,
    'Character stats: '+JSON.stringify(character.stats)
  ].join('\n');
}
export function buildNarrativePrompt(campaign,turn,scene) {
  const {bank,arc}=campaign, p=bank.prompt_text||{}, phase=phaseForArc(arc,campaign.objectiveTrack,turn.kind);
  const cv=turn.cv??0, wordLimit=turn.kind==='success'?250:500;
  const vars={action_text:turn.action||'',outcome_text:turn.summary||'',ev:turn.ev??'',word_limit:wordLimit};
  const fmt=lines=>list(lines).map(x=>x.replace(/\{(\w+)\}/g,(all,k)=>String(vars[k]??all)));
  const contract=turn.trivial?(bank.trivial_contracts?.[String(turn.trivial)]||bank.trivial_contracts?.default):turn.roll?(bank.outcome_contracts?.[turn.roll.outcome]||bank.outcome_contracts?.['OK success']):null;
  const cvGuidance=turn.trivial?'':CV_GUIDANCE[Math.abs(cv)<=1?'minor':Math.abs(cv)<=4?'roll':'critical'];
  const stat=turn.roll?campaign.pending?.stat:null;
  return [
    ...fmt(p.base),
    'Use three inputs with unequal weight: player intent (primary), roll margin and outcome tier (determines success/failure), and story compass (secondary for flavor). The roll margin and outcome tier alone determine whether the action succeeds or fails - the stat\'s value is descriptive only, not a modifier to the outcome.',
    'If inputs conflict, preserve established facts and resolve the player\'s stated intent before adding new material.',
    BOUNDED_ESCALATION,
    'Prefer developing existing people, objects, locations, and tensions over introducing new ones. A turn may clarify, deepen, or breathe without adding a new reveal.',
    'New clues, revelations, actors or developments may advance established stakes when warranted by action, consequences, critical/erratic events or triggered pressure. Do not replace the premise with an unrelated one.',
    turn.kind==='conclusion'?'Write 2-3 compact paragraphs: the concrete final state change, the resolved outcome, then the remaining cost or mark.':'Write 2-3 compact paragraphs: immediate result, clarification or consequence, then the playable situation.',
    'Character: '+JSON.stringify(campaign.character),
    'Story compass (continuity, not rails):\n- premise: '+arc.premise+'\n- pressure: '+arc.pressure+'\n- current movement: '+(turn.kind==='conclusion'?'Conclusion - '+arc.possible_ending:phase.label+' - '+phase.movement)+'\n- anchors: '+(arc.anchors.join('; ')||'none yet')+'\n- pacing: turn '+(arc.turn_count+1)+', target about '+arc.turn_budget+'; after this budget is reached, the next true Critical Action ends immediately with its computed verdict; local milestones do not themselves end the adventure.',
    ...fmt(p.memory_intro),
    'Recent scene notes: '+JSON.stringify(campaign.recentNotes),
    campaign.ledger?'Active narrative brief (descriptive context, not immutable objectives): '+JSON.stringify(activeBrief(campaign.ledger)):'',
    campaign.narrativeHint?'Advisory anti-loop observation (not a command or new fact): '+JSON.stringify(campaign.narrativeHint)+'. Consider a different response at the same scale. Follow current player intent; never intensify stakes merely to break repetition.':'',
    'Authored world and optional beats (respect setting rules; plot hits are suggestions, not commands): '+JSON.stringify(bank.authoring||{}),
    scene.cues.length?'Optional palette cue for this high-impact beat: '+scene.cues.join(' / '):'',
    Object.keys(scene.card).length?'Optional scene card: '+JSON.stringify(scene.card):'',
    pacingPrompt(turn),
    'Outcome contract:\n- player intent: '+(turn.action||'(opening)')+'\n- roll interpretation or ending reason: '+(turn.summary||'Introduce a playable local pressure.'),
    turn.kind==='opening'?'- opening: establish one playable local pressure, one concrete anchor, and one immediate choice. Make the immediate objective and local stakes legible; they are not a predetermined route or ending.':'',
    turn.kind==='critical'||turn.kind==='success'?cvGuidance:'',
    contract?'- result permission: '+JSON.stringify(contract):'',
    turn.roll?'- outcome determination: the roll margin and outcome tier alone decide success or failure. Do not adjust the outcome based on the stat\'s value, rating, or thematic meaning.':'',
    stat?'- stat noted: '+stat+'. Use only for descriptive flavor, not outcome determination.':'',
    turn.roll?'Resolve this attempted action now according to its roll. Success grants the attempted effect, not merely another opportunity to try; failure is an actual failed attempt, not indefinite nearly-succeeding. A lasting world-state change, new objective, threat, or twist is not required. Match consequences to the action and established causal stakes. Do not negate success to preserve suspense.':'',
    turn.trivial?'Observation and tiny preparation may clarify facts without moving major stakes. Do not manufacture plot escalation for a trivial action.':'',
    turn.kind==='erratic'?'Erratic value: '+turn.ev+'\n- result permission: introduce a dramatic, consequential rupture tied to an established pressure, anchor, danger, promise, or unanswered question.\n- erratic scale: this may be more disruptive than a Critical Action, but it must remain playable and anchored to the established story.\n- make the event arrive immediately: change the scene\'s options, danger, stakes, access, alliances, or physical situation instead of merely hinting.\n- do not replace the whole premise, jump to a finale, or change the tone or setting rules unless the established story already makes that plausible.':'',
    turn.kind==='conclusion'?'- result permission: honor the stated final victory, defeat, or fatal result; do not turn defeat into victory or soften a fatal result into escape. Resolve the local problem in a clear final state.':'',
    ...fmt(p.kinds?.[turn.kind]),...fmt(p.length),
    'NARRATIVE POLICY PRECEDENCE: budget-relative opening/development/convergence is advisory mood, not an early-ending permission or a required plot event. Irrespective of bank wording, scene cards, pressure developments, plot hits and proposed routes are suggestions, not commands. Ignore or adapt them when the current action or tone calls for it. No progress quota, mandatory new fact, immutable objective or checklist applies. Rest, dialogue and tangents are valid. This does not soften computed dice outcomes, player agency, established setting rules or the mandatory computed ending.',
    turn.kind==='conclusion'?'This is the ending. Begin with a visible final change, resolve the outcome and cost. Do not introduce new hooks. Do not end with a question.':fmt(p.question).join('\n')||'End with: What do you do now?',
    'Maximum '+wordLimit+' words.',
    turn.finale?'BINDING COMPUTED FINALE (overrides conflicting bank ending suggestions; unresolved threads cannot postpone this ending): '+JSON.stringify(turn.finale):'',

  ].filter(Boolean).join('\n\n');
}
