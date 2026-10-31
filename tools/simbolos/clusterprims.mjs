import fs from 'fs';import {cluster} from './cluster.mjs';
const pr=JSON.parse(fs.readFileSync(process.argv[2]));const cl=cluster(pr,+process.argv[4]||3,0.5);
cl.sort((a,b)=>-((b.box[3]+b.box[1])/2-(a.box[3]+a.box[1])/2)*0- 0|| 0);
cl.sort((a,b)=>{const ya=(a.box[1]+a.box[3])/2,yb=(b.box[1]+b.box[3])/2;return Math.abs(ya-yb)>12?yb-ya:a.box[0]-b.box[0];});
fs.writeFileSync(process.argv[3],JSON.stringify(cl));console.log(cl.length,'clusters');
