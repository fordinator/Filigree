import {readdir,readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,assets} from './assets.mjs';
import {parseSceneBank} from '../src/core/scenes.js';
async function walk(path) {
 const output=[];for(const item of await readdir(path,{withFileTypes:true})){
  const file=join(path,item.name);output.push(...(item.isDirectory()?await walk(file):[file]));
 }return output;
}
for(const file of assets)await access(join(root,file));
const files=[join(root,'index.js'),...await walk(join(root,'src'))];
for(const file of files.filter(f=>f.endsWith('.js'))) {
 execFileSync(process.execPath,['--check',file]);
 const code=await readFile(file,'utf8');
 for(const match of code.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g))await access(new URL(match[1],'file://'+file));
}
for(const file of await readdir(join(root,'presets')))if(file.endsWith('.json'))parseSceneBank(await readFile(join(root,'presets',file),'utf8'));
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
for(const key of ['js','css'])await access(join(root,manifest[key]));
console.log('Runtime syntax/imports, manifest, required assets, and bundled scene bank verified.');
