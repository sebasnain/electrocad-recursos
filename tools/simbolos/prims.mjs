// DWG(json de libredwg) -> primitivas planas {k:'P',pts,closed,fill?} | {k:'C',c,r,fill?} | {k:'T',p,text,h}
import fs from 'fs';
const I={a:1,b:0,c:0,d:1,e:0,f:0};
const mul=(M,L)=>({a:M.a*L.a+M.c*L.b,b:M.b*L.a+M.d*L.b,c:M.a*L.c+M.c*L.d,d:M.b*L.c+M.d*L.d,e:M.a*L.e+M.c*L.f+M.e,f:M.b*L.e+M.d*L.f+M.f});
const ap=(M,x,y)=>[M.a*x+M.c*y+M.e,M.b*x+M.d*y+M.f];
const BS=String.fromCharCode(92);const cleanT=t=>String(t||'').replace(new RegExp(BS+BS+'[A-Za-z][^;]*;','g'),'').split(BS+'P').join(' ').replace(/[{}]/g,'').replace(/%%[cC]/g,'Ø').replace(/%%[dD]/g,'°').trim();
function arcPts(cx,cy,r,a0,a1,n){ if(a1<=a0)a1+=2*Math.PI; n=n||Math.max(6,Math.ceil((a1-a0)/(Math.PI/18))); const o=[];for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return o;}
function bulgePts(v,closed){ const out=[];const n=v.length;const last=closed?n:n-1;
  for(let i=0;i<last;i++){const p=v[i],q=v[(i+1)%n];out.push([p.x,p.y]);const b=p.bulge||0;
    if(Math.abs(b)>1e-9){const th=4*Math.atan(b);const dx=q.x-p.x,dy=q.y-p.y,ch=Math.hypot(dx,dy);const r=ch/(2*Math.sin(Math.abs(th)/2));
      const mx=(p.x+q.x)/2,my=(p.y+q.y)/2;const h=Math.sqrt(Math.max(0,r*r-ch*ch/4));const sgn=b>0?1:-1;
      const cx=mx-sgn*h*dy/ch*(Math.abs(th)>Math.PI?-1:1),cy=my+sgn*h*dx/ch*(Math.abs(th)>Math.PI?-1:1);
      const a0=Math.atan2(p.y-cy,p.x-cx);const k=Math.max(3,Math.ceil(Math.abs(th)/(Math.PI/18)));
      for(let j=1;j<k;j++){const a=a0+th*j/k;out.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}}}
  if(!closed)out.push([v[n-1].x,v[n-1].y]);return out;}
export function flatten(db,opts={}){
  const blocks={};for(const b of db.tables?.BLOCK_RECORD?.entries||[])blocks[b.name]=b;
  const out=[];
  const walk=(ents,M,depth)=>{for(const e of ents||[]){
    const P=(pts,closed,fill)=>out.push({k:'P',pts:pts.map(p=>ap(M,p[0],p[1])),closed:!!closed,fill:!!fill});
    switch(e.type){
    case 'LINE':P([[e.startPoint.x,e.startPoint.y],[e.endPoint.x,e.endPoint.y]]);break;
    case 'LWPOLYLINE':case 'POLYLINE2D':case 'POLYLINE':{const v=e.vertices||[];if(v.length<2)break;const cl=!!(e.flag&1);P(bulgePts(v.map(x=>({x:x.x,y:x.y,bulge:x.bulge})),cl),cl);break;}
    case 'CIRCLE':{const [x,y]=ap(M,e.center.x,e.center.y);const s=Math.hypot(M.a,M.b);const det=M.a*M.d-M.b*M.c;if(Math.abs(Math.hypot(M.c,M.d)-s)<1e-6*s+1e-9)out.push({k:'C',c:[x,y],r:e.radius*s});else P(arcPts(e.center.x,e.center.y,e.radius,0,2*Math.PI,36),true);break;}
    case 'ARC':P(arcPts(e.center.x,e.center.y,e.radius,e.startAngle,e.endAngle));break;
    case 'ELLIPSE':{const mx=e.majorAxisEndPoint||e.majorAxisEndPoint;const a=Math.hypot(mx.x,mx.y),b=a*(e.axisRatio||1),rot=Math.atan2(mx.y,mx.x);const t0=e.startAngle||0;let t1=e.endAngle==null?2*Math.PI:e.endAngle;if(t1<=t0)t1+=2*Math.PI;const pts=[];for(let i=0;i<=48;i++){const t=t0+(t1-t0)*i/48;const x=a*Math.cos(t),y=b*Math.sin(t);pts.push([e.center.x+x*Math.cos(rot)-y*Math.sin(rot),e.center.y+x*Math.sin(rot)+y*Math.cos(rot)]);}P(pts,Math.abs(t1-t0-2*Math.PI)<1e-6);break;}
    case 'SOLID':{const c=[e.corner1,e.corner2,e.corner4||e.corner3,e.corner3].filter(Boolean);if(c.length>=3)P(c.map(q=>[q.x,q.y]),true,true);break;}
    case 'TEXT':case 'MTEXT':{const p=e.startPoint||e.insertionPoint;if(!p)break;const [x,y]=ap(M,p.x,p.y);const t=cleanT(e.text);if(t)out.push({k:'T',p:[x,y],text:t,h:(e.textHeight||e.height||1)*Math.hypot(M.a,M.b)});break;}
    case 'INSERT':{if(depth>5)break;const b=blocks[e.name];if(!b)break;const sx=e.xScale??1,sy=e.yScale??1,r=e.rotation||0,c=Math.cos(r),s=Math.sin(r);const ip=e.insertionPoint,bp=b.basePoint||{x:0,y:0};
      const L={a:c*sx,b:s*sx,c:-s*sy,d:c*sy,e:ip.x-(c*sx*bp.x-s*sy*bp.y),f:ip.y-(s*sx*bp.x+c*sy*bp.y)};
      walk(b.entities,mul(M,L),depth+1);break;}
    }}};
  walk(db.entities,I,0);
  return out;
}
export function bboxOf(p){ if(p.k==='C')return[p.c[0]-p.r,p.c[1]-p.r,p.c[0]+p.r,p.c[1]+p.r]; if(p.k==='T'){const w=p.text.length*p.h*.6;return[p.p[0],p.p[1],p.p[0]+w,p.p[1]+p.h];} let a=1e18,b=1e18,c=-1e18,d=-1e18;for(const q of p.pts){a=Math.min(a,q[0]);c=Math.max(c,q[0]);b=Math.min(b,q[1]);d=Math.max(d,q[1]);}return[a,b,c,d];}
