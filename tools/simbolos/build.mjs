// node build.mjs clusters.json cur.json out.json
import fs from 'fs';
const [,,cin,cfg,outp]=process.argv;
const cl=JSON.parse(fs.readFileSync(cin));const C=JSON.parse(fs.readFileSync(cfg));
const COLOR='#f5a623',SW=C.sw||6,R=v=>Math.round(v*100)/100;
const skip=new Set(C.skip||[]);
for(const g of C.merge||[]){const a=cl[g[0]];for(const j of g.slice(1)){const b=cl[j];a.items=a.items.concat(b.items);a.inner=(a.inner||[]).concat(b.inner||[]);a.labels=(a.labels||[]).concat(b.labels||[]);a.box=[Math.min(a.box[0],b.box[0]),Math.min(a.box[1],b.box[1]),Math.max(a.box[2],b.box[2]),Math.max(a.box[3],b.box[3])];skip.add(j);}}const names=C.names||{};
const titleCase=s=>s.toLowerCase().replace(/(^|[\s.\/(-])([a-zñáéíóú])/g,(m,a,b)=>a+b.toUpperCase());
const dims=cl.map(c=>Math.max(c.box[2]-c.box[0],c.box[3]-c.box[1])).filter(x=>x>0).sort((a,b)=>a-b);
const med=dims[Math.floor(dims.length/2)]||1;const common=(C.target||300)/med;
const syms=[];const rep=[];
cl.forEach((c,i)=>{
  if(skip.has(i))return;
  let name=names[i];
  if(name===undefined){const t=(c.labels||[]).map(x=>x.text).join(' ').replace(/\s+/g,' ').trim();name=t&&C.auto!==false?titleCase(t):null;}
  if(!name){rep.push(['sin nombre',i]);return;}
  name=name.slice(0,60);
  const w=c.box[2]-c.box[0],h=c.box[3]-c.box[1];const m=Math.max(w,h,1e-9);
  let s=common;if(m*s>400)s=400/m;if(m*s<80)s=Math.min(80/m,400/m,s*4);
  const cx=(c.box[0]+c.box[2])/2,cy=(c.box[1]+c.box[3])/2;
  const X=x=>R((x-cx)*s),Y=y=>R(-(y-cy)*s);
  const objs=[];const path=[];const fillp=[];
  for(const p of c.items){
    if(p.k==='C'){const o={type:'circle',originX:'center',originY:'center',left:X(p.c[0]),top:Y(p.c[1]),radius:R(p.r*s),fill:p.fill?COLOR:'transparent',stroke:COLOR,strokeWidth:SW};objs.push(o);continue;}
    const pts=p.pts;if(pts.length<2)continue;
    const tgt=p.fill?fillp:path;
    pts.forEach((q,j)=>tgt.push([j?'L':'M',X(q[0]),Y(q[1])]));
    if(p.closed)tgt.push(['Z']);
  }
  const bx=(pp)=>{let a=1e9,b=1e9,d=-1e9,e=-1e9;for(const q of pp){if(q.length<3)continue;a=Math.min(a,q[1]);d=Math.max(d,q[1]);b=Math.min(b,q[2]);e=Math.max(e,q[2]);}return{a,b,d,e};};
  const pathObj=(pp,fill)=>{const B=bx(pp);return{type:'path',originX:'left',originY:'top',left:B.a,top:B.b,width:R(B.d-B.a),height:R(B.e-B.b),path:pp,fill:fill?COLOR:'transparent',stroke:fill?COLOR:COLOR,strokeWidth:fill?1:SW,strokeLineCap:'round',strokeLineJoin:'round'};};
  if(fillp.length)objs.push(pathObj(fillp,true));
  if(path.length)objs.unshift(pathObj(path,false));
  for(const t of c.inner||[]){objs.push({type:'text',originX:'left',originY:'bottom',left:X(t.p[0]),top:Y(t.p[1]),text:t.text.slice(0,20),fontSize:Math.max(12,R(t.h*s)),fill:COLOR,stroke:null,fontFamily:'Arial'});}
  if(C.tags&&C.tags[i]){const[tx,tl]=[C.tags[i],C.tags[i].length];objs.push({type:'text',originX:'left',originY:'bottom',left:R(-w*s/2),top:R(-h*s/2),text:tx,fontSize:44,fill:COLOR,stroke:null,fontFamily:'Arial'});}
  if(!objs.length)return;
  const sym={name,description:C.desc||'',geometryData:{version:'5.3.0',objects:objs},connectionPoints:[{x:0,y:0,type:'inout'}],
    materialConfig:{countInMaterials:false,materialName:name,unit:'unidad',defaultQty:1},laborConfig:{count:false,type:'boca',fixed:0}};
  const sz=JSON.stringify(sym.geometryData).length;
  if(sz>48000||path.length>1900){rep.push(['demasiado grande',i,name,sz]);return;}
  syms.push(sym);
});
// nombres repetidos -> el importador los numera; aca solo avisamos
const dup={};syms.forEach(s=>dup[s.name]=(dup[s.name]||0)+1);
fs.writeFileSync(outp,JSON.stringify({ecFormat:'ec-library',version:1,app:'ElectroCAD',library:{name:C.library},symbols:syms}));
console.log(C.library,syms.length,'simbolos;',rep.length,'omitidos',JSON.stringify(rep.slice(0,10)),'dups',Object.entries(dup).filter(e=>e[1]>1).length);
