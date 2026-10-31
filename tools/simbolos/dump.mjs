import fs from 'fs'; import path from 'path';
const R='file:///C:/Users/Sebas/Documents/webrecursoselectrocad/';
const {LibreDwg,Dwg_File_Type}=await import(R+'node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js').catch(async e=>{console.log(e.message);return import('@mlightcad/libredwg-web')});
const lib=await LibreDwg.create('C:/Users/Sebas/Documents/webrecursoselectrocad/public/libredwg/');
const dir=process.argv[2];
for(const f of process.argv.slice(3)){
 const buf=fs.readFileSync(f); const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
 const dwg=lib.dwg_read_data(ab,Dwg_File_Type.DWG); if(!dwg){console.log(f,'FAIL');continue}
 const db=lib.convert(dwg); lib.dwg_free(dwg);
 const types={}; for(const e of db.entities||[])types[e.type]=(types[e.type]||0)+1;
 const blocks=(db.tables?.BLOCK_RECORD?.entries||[]).filter(b=>!/^\*/.test(b.name));
 console.log('==',path.basename(f),'ents',JSON.stringify(types),'blocks',blocks.length);
 console.log(' ',blocks.map(b=>b.name+'('+(b.entities||[]).length+')').join(', ').slice(0,600));
 console.log(' ltypes',(db.tables?.LTYPE?.entries||[]).map(l=>l.name).join(','));
 fs.writeFileSync(path.join(dir,path.basename(f)+'.json'),JSON.stringify(db,(k,v)=>typeof v==="bigint"?Number(v):v));
}
