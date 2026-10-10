import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost'), file=url.pathname==='/'?'/tests/harness/index.html':url.pathname;
  const full=path.resolve(root,'.'+file);if(!full.startsWith(root+path.sep))throw Error('Path outside harness');
  const body=await readFile(full);res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');
  res.end(body);
 }catch{res.statusCode=404;res.end('Not found');}
}).listen(18765,'127.0.0.1');
