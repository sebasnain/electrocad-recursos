// contact sheet: node sheet.cjs clusters.json out.png [cols]
const {chromium}=require('C:/Users/Sebas/Desktop/ElectroCAD/node_modules/@playwright/test');
const fs=require('fs');
(async()=>{const cl=JSON.parse(fs.readFileSync(process.argv[2]));const cols=+process.argv[4]||10;const cell=150;
let h='';cl.forEach((c,i)=>{const w=c.box[2]-c.box[0],hh=c.box[3]-c.box[1];const s=(cell-30)/Math.max(w,hh,1e-6);const ox=(cell-w*s)/2,oy=(cell-30-hh*s)/2;
 const X=x=>(x-c.box[0])*s+ox,Y=y=>(c.box[3]-y)*s+oy;let g='';
 for(const p of c.items){if(p.k==='C')g+=`<circle cx="${X(p.c[0])}" cy="${Y(p.c[1])}" r="${p.r*s}"${p.fill?' fill="#000"':''}/>`;else g+=`<${p.closed?'polygon':'polyline'} points="${p.pts.map(q=>X(q[0])+','+Y(q[1])).join(' ')}"${p.fill?' fill="#000"':''}/>`;}
 const lab=(c.labels||[]).map(t=>t.text).join(' ').slice(0,28);
 h+=`<div style="width:${cell}px;height:${cell+14}px;border:1px solid #ddd;position:relative;box-sizing:border-box"><svg width="${cell}" height="${cell-30}" style="fill:none;stroke:#000;stroke-width:1;stroke-linecap:round">${g}</svg><div style="font:10px sans-serif;position:absolute;bottom:0;left:2px;right:2px;height:42px;overflow:hidden"><b style="color:#c00">${i}</b> ${lab.replace(/</g,'')}</div></div>`;});
const rows=Math.ceil(cl.length/cols);const b=await chromium.launch();const p=await b.newPage({viewport:{width:cols*cell+20,height:Math.min(rows*(cell+14)+20,2400)}});
await p.setContent('<body style="margin:6px;background:#fff"><div style="display:flex;flex-wrap:wrap">'+h+'</div></body>');await p.screenshot({path:process.argv[3],fullPage:true});await b.close();})();
