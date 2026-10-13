// Lectura de archivos .DWG de AutoCAD en el navegador (libredwg-web, WebAssembly, GPL-3.0).
// Devuelve un objeto con la MISMA forma que dxf-parser (entities, blocks, header, tables),
// así el resto del conversor no distingue si vino de un DXF o de un DWG.
// Este archivo y la librería se cargan SOLO al subir un .dwg (import dinámico).

const ACI_BASE = { 1: 0xff0000, 2: 0xffff00, 3: 0x00ff00, 4: 0x00ffff, 5: 0x0000ff, 6: 0xff00ff, 7: 0xffffff, 8: 0x808080, 9: 0xc0c0c0 };
// Índice de color de AutoCAD → RGB (aproximado para los 10–249 de la paleta por tonos).
function aciRgb(i) {
  if (ACI_BASE[i] != null) return ACI_BASE[i];
  if (i >= 250 && i <= 255) { const g = [0x33, 0x50, 0x69, 0x82, 0xbe, 0xff][i - 250]; return (g << 16) | (g << 8) | g; }
  if (i < 10 || i > 249) return null;
  const hue = Math.floor((i - 10) / 10) * 15, n = (i - 10) % 10;
  const s = n % 2 ? 0.5 : 1, v = [1, 1, 0.65, 0.65, 0.5, 0.5, 0.3, 0.3, 0.15, 0.15][n];
  const f = k => { const a = (k + hue / 60) % 6; return v * (1 - s * Math.max(0, Math.min(a, 4 - a, 1))); };
  return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255);
}

const deg = r => (Number(r) || 0) * 180 / Math.PI;

// Una entidad del DWG → entidad con los nombres de campo de dxf-parser.
function adapt(e) {
  const o = { ...e };
  if (e.colorIndex != null && e.colorIndex !== 256 && e.colorIndex !== 0) o.color = aciRgb(e.colorIndex);
  switch (e.type) {
    case 'LINE': o.vertices = [e.startPoint, e.endPoint]; break;
    case 'LWPOLYLINE': o.shape = Boolean((e.flag & 512) || (e.flag & 1)); break;
    case 'MTEXT': o.position = e.insertionPoint; o.rotation = e.direction ? deg(Math.atan2(e.direction.y, e.direction.x)) : deg(e.rotation); break;
    case 'TEXT': o.startPoint = e.startPoint; o.rotation = deg(e.rotation); break;
    case 'INSERT': o.position = e.insertionPoint; o.rotation = deg(e.rotation); break;
    case 'DIMENSION': o.block = e.name; break;
  }
  return o;
}

let libP = null;
async function libreria() {
  if (!libP) libP = (async () => {
    const { LibreDwg } = await import('@mlightcad/libredwg-web');
    return LibreDwg.create(`${import.meta.env.BASE_URL}libredwg/`);
  })().catch(e => { libP = null; throw e; });
  return libP;
}

export async function dwgToDxfLike(buffer) {
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web');
  const lib = await libreria();
  const dwg = lib.dwg_read_data(buffer, Dwg_File_Type.DWG);
  if (!dwg) throw new Error('el archivo DWG no se pudo leer (¿versión muy nueva o dañado?). Probá guardarlo desde AutoCAD como una versión anterior.');
  const db = lib.convert(dwg);
  lib.dwg_free(dwg);
  const blocks = {};
  for (const b of db.tables?.BLOCK_RECORD?.entries || []) {
    if (/^\*(Model|Paper)_Space/i.test(b.name)) continue;
    blocks[b.name] = { name: b.name, position: b.basePoint || { x: 0, y: 0 }, entities: (b.entities || []).map(adapt) };
  }
  const layers = {};
  for (const l of db.tables?.LAYER?.entries || []) {
    const rgb = aciRgb(l.colorIndex);
    layers[l.name] = { name: l.name, visible: !l.off, frozen: Boolean(l.frozen), color: rgb };
  }
  return {
    header: { $INSUNITS: db.header?.INSUNITS },
    tables: { layer: { layers } },
    blocks,
    entities: (db.entities || []).map(adapt),
  };
}
