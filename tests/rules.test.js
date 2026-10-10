import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../src/core/rules.js').catch(() => ({}));
const run = (name, ...args) => { assert.equal(typeof mod[name], 'function', name + ' is implemented'); return mod[name](...args); };
test('signed rolls require two buffs and two nerfs', () => {
  assert.equal(run('validateSignedRoll', [6,5,-2,-1]), 8);
  assert.throws(() => run('validateSignedRoll', [6,5,2,-1]), /two positive/);
  assert.throws(() => run('validateSignedRoll', [7,5,-2,-1]), /die/);
  assert.deepEqual(run('flipRollDie', [6,5,-2,-1], 0), [-6,5,-2,-1]);
});
test('manual -8..8 does not constrain rolled +/-10', () => {
  const stats = { STR:8, DEX:-8, CON:0, INT:0, WIS:1, CHA:-1 };
  assert.deepEqual(run('manualCharacter', stats), stats);
  assert.throws(() => run('manualCharacter', {...stats, STR:9}), /-8/);
  assert.throws(() => run('manualCharacter', {...stats, STR:1.5}), /integer/);
  assert.equal(run('validateSignedRoll', [6,6,-1,-1]), 10);
});
test('erratic +/-6 excluded, +/-7 included', () => {
  for (const [dice,ev,triggered] of [[[6,6,1,4],7,true],[[6,6,1,5],6,false],[[1,4,6,6],-7,true],[[1,5,6,6],-6,false]]) assert.deepEqual(run('erraticFromDice', dice), {dice,ev,triggered});
});
test('negative critical CV uses Python floor division', () => {
  assert.equal(run('difficulty', 3,-5),0); assert.equal(run('difficulty', 3,-7),-1); assert.equal(run('difficulty', 3,4),3);
});
test('FV boundaries and independent bonuses', () => {
  assert.equal(run('computeFlavorValue','a '.repeat(9),false,false).value,-2);
  assert.equal(run('computeFlavorValue','a '.repeat(10),false,false).value,0);
  assert.equal(run('computeFlavorValue','a '.repeat(20),true,false).value,2);
  assert.equal(run('computeFlavorValue','a '.repeat(21),true,true).value,6);
});
test('roll boundaries including zero slightly failing', () => {
  for (const [margin,want] of [[7,'Great success'],[5,'Good success'],[3,'OK success'],[1,'Slight success'],[0,'Slight failure'],[-1,'Slight failure'],[-3,'Kinda bad failure'],[-5,'Bad failure'],[-6,'Very bad failure']]) assert.equal(run('outcomeForMargin',margin),want);
  const r=run('resolveActionRoll',[6,5,4,3,1,2,3,4],2,-2,3);
  assert.equal(r.total,8); assert.equal(r.margin,5); assert.equal(r.outcome,'Good success');
});
test('incidental asymmetric 1..4 transform', () => {
  assert.equal(run('trivialFromDice',[6,1]).value,4); assert.equal(run('trivialFromDice',[3,1]).value,1); assert.equal(run('trivialFromDice',[1,6]).value,1);
});
test('pressure accumulation, cap, trigger, critical reset', () => {
  assert.deepEqual(run('advancePressure',{chance:4,turns:1},3,false,90), {chance:34,turns:2,roll:90,threshold:34,triggered:false,suppressed:false});
  assert.equal(run('advancePressure',{chance:90,turns:2},10,false,100).triggered,true);
  assert.equal(run('advancePressure',{chance:4,turns:1},3,true,90).chance,0);
});
test('finale combines current and prior average with bankers rounding', () => {
  assert.equal(run('finaleDecision',3,[1,1]).successPercent,60);
  assert.equal(run('finaleDecision',-9,[]).result,'fatal defeat');
  assert.equal(run('finaleDecision',0,[]).result,'victory');
  assert.equal(run('successPercent',0.5),52);
});
test('safe suggestions exclude dangerous actions and nonstrings', () => {
  const a=run('cleanActions',['Look at the wall.','Look and attack the guard',{},'Listen quietly.']);
  assert.equal(a.length,3); assert.equal(a[0],'Look at the wall.'); assert.ok(!a.some(x=>x.includes('attack')||x.includes('object')));
});
