export const STATS = Object.freeze(['STR','DEX','CON','INT','WIS','CHA']);
export const signed = n => n >= 0 ? '+' + n : String(n);
export function integer(n, min, max, label = 'Value') {
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(label + ' must be an integer from ' + min + ' to ' + max);
  return n;
}
function diceCheck(dice, count) {
  if (!Array.isArray(dice) || dice.length !== count) throw new Error('Expected ' + count + ' dice');
  dice.forEach(n => integer(n, 1, 6, 'Each die'));
}
export function randomInt(min, max) {
  integer(min, -10000, 10000); integer(max, min, 10000);
  const range = max - min + 1, limit = Math.floor(0x100000000 / range) * range;
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure randomness is unavailable. Use HTTPS or localhost.');
  const words = new Uint32Array(1);
  do { crypto.getRandomValues(words); } while (words[0] >= limit);
  return min + words[0] % range;
}
export const rollDice = (count, rng = randomInt) => Array.from({length:count}, () => rng(1,6));
export function createRollDraft(rng = randomInt) {
  const faces = rollDice(4, rng), signs = [1,1,-1,-1];
  for (let i=3; i>0; i--) { const j=rng(0,i); [signs[i],signs[j]]=[signs[j],signs[i]]; }
  return faces.map((n,i)=>n*signs[i]);
}
export function validateSignedRoll(dice) {
  if (!Array.isArray(dice)) throw new Error('Expected signed dice');
  diceCheck(dice.map(Math.abs),4);
  if (dice.filter(n=>n>0).length !== 2) throw new Error('Keep exactly two positive and two negative dice');
  return dice.reduce((a,b)=>a+b,0);
}
export function flipRollDie(dice, index) {
  integer(index,0,3,'Die index'); diceCheck(dice.map(Math.abs),4);
  return dice.map((n,i)=>i===index?-n:n);
}
export function manualCharacter(stats) {
  return Object.fromEntries(STATS.map(s=>[s,integer(stats[s],-8,8,s)]));
}
export function erraticFromDice(dice) {
  diceCheck(dice,4); const ev=dice[0]+dice[1]-dice[2]-dice[3];
  return {dice:[...dice],ev,triggered:Math.abs(ev)>6};
}
export function difficulty(base, cv) {
  integer(base,-7,7,'DV'); integer(cv,-7,7,'CV');
  return base + (Math.abs(cv)>=5 ? Math.floor(cv/2) : 0);
}
export function computeFlavorValue(action, creative, unique) {
  const words=action.trim().split(/\s+/).filter(Boolean).length;
  let value=0; const reasons=[];
  if(words>20) { value+=2; reasons.push('Wordy ('+words+' words): +2'); }
  else if(words<10) { value-=2; reasons.push('Brief ('+words+' words): -2'); }
  if(creative) { value+=2; reasons.push('Creative: +2'); }
  if(unique) { value+=2; reasons.push('Unique: +2'); }
  return {value,words,reasons};
}
export function outcomeForMargin(margin) {
  return [[7,'Great success'],[5,'Good success'],[3,'OK success'],[1,'Slight success'],[-1,'Slight failure'],[-3,'Kinda bad failure'],[-5,'Bad failure'],[-Infinity,'Very bad failure']].find(([n])=>margin>=n)[1];
}
export function resolveActionRoll(dice, stat, fv, dv) {
  diceCheck(dice,8);
  const positive=dice.slice(0,4).reduce((a,b)=>a+b,0), negative=dice.slice(4).reduce((a,b)=>a+b,0);
  const total=positive-negative+stat+fv, margin=total-dv;
  return {dice:[...dice],positive,negative,stat,fv,dv,total,margin,outcome:outcomeForMargin(margin)};
}
export function trivialFromDice(dice) {
  diceCheck(dice,2); const raw=dice[0]-dice[1];
  return {dice:[...dice],value:Math.max(1,raw>0?raw-1:raw)};
}
export function advancePressure(pressure, margin, critical, roll) {
  integer(roll,1,100,'Pressure roll');
  const threshold=Math.min(100,pressure.chance+12+(critical?0:Math.min(48,Math.abs(margin)*6)));
  const triggered=roll<=threshold;
  return {chance:triggered||critical?0:threshold,turns:triggered||critical?0:pressure.turns+1,roll,threshold,triggered,suppressed:triggered&&critical};
}
export function successPercent(margin) {
  const n=50+margin*5, floor=Math.floor(n);
  const rounded=n-floor===0.5?(floor%2===0?floor:floor+1):Math.round(n);
  return Math.max(1,Math.min(99,rounded));
}
export function finaleDecision(current, prior) {
  const average=prior.length?prior.reduce((a,b)=>a+b,0)/prior.length:0;
  const determining=(current+average)/2, percent=successPercent(determining);
  const defeat=percent<50, fatal=defeat&&(current<=-9||percent<=15||(current<=-5&&average<=-3));
  return {current,average,determining,successPercent:percent,result:fatal?'fatal defeat':defeat?'defeat':'victory'};
}
export const CV_GUIDANCE = Object.freeze({
  minor:'CV tier: Minor State Change (-1 to +1). Resolve without a roll. Resolve the small intent; observation, dialogue and unchanged situations are allowed. Do not resolve the core conflict, add a major threat, or rewrite the premise.',
  roll:'CV tier: Roll-Bearing Action (-4 to -2 or +2 to +4). Resolve with a stat roll. Resolve the attempted action according to the roll outcome. Several changed facts or plot advancement are not required; a concrete answer or response at the same scale is sufficient.',
  critical:'CV tier: Critical Action (<= -5 or >= +5). Resolve with a stat roll. Resolve the consequential attempt according to the roll outcome. Narrative scope follows the action and established causes, not the size of the roll; do not require a new plot twist. Death is possible when the established danger and failure justify it. Plot may advance, reveal, or escalate within established world rules; high stats or rolls alone do not authorize new powers, status, or transformation.'
});
export function cleanActions(raw) {
  const forbidden=/\b(attack|break|climb|confront|decide|descend|enter|escape|expose|fight|force|grab|jump|lift|open|pull|push|resolve|run|smash|take)\b/i;
  const safe=(Array.isArray(raw)?raw:[]).filter(x=>typeof x==='string').map(x=>x.trim()).filter(x=>/^(look|listen|check|inspect|watch|wait|read|count|smell) /i.test(x)&&x.split(/\s+/).length<=8&&!forbidden.test(x));
  return [...new Set([...safe,'Look for small details.','Listen quietly.','Check your footing.'])].slice(0,3);
}

export const BOUNDED_ESCALATION='Causal scope: use the smallest consequence that honestly resolves the attempted action within established world rules and stakes. Development, revelation and escalation are possibilities, not a rising quota. High stats or a high roll grant no unearned power, rank, status, godhood, or cosmic upgrade. Transformations require established causal permission, player choice, or explicit scene-bank authorization; a roll alone is not permission. Preserve the setting rules, not an unresolved obstacle.';
export function pacingPrompt(turn) {
  if(turn.kind==='conclusion'||Math.abs(turn.cv??0)>=5)return 'Pacing precedence: no separate pressure twist on a Critical Action or finale. The critical event or final action supplies the plot movement.';
  if(!turn.pressure?.triggered||turn.pressure.suppressed)return 'No pressure development was triggered. Apply only warranted consequences; do not invent an independent twist.';
  return 'Pressure triggered (advisory pacing permission): consider one moderate development from an existing actor, pressure, anchor, promise or unanswered question. Scene-bank plot hits are suggestions, not commands. Ignore or adapt them if inappropriate for current player intent; omission is not an error. Preserve earned success and the same causal scale. No mandatory fact delta, escalation, unrelated twist, new premise or premature finale.';
}
