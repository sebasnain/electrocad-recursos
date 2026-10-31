import fs from 'fs';
import {flatten,bboxOf} from './prims.mjs';
// uso: node cluster.mjs in.dwg.json out.json gap
export function cluster(prims,gap,maxFrac=0.3,mode='auto'){
  let all=prims.filter(p=>p.k!=='T').map(bboxOf);let X0=1e18,Y0=1e18,X1=-1e18,Y1=-1e18;for(const b of all){X0=Math.min(X0,b[0]);Y0=Math.min(Y0,b[1]);X1=Math.max(X1,b[2]);Y1=Math.max(Y1,b[3]);}
  const W=X1-X0,H=Y1-Y0;
  const geo=prims.filter(p=>{if(p.k==='T')return false;const b=bboxOf(p);return !((b[2]-b[0])>W*maxFrac||(b[3]-b[1])>H*maxFrac);}),txt=prims.filter(p=>p.k==='T');
  const bb=geo.map(bboxOf);const n=geo.length;const par=[...Array(n).keys()];
  const f=i=>par[i]===i?i:(par[i]=f(par[i]));
  // barrido por x para no ser O(n^2) completo
  const ord=[...Array(n).keys()].sort((i,j)=>bb[i][0]-bb[j][0]);
  for(let a=0;a<n;a++){const i=ord[a];for(let b=a+1;b<n;b++){const j=ord[b];if(bb[j][0]>bb[i][2]+gap)break;
    if(bb[j][1]<=bb[i][3]+gap&&bb[j][3]>=bb[i][1]-gap){const x=f(i),y=f(j);if(x!==y)par[x]=y;}}}
  const g={};for(let i=0;i<n;i++){(g[f(i)]??=[]).push(i);}
  const cl=Object.values(g).map(ix=>{const items=ix.map(i=>geo[i]);let a=1e18,b=1e18,c=-1e18,d=-1e18;for(const i of ix){a=Math.min(a,bb[i][0]);b=Math.min(b,bb[i][1]);c=Math.max(c,bb[i][2]);d=Math.max(d,bb[i][3]);}return{items,box:[a,b,c,d],inner:[],labels:[]};});
  // textos: dentro de un cluster => interno; si no, etiqueta del cluster mas cercano (debajo / al costado)
  if(mode==='right'){for(const t of txt){let best=null,bd=1e18;for(const c of cl){const cy=(c.box[1]+c.box[3])/2,hh=c.box[3]-c.box[1];if(t.p[0]<c.box[2]-hh*.2)continue;const dy=Math.abs(t.p[1]+t.h/2-cy);if(dy>hh*.6+t.h*1.5)continue;const dx=t.p[0]-c.box[2];const d=dx+dy*3;if(d<bd){bd=d;best=c;}}if(best&&bd<3000)best.labels.push(t);}
    for(const c of cl)c.labels.sort((a,b)=>b.p[1]-a.p[1]);return cl;}
  for(const t of txt){const cx=t.p[0]+t.text.length*t.h*.3,cy=t.p[1]+t.h/2;
    let inside=cl.find(c=>cx>=c.box[0]-t.h*.2&&cx<=c.box[2]+t.h*.2&&cy>=c.box[1]-t.h*.2&&cy<=c.box[3]+t.h*.2);
    if(inside&&t.text.length<=4&&t.h<(inside.box[3]-inside.box[1])){inside.inner.push(t);continue;}
    let best=null,bd=1e18;for(const c of cl){const w=c.box[2]-c.box[0],h=c.box[3]-c.box[1];const mx=(c.box[0]+c.box[2])/2;
      const dx=Math.max(c.box[0]-cx,0,cx-c.box[2]);const dy=cy<c.box[1]?c.box[1]-cy:(cy>c.box[3]?cy-c.box[3]:0);
      const pen=cy>c.box[3]?3:1; // texto arriba del simbolo: menos probable que sea su etiqueta
      const d=Math.hypot(dx*1.2,dy*pen);if(d<bd){bd=d;best=c;}}
    if(best&&bd<Math.max(best.box[2]-best.box[0],best.box[3]-best.box[1])*2.2+t.h*3)best.labels.push(t);}
  return cl;
}
if(process.argv[1].endsWith('cluster.mjs')){
  const db=JSON.parse(fs.readFileSync(process.argv[2]));const pr=flatten(db);const cl=cluster(pr,+process.argv[4]||1,0.3,process.argv[5]||'auto');
  cl.sort((a,b)=>(b.box[3]+b.box[1])/2-(a.box[3]+a.box[1])/2||a.box[0]-b.box[0]);
  fs.writeFileSync(process.argv[3],JSON.stringify(cl));console.log(pr.length,'prims',cl.length,'clusters');
}
