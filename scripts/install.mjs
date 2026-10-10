import {install} from './assets.mjs';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--target') {
 console.error('Usage: node scripts/install.mjs --target /existing/extensions/Filigree');process.exitCode=1;
} else {
 try {console.log('Installed runtime files into '+await install(args[1]));}
 catch(error) {console.error('Installation stopped: '+error.message+' (existing files are never overwritten)');process.exitCode=1;}
}
