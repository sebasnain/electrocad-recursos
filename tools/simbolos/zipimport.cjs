const {chromium}=require('C:/Users/Sebas/Desktop/ElectroCAD/node_modules/@playwright/test');
const http=require('http'),fs=require('fs'),path=require('path');const ROOT='C:/Users/Sebas/Desktop/ElectroCAD';
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(q.url==='/'||!fs.existsSync(f))f=path.join(ROOT,'app.html');try{r.end(fs.readFileSync(f));}catch(e){r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>srv.listen(0,r));const b=await chromium.launch();const p=await b.newPage();
await p.addInitScript(()=>{const s=document.createElement('style');s.textContent='#authScreen,#pendingScreen{display:none!important}';document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s));});
await p.goto('http://localhost:'+srv.address().port+'/app.html');await p.waitForTimeout(800);
for(const f of process.argv.slice(2)){
 const buf=fs.readFileSync(f).toString('base64');
 const r=await p.evaluate(async(b64)=>{window.isPro=()=>true;window._csymRequirePro=()=>true;let libs=0,syms=0;
  window.createCustomLibrary=async n=>{libs++;return{id:'L'+libs,name:n};};window.createCustomSymbol=async s=>{syms++;return s;};
  window.customLibraries=window.customLibraries||[];window.flashToast=(m)=>{window.__t=m;};
  const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const file=new File([bin],'x.zip');
  await importCustomFile({files:[file],value:''});return{libs,syms,t:window.__t};},buf);
 console.log(path.basename(f),JSON.stringify(r));}
await b.close();srv.close();})();
