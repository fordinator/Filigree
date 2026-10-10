import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advancePressure,finaleDecision,successPercent} from '../src/core/rules.js';
const fixtures=JSON.parse(readFileSync(new URL('./helpers/python-pacing-fixtures.json',import.meta.url)));
test('automatic finale exactly matches extracted Python helper including empty prior, ties and fatal thresholds',()=>{
 for(const f of fixtures)assert.deepEqual(finaleDecision(f.current,f.prior),f.expected,JSON.stringify(f));
 assert.equal(successPercent(0.1),50);assert.equal(successPercent(0.3),52);
});
test('pressure arithmetic preserves inclusive boundaries, caps, negative margins and critical suppression',()=>{
 for(const [chance,margin,critical,roll,threshold,triggered,next] of [[0,0,false,12,12,true,0],[0,0,false,13,12,false,12],[4,-3,false,35,34,false,34],[90,20,false,100,100,true,0],[0,30,false,61,60,false,60],[30,20,true,42,42,true,0],[30,-20,true,43,42,false,0]]){
  const p=advancePressure({chance,turns:3},margin,critical,roll);
  assert.equal(p.threshold,threshold);assert.equal(p.triggered,triggered);assert.equal(p.chance,next);assert.equal(p.suppressed,critical&&triggered);assert.equal(p.turns,triggered||critical?0:4);
 }
});

test('500 pressure decisions match isolated original Python including exact reset and waiting counters',()=>{
 const {cases}=JSON.parse(readFileSync(new URL('./helpers/python-pressure-fixtures.json',import.meta.url)));
 for(const c of cases)assert.deepEqual(advancePressure({chance:c.chance,turns:c.turns},c.margin,c.critical,c.roll),c.expected,JSON.stringify(c));
});
