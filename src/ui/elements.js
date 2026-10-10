export function el(tag,props={},...children) {
 const node=document.createElement(tag);
 for(const [key,value] of Object.entries(props)) {
   if(key==='text')node.textContent=value;
   else if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);
   else if(key==='class')node.className=value;
   else if(key in node&&!key.startsWith('aria'))node[key]=value;
   else node.setAttribute(key,String(value));
 }
 node.append(...children.filter(x=>x!==null&&x!==undefined));return node;
}
export const button=(text,fn,props={})=>el('button',{type:'button',text,onclick:fn,...props});
export const row=(...children)=>el('div',{class:'dm-row'},...children);
export function field(label,input) {
 input.id||='dm-field-'+crypto.randomUUID();return el('label',{class:'dm-field',htmlFor:input.id},el('span',{text:label}),input);
}
export function modal(title) {
 const focus=document.activeElement,titleId='dm-title-'+crypto.randomUUID();
 const body=el('div',{class:'dm-dialog-body'}),error=el('p',{role:'alert',class:'dm-error'});
 const dialog=el('dialog',{class:'dm-ui dm-dialog','aria-labelledby':titleId},row(el('h2',{id:titleId,text:title}),button('Close',()=>dialog.close(),{'aria-label':'Close '+title})),error,body);
 document.body.append(dialog);
 dialog.addEventListener('close',()=>{dialog.remove();if(focus?.isConnected)focus.focus();},{once:true});
 dialog.showModal();
 return {dialog,body,error,close:()=>dialog.close(),fail:e=>{error.textContent=e.message||String(e);}};
}
export function confirmAction(title,description,action) {
 return new Promise(resolve=>{
  const view=modal(title);let accepted=false;
  view.body.append(el('p',{text:description}),row(button('Cancel',()=>view.close()),button(action,()=>{accepted=true;view.close();},{class:'dm-danger'})));
  view.dialog.addEventListener('close',()=>resolve(accepted),{once:true});
 });
}
export function download(name,text,type='application/json') {
 const url=URL.createObjectURL(new Blob([text],{type})),a=el('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function pickFile(accept='.json',limit=8_000_000) {
 return new Promise((resolve,reject)=>{
  const input=el('input',{type:'file',accept});
  input.addEventListener('cancel',()=>resolve(null),{once:true});
  input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return resolve(null);if(file.size>limit)return reject(Error('File is too large'));resolve(await file.text());},{once:true});input.click();
 });
}
