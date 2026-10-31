// node verify.cjs pack.json out.png  -- sanea con el importador REAL de la app y dibuja con fabric como la app
const {chromium}=require('C:/Users/Sebas/Desktop/ElectroCAD/node_modules/@playwright/test');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='C:/Users/Sebas/Desktop/ElectroCAD';
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(q.url==='/'||!fs.existsSync(f))f=path.join(ROOT,'app.html');try{r.end(fs.readFileSync(f));}catch(e){r.statusCode=404;r.end();}});
(async()=>{await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
const pack=JSON.parse(fs.readFileSync(process.argv[2]));
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1500,height:900}});
await p.addInitScript(()=>{const s=document.createElement('style');s.textContent='#authScreen,#pendingScreen{display:none!important}';document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s));});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:'+port+'/app.html');await p.waitForTimeout(800);
const res=await p.evaluate(async(pack)=>{
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js');
  const out=[];let fail=[];
  for(const rs of pack.symbols){let c;try{c=_sanitizeImportedSymbol(rs);}catch(e){fail.push(rs.name+': '+e.message);continue;}
    const img=await new Promise(r=>_renderGeoToImage(c.geometryData,r));out.push({name:c.name,img});}
  const cell=130,cols=11,rows=Math.ceil(out.length/cols);const cv=document.createElement('canvas');cv.width=cols*cell;cv.height=rows*(cell+12);const g=cv.getContext('2d');g.fillStyle='#1a2030';g.fillRect(0,0,cv.width,cv.height);g.font='9px sans-serif';
  out.forEach((o,i)=>{const x=(i%cols)*cell,y=Math.floor(i/cols)*(cell+12);g.strokeStyle='#2a3350';g.strokeRect(x,y,cell,cell+12);
    if(o.img){const k=Math.min((cell-12)/o.img.w,(cell-12)/o.img.h,1);g.drawImage(o.img.canvas,x+(cell-o.img.w*k)/2,y+4+(cell-12-o.img.h*k)/2,o.img.w*k,o.img.h*k);}
    g.fillStyle='#ccd';g.fillText(String(i)+' '+o.name.slice(0,22),x+2,y+cell+8);});
  return{n:out.length,fail,url:cv.toDataURL('image/png')};},pack);
fs.writeFileSync(process.argv[3],Buffer.from(res.url.split(',')[1],'base64'));
console.log('ok',res.n,'fallan',res.fail.length,res.fail.slice(0,5),'errs',errs.slice(0,3));
await b.close();srv.close();})();
