import {cp,mkdir,access} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const assets=['manifest.json','index.js','style.css','tokens.css','src','presets','README.md','CHANGELOG.md','docs'];
export async function install(target) {
 target=resolve(target);
 if(basename(target)!=='Filigree')throw Error('Target must be a NEW directory named Filigree');
 for(const file of assets)await access(resolve(root,file));
 // Nonrecursive creation deliberately refuses an existing destination, including a symlink.
 await mkdir(target);
 for(const file of assets)await cp(resolve(root,file),resolve(target,file),{recursive:true,errorOnExist:true,force:false});
 return target;
}
