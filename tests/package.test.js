import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('private installation copies only runtime assets and refuses overwrite',async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'filigree-install-test-'));
 try {
  const target=join(scratch,'Filigree');
  const run=()=>spawnSync(process.execPath,['scripts/install.mjs','--target',target],{encoding:'utf8'});
  const result=run();assert.equal(result.status,0,result.stderr);
  const copied=JSON.parse(await readFile(join(target,'manifest.json')));
  assert.deepEqual(copied,JSON.parse(await readFile('manifest.json')));
  assert.equal(copied.version,JSON.parse(await readFile('package.json')).version);
  assert.equal(await readFile(join(target,'src/core/ledger.js'),'utf8'),await readFile('src/core/ledger.js','utf8'));
  assert.ok(!(await readdir(target)).includes('node_modules'));
  assert.ok(!(await readdir(target)).includes('.git'));
  assert.notEqual(run().status,0,'existing installation must not be overwritten');
 }finally{await rm(scratch,{recursive:true,force:true});}
});
