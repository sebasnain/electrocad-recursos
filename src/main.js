import DxfParser from 'dxf-parser';
import './styles.css';

// ── Conversor DXF → ElectroCAD ────────────────────────────────────────────
// Salida: el MISMO formato que usa ElectroCAD en `shapes[]` (ver formas.js):
//   {id, type:'line'|'rect'|'circle'|'arc', x1,y1,x2,y2, layer, h?, semi?, rot?, color?}
// y `texts[]` ({id,x,y,text,size,color,layer,rot}). Todo en cm, eje Y hacia abajo.
// Así, el día que ElectroCAD tenga "importar", alcanza con sumar estos arreglos.

const IMPORT_ENDPOINT = import.meta.env.VITE_ELECTROCAD_IMPORT_ENDPOINT || '';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SHAPES = 50000;
const SAMPLE_URL = `${import.meta.env.BASE_URL}sample-plan.dxf`;
const MARGIN_CM = 100;

const UNITS = { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 };
const UNIT_NAMES = { mm: 'milímetros', cm: 'centímetros', m: 'metros', in: 'pulgadas', ft: 'pies' };

// Para qué parece servir cada capa según su nombre (los planos de AutoCAD no son uniformes).
const LAYER_ROLES = [
  ['muros', 'Muros', /mur|pared|wall|tabique|estruct|colum|losa/i],
  ['aberturas', 'Aberturas', /abert|puert|vent|door|wind|glaz|carpint/i],
  ['cotas', 'Cotas', /cota|dim|acot|defpoints/i],
  ['ejes', 'Ejes', /\beje|axis|grid|grilla|centro|center/i],
  ['textos', 'Textos', /text|txt|rotul|anot|nota|leyenda/i],
  ['trama', 'Trama', /hatch|trama|achur|sombr|pattern|relleno/i],
  ['mobiliario', 'Mobiliario', /mueb|furn|mobil|sanit|equip|artefact/i],
  ['electrico', 'Eléctrico', /elec|ilum|lumin|toma|tablero|cabl/i],
];
const roleOf = name => LAYER_ROLES.find(r => r[2].test(name)) || null;

const state = {
  file: null, dxf: null, unitMode: 'auto', layers: new Map(),
  shapes: [], skipped: new Map(), warnings: [], bounds: null, payload: null,
  view: { k: 1, px: 0, py: 0 },
};

const app = document.querySelector('#app');
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="/" aria-label="Recursos ElectroCAD">
      <span class="brand-mark" aria-hidden="true">ϟ</span>
      <span>Recursos <strong>ElectroCAD</strong></span>
    </a>
    <span class="product-pill">Conversor DXF</span>
  </header>

  <main class="workspace">
    <section class="intro">
      <p class="eyebrow">IMPORTAR BASE ARQUITECTÓNICA</p>
      <h1>Pasá un plano de AutoCAD a ElectroCAD</h1>
      <p>Conservamos líneas, rectángulos, círculos, arcos y textos como formas editables, para que dibujes la instalación eléctrica encima.</p>
    </section>

    <section class="converter" aria-label="Conversor DXF">
      <aside class="controls">
        <div class="step"><span>1</span><div><strong>Archivo DWG o DXF</strong><small>Hasta 20 MB · dibujo 2D</small></div></div>
        <label id="dropzone" class="dropzone" tabindex="0">
          <input id="fileInput" type="file" accept=".dxf,.dwg,application/dxf,text/plain" hidden />
          <span class="upload-icon" aria-hidden="true">↥</span>
          <strong id="dropTitle">Arrastrá tu archivo acá</strong>
          <span id="dropHint">o hacé clic para buscarlo</span>
        </label>
        <p class="help-line">¿Tenés un .dwg? En AutoCAD usá <em>Guardar como → DXF</em> (versión 2010 o 2018, ASCII). <button id="sampleBtn" type="button" class="linklike">Probar con un plano de ejemplo</button></p>

        <div id="settings" class="settings hidden">
          <div class="step"><span>2</span><div><strong>Revisá la importación</strong><small>Unidades, capas y opciones</small></div></div>
          <label class="field">Unidades del dibujo
            <select id="unitSelect">
              <option value="auto">Detectar automáticamente</option>
              <option value="mm">Milímetros</option>
              <option value="cm">Centímetros</option>
              <option value="m">Metros</option>
              <option value="in">Pulgadas</option>
            </select>
            <small id="unitInfo" class="field-note"></small>
          </label>

          <div class="layer-head"><span>Capas incluidas</span><button id="toggleLayers" type="button">Ocultar todas</button></div>
          <div id="presets" class="presets hidden"></div>
          <div id="layerList" class="layer-list"></div>

          <label class="check-row"><input id="optRects" type="checkbox" checked /><span><strong>Reconocer rectángulos</strong><small>Cuatro lados a 90° pasan a ser un rectángulo que se puede redimensionar</small></span></label>
          <label class="check-row"><input id="optTexts" type="checkbox" checked /><span><strong>Incluir textos</strong><small>Rótulos y nombres de ambientes</small></span></label>
          <label class="check-row"><input id="optDims" type="checkbox" /><span><strong>Incluir cotas de AutoCAD</strong><small>Suelen ensuciar el plano; mejor medir en ElectroCAD</small></span></label>
          <label class="check-row"><input id="optColors" type="checkbox" /><span><strong>Conservar colores</strong><small>Si no, se ve con el aspecto normal de ElectroCAD</small></span></label>

          <div class="step final-step"><span>3</span><div><strong>Llevalo a ElectroCAD</strong><small id="finalHint"></small></div></div>
          <button id="convertBtn" class="primary" type="button"></button>
          <button id="downloadBtn" class="secondary hidden" type="button">Descargar archivo .json</button>
        </div>
      </aside>

      <div class="preview-panel">
        <div class="preview-head">
          <div><strong>Vista previa</strong><span id="fileMeta">Todavía no cargaste un archivo</span></div>
          <div id="stats" class="stats"></div>
        </div>
        <div id="canvasWrap" class="canvas-wrap empty">
          <canvas id="previewCanvas"></canvas>
          <div id="emptyState" class="empty-state"><span>⌗</span><strong>Tu plano aparecerá acá</strong><p>Podrás revisar qué elementos se conservarán antes de convertir.</p></div>
          <div id="viewTools" class="view-tools hidden"><button id="zoomIn" type="button" aria-label="Acercar">+</button><button id="zoomOut" type="button" aria-label="Alejar">−</button><button id="zoomFit" type="button" aria-label="Ver todo">⤢</button><button id="zoneBtn" type="button" aria-label="Elegir una zona" title="Elegir una zona (para hojas con varios planos)">▭</button></div>
        </div>
        <div id="notes" class="notes hidden"></div>
        <div id="legend" class="legend hidden"><span><i class="dot green"></i>Se convertirá</span><span><i class="dot gray"></i>Capa desactivada</span><span class="legend-tip">Rueda = zoom · arrastrar = mover · doble clic = ver todo</span></div>
      </div>
    </section>

    <section id="result" class="result hidden" aria-live="polite">
      <div class="result-icon">✓</div>
      <div><p class="eyebrow">PLANO CONVERTIDO</p><h2 id="resultTitle">La base ya está lista</h2><p id="resultText"></p></div>
      <div class="result-actions"><a id="openLink" class="primary link-button hidden" target="_blank" rel="noopener">Abrir en ElectroCAD</a><button id="copyLink" class="secondary hidden">Copiar enlace</button></div>
    </section>
    <p id="message" class="message" role="status"></p>
    <footer class="legal">Lectura de archivos DWG con <a href="https://github.com/mlightcad/libredwg-web" target="_blank" rel="noopener">libredwg-web</a> (GPL-3.0). Esta página es software libre bajo GPL-3.0${import.meta.env.VITE_SOURCE_URL ? ` · <a href="${import.meta.env.VITE_SOURCE_URL}" target="_blank" rel="noopener">código fuente</a>` : ''}. Todo se procesa en tu navegador: ningún archivo se sube.</footer>
  </main>
`;

const els = Object.fromEntries([
  'dropzone','fileInput','dropTitle','dropHint','sampleBtn','settings','unitSelect','unitInfo','layerList','presets','toggleLayers',
  'optRects','optTexts','optDims','optColors','finalHint','convertBtn','downloadBtn','previewCanvas','canvasWrap','emptyState',
  'viewTools','zoomIn','zoomOut','zoomFit','zoneBtn','fileMeta','stats','notes','legend','result','resultTitle','resultText','openLink','copyLink','message',
].map(id => [id, document.querySelector(`#${id}`)]));

els.convertBtn.innerHTML = IMPORT_ENDPOINT ? 'Convertir para ElectroCAD <span>→</span>' : 'Descargar para ElectroCAD <span>↓</span>';
els.finalHint.textContent = IMPORT_ENDPOINT ? 'Se crea un proyecto compartido de solo lectura' : 'Se descarga un archivo con todas las formas';
els.downloadBtn.classList.toggle('hidden', !IMPORT_ENDPOINT);

// ── utilidades ────────────────────────────────────────────────────────────
const fmt = n => n.toLocaleString('es-AR');
const round3 = n => Number(n.toFixed(3));
function escapeHtml(v) {
  return String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function formatBytes(b) { return b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`; }
function formatLen(cm) { return cm >= 100 ? `${(cm / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })} m` : `${Math.round(cm)} cm`; }
function setMessage(text, kind = '') { els.message.textContent = text; els.message.className = `message ${kind}`; }
function layerColor(index) { return ['#00e87a', '#4ca6ff', '#f3b73f', '#d979ff', '#ff6a6a', '#69d4d1', '#a9b5ca'][index % 7]; }

// Archivos ANSI (muy comunes en AutoCAD en castellano) se leen en windows-1252 si no son UTF-8 válido.
function decodeText(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1252').decode(buffer); }
}

// ── unidades ──────────────────────────────────────────────────────────────
function headerUnit(dxf) {
  return ({ 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' })[Number(dxf?.header?.$INSUNITS)] || null;
}
// Si el archivo no declara unidades (muy frecuente), se adivina por el tamaño del dibujo:
// un plano de casa mide entre ~5 y ~60 m.
function guessUnit(dxf) {
  const raw = convertEntities(dxf, 1, { texts: true });
  const b = boundsFor(raw.shapes);
  const span = Math.max(b.width, b.height);
  state.rawSpan = span;
  // Con varios textos, su altura típica (anotación de 10–50 cm) delata la unidad aunque
  // la hoja traiga varios planos o elementos lejanos.
  const hs = raw.shapes.filter(s => s.type === 'text').map(s => s.heightCm).sort((a, c) => a - c);
  if (hs.length >= 5) { const med = hs[Math.floor(hs.length / 2)]; return med < 3 ? 'm' : med < 100 ? 'cm' : 'mm'; }
  if (span > 2000) return 'mm';
  if (span > 150) return 'cm';
  return 'm';
}
// La unidad que declara el archivo se respeta solo si da un plano verosímil (3 m a 600 m):
// muchos DWG dicen "mm" pero están dibujados en metros.
function declaredUnitIsPlausible(h) {
  const cm = (state.rawSpan || 0) * (UNITS[h] || 0.1);
  return cm >= 300 && cm <= 60000;
}
function activeUnit() {
  if (state.unitMode !== 'auto') return state.unitMode;
  const h = headerUnit(state.dxf);
  return (h && declaredUnitIsPlausible(h)) ? h : (state.guessedUnit || h || 'mm');
}

// ── transformaciones (matriz afín, soporta espejo y escala distinta por eje) ──
const IDENT = [1, 0, 0, 1, 0, 0]; // x' = a·x + c·y + e ; y' = b·x + d·y + f
const apply = (m, p) => ({ x: m[0] * (p.x || 0) + m[2] * (p.y || 0) + m[4], y: m[1] * (p.x || 0) + m[3] * (p.y || 0) + m[5] });
const mul = (A, B) => [ // A·B (primero B, después A)
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];
const det = m => m[0] * m[3] - m[1] * m[2];
const areaScale = m => Math.sqrt(Math.abs(det(m)));
const rotationOf = m => Math.atan2(m[1], m[0]);

function insertMatrix(parent, ins, block) {
  const a = Number(ins.rotation || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const sx = Number(ins.xScale ?? 1), sy = Number(ins.yScale ?? 1);
  const base = block?.position || { x: 0, y: 0 };
  const local = [c * sx, s * sx, -s * sy, c * sy, Number(ins.position?.x || 0), Number(ins.position?.y || 0)];
  return mul(parent, mul(local, [1, 0, 0, 1, -(base.x || 0), -(base.y || 0)]));
}

// ── conversión de entidades ──────────────────────────────────────────────
// Matriz raíz: cm + eje Y invertido (ElectroCAD dibuja con Y hacia abajo).
// Con espejo (det<0) los arcos cambian de sentido, por eso el signo de `h` sale del determinante.
const hSign = m => (det(m) < 0 ? 1 : -1);

function hexOf(n) { return `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`; }
function entityColor(entity, layerName, dxf) {
  let rgb = null;
  if (entity.color != null && entity.colorIndex !== 256 && entity.colorIndex !== 0) rgb = entity.color;
  else { const l = dxf.tables?.layer?.layers?.[layerName]; if (l?.color != null) rgb = l.color; }
  if (rgb == null || rgb === 0xffffff || rgb === 0) return null; // blanco/negro = "automático"
  return hexOf(rgb);
}

function layerFor(entity, inherited) {
  const own = String(entity.layer ?? '0');
  return own === '0' ? inherited : own; // capa 0 dentro de un bloque hereda la del INSERT
}

function sagitta(chord, bulge) { return bulge * chord / 2; }

function evalBSpline(entity) {
  const cps = entity.controlPoints || [], deg = Number(entity.degreeOfSplineCurve || 3), knots = entity.knotValues || [];
  if (cps.length > deg && knots.length === cps.length + deg + 1) {
    const lo = knots[deg], hi = knots[knots.length - deg - 1], out = [];
    const N = Math.max(24, Math.min(200, cps.length * 8));
    for (let i = 0; i <= N; i++) {
      const t = i === N ? hi - 1e-9 : lo + (hi - lo) * i / N;
      let k = deg; while (k < knots.length - deg - 2 && t >= knots[k + 1]) k++;
      let d = cps.slice(k - deg, k + 1).map(p => ({ x: p.x, y: p.y }));
      for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
        const den = knots[j + 1 + k - r] - knots[j + k - deg];
        const al = den ? (t - knots[j + k - deg]) / den : 0;
        d[j] = { x: (1 - al) * d[j - 1].x + al * d[j].x, y: (1 - al) * d[j - 1].y + al * d[j].y };
      }
      out.push(d[deg]);
    }
    if (out.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return { pts: out, exact: true };
  }
  const pts = (entity.fitPoints?.length > 1 ? entity.fitPoints : cps) || [];
  return { pts, exact: false };
}

function ellipsePoints(e) {
  const c = e.center, m = e.majorAxisEndPoint, r = Number(e.axisRatio || 1);
  const a0 = Number(e.startAngle ?? 0);
  let a1 = Number(e.endAngle ?? Math.PI * 2);
  if (a1 <= a0) a1 += Math.PI * 2;
  const mx = m.x, my = m.y, nx = -my * r, ny = mx * r, N = 64;
  return Array.from({ length: N + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / N;
    return { x: c.x + mx * Math.cos(a) + nx * Math.sin(a), y: c.y + my * Math.cos(a) + ny * Math.sin(a) };
  });
}

function cleanMText(raw) {
  return String(raw || '')
    .replace(/\\P/gi, '\n').replace(/\\~/g, ' ')
    .replace(/\\[fFcCHhWwQqTtAa][^;]*;/g, '')   // fuente, color, alto, ancho...
    .replace(/\\[LlOoKk]/g, '').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[cC]/g, 'Ø')
    .replace(/\\S([^;^/#]*)[\^/#]([^;]*);/g, '$1/$2').replace(/[{}]/g, '').replace(/\\\\/g, '\\').trim();
}

// Devuelve { shapes, skipped:Map, approximated:number }. `opts` controla rectángulos/textos/cotas/colores.
function convertEntities(dxf, factor, opts) {
  const out = [], skipped = new Map();
  let approximated = 0;
  const skip = type => skipped.set(type, (skipped.get(type) || 0) + 1);
  const root = [factor, 0, 0, -factor, 0, 0];

  const push = s => { out.push(s); if (out.length > MAX_SHAPES) throw new Error(`El archivo supera el límite de ${fmt(MAX_SHAPES)} figuras. Probá apagar capas en AutoCAD o exportar solo la planta.`); };

  const walk = (entities, m, inherited, depth) => {
    if (depth > 8) return;
    for (const e of entities || []) {
      const layer = layerFor(e, inherited);
      const common = () => ({ layer, color: opts.colors ? entityColor(e, layer, dxf) : null });
      switch (e.type) {
        case 'INSERT': {
          const block = dxf.blocks?.[e.name];
          if (!block?.entities) { skip('INSERT sin bloque'); break; }
          const cols = Math.max(1, Number(e.columnCount || 1)), rows = Math.max(1, Number(e.rowCount || 1));
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const ins = { ...e, position: { x: Number(e.position?.x || 0) + c * Number(e.columnSpacing || 0), y: Number(e.position?.y || 0) + r * Number(e.rowSpacing || 0) } };
            walk(block.entities, insertMatrix(m, ins, block), layer, depth + 1);
          }
          break;
        }
        case 'DIMENSION': {
          if (!opts.dims) break;
          const block = e.block && dxf.blocks?.[e.block];
          if (block?.entities) walk(block.entities, m, layer, depth + 1);
          break;
        }
        case 'LINE': {
          const p = e.vertices || [e.start, e.end];
          if (p[0] && p[1]) { const a = apply(m, p[0]), b = apply(m, p[1]); push({ type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...common() }); }
          break;
        }
        case 'LWPOLYLINE': case 'POLYLINE': {
          const v = (e.vertices || []).filter(Boolean);
          if (v.length < 2) break;
          const closed = Boolean(e.shape || e.closed);
          const pts = v.map(p => apply(m, p));
          const rect = opts.rects && closed && v.length === 4 && !v.some(p => p.bulge) ? asRect(pts) : null;
          if (rect) { push({ ...rect, ...common() }); break; }
          const n = closed ? v.length : v.length - 1;
          for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % v.length], bulge = Number(v[i].bulge || 0);
            if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
            const seg = { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            if (bulge) {
              const chord = Math.hypot(b.x - a.x, b.y - a.y), h = sagitta(chord, bulge) * hSign(m);
              Object.assign(seg, { type: 'arc', h });
              if (Math.abs(Math.abs(h) - chord / 2) < chord * 0.002) seg.semi = true;
            }
            push({ ...seg, ...common() });
          }
          break;
        }
        case 'CIRCLE': {
          const c = apply(m, e.center), r = Number(e.radius || 0) * areaScale(m);
          if (r > 0) push({ type: 'circle', x1: c.x, y1: c.y, x2: c.x + r, y2: c.y, ...common() });
          break;
        }
        case 'ARC': {
          const c = e.center, R = Number(e.radius || 0), a1 = Number(e.startAngle || 0);
          let span = Number(e.endAngle ?? a1 + Math.PI * 2) - a1; if (span <= 0) span += Math.PI * 2;
          const p1 = apply(m, { x: c.x + R * Math.cos(a1), y: c.y + R * Math.sin(a1) });
          const p2 = apply(m, { x: c.x + R * Math.cos(a1 + span), y: c.y + R * Math.sin(a1 + span) });
          const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (R <= 0) break;
          if (chord < 1e-6) { const cc = apply(m, c); push({ type: 'circle', x1: cc.x, y1: cc.y, x2: cc.x + R * areaScale(m), y2: cc.y, ...common() }); break; }
          const h = R * areaScale(m) * (1 - Math.cos(span / 2)) * hSign(m);
          const arc = { type: 'arc', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, h };
          if (Math.abs(span - Math.PI) < 0.005) { arc.semi = true; arc.h = Math.sign(h) * chord / 2; }
          push({ ...arc, ...common() });
          break;
        }
        case 'ELLIPSE': case 'SPLINE': {
          let pts;
          if (e.type === 'ELLIPSE') pts = ellipsePoints(e);
          else { const r = evalBSpline(e); pts = r.pts; if (!r.exact) approximated++; }
          const q = pts.map(p => apply(m, p));
          for (let i = 0; i < q.length - 1; i++) if (Math.hypot(q[i + 1].x - q[i].x, q[i + 1].y - q[i].y) > 1e-6) push({ type: 'line', x1: q[i].x, y1: q[i].y, x2: q[i + 1].x, y2: q[i + 1].y, ...common() });
          break;
        }
        case 'TEXT': case 'MTEXT': {
          if (!opts.texts) break;
          const text = e.type === 'MTEXT' ? cleanMText(e.text) : String(e.text || '').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[cC]/g, 'Ø');
          if (!text) break;
          const pos = apply(m, e.startPoint || e.position || { x: 0, y: 0 });
          const heightCm = Number(e.textHeight || e.height || 10) * areaScale(m);
          const th = Number(e.rotation || 0) * Math.PI / 180, vx = Math.cos(th), vy = Math.sin(th);
          const rot = Math.atan2(m[1] * vx + m[3] * vy, m[0] * vx + m[2] * vy); // ángulo final en pantalla (Y hacia abajo)
          push({ type: 'text', x1: pos.x, y1: pos.y, text, heightCm, rot, top: e.type === 'MTEXT', ...common() });
          break;
        }
        case 'SOLID': case '3DFACE': case 'POINT': case 'ATTDEF': case 'ATTRIB': case 'VIEWPORT': case 'MLINE': case 'LEADER':
          skip(e.type);
          break;
        default:
          skip(e.type);
      }
    }
  };

  walk(dxf.entities, root, '0', 0);
  return { shapes: out, skipped, approximated };
}

// Cuatro puntos → rectángulo (posiblemente girado) o null si no son perpendiculares.
function asRect(p) {
  let [v0, v1, v2, v3] = p;
  let e1 = { x: v1.x - v0.x, y: v1.y - v0.y }, e2 = { x: v3.x - v0.x, y: v3.y - v0.y };
  if (e1.x * e2.y - e1.y * e2.x < 0) { [v1, v3] = [v3, v1]; [e1, e2] = [e2, e1]; }
  const w = Math.hypot(e1.x, e1.y), h = Math.hypot(e2.x, e2.y);
  if (w < 1e-6 || h < 1e-6) return null;
  const tol = Math.max(w, h) * 0.002;
  if (Math.abs(e1.x * e2.x + e1.y * e2.y) > w * h * 0.002) return null;
  if (Math.hypot(v2.x - (v1.x + v3.x - v0.x), v2.y - (v1.y + v3.y - v0.y)) > tol) return null;
  const cx = (v0.x + v2.x) / 2, cy = (v0.y + v2.y) / 2;
  // Un rectángulo girado 90° es el mismo: se lleva el giro a [-45°, 45°] intercambiando ancho y alto.
  const q = Math.round(Math.atan2(e1.y, e1.x) / (Math.PI / 2)), a = Math.atan2(e1.y, e1.x) - q * Math.PI / 2;
  const [rw, rh] = q % 2 ? [h, w] : [w, h];
  const rect = { type: 'rect', x1: cx - rw / 2, y1: cy - rh / 2, x2: cx + rw / 2, y2: cy + rh / 2 };
  if (Math.abs(a) > 1e-4) rect.rot = a;
  return rect;
}

// ── geometría común para vista previa y exportación ─────────────────────
function arcPoints(s, steps = 48) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, c = Math.hypot(dx, dy), h = s.h;
  if (Math.abs(h) < 0.01 || c < 0.01) return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
  const R = (c * c / 4 + h * h) / (2 * Math.abs(h)), nx = -dy / c, ny = dx / c, sg = h > 0 ? 1 : -1;
  const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2, cx = mx + nx * (h - sg * R), cy = my + ny * (h - sg * R);
  const a1 = Math.atan2(s.y1 - cy, s.x1 - cx), a2 = Math.atan2(s.y2 - cy, s.x2 - cx);
  let sw = (a2 - a1) % (2 * Math.PI); if (sw < 0) sw += 2 * Math.PI;
  const ap = { x: mx + nx * h, y: my + ny * h };
  const at = sweep => ({ x: cx + R * Math.cos(a1 + sweep / 2), y: cy + R * Math.sin(a1 + sweep / 2) });
  if (Math.hypot(at(sw - 2 * Math.PI).x - ap.x, at(sw - 2 * Math.PI).y - ap.y) < Math.hypot(at(sw).x - ap.x, at(sw).y - ap.y)) sw -= 2 * Math.PI;
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: cx + R * Math.cos(a1 + sw * i / steps), y: cy + R * Math.sin(a1 + sw * i / steps) }));
}

function rectCorners(s) {
  const x0 = Math.min(s.x1, s.x2), x1 = Math.max(s.x1, s.x2), y0 = Math.min(s.y1, s.y2), y1 = Math.max(s.y1, s.y2);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = s.rot || 0, c = Math.cos(a), n = Math.sin(a);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => ({ x: cx + (x - cx) * c - (y - cy) * n, y: cy + (x - cx) * n + (y - cy) * c }));
}

function shapePoints(s) {
  switch (s.type) {
    case 'line': return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
    case 'arc': return arcPoints(s, 12);
    case 'rect': return rectCorners(s);
    case 'circle': { const r = Math.hypot(s.x2 - s.x1, s.y2 - s.y1); return [{ x: s.x1 - r, y: s.y1 - r }, { x: s.x1 + r, y: s.y1 + r }]; }
    case 'text': return [{ x: s.x1, y: s.y1 }];
    default: return [];
  }
}

function boundsFor(shapes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) for (const p of shapePoints(s)) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

// ── estado derivado ──────────────────────────────────────────────────────
function options() { return { rects: els.optRects.checked, texts: els.optTexts.checked, dims: els.optDims.checked, colors: els.optColors.checked }; }

// Zona elegida en la vista previa (para hojas con varios planos): se conserva lo que tiene su centro adentro.
function inZone(s) {
  const c = state.clip; if (!c) return true;
  if (s._cx === undefined) { const b = boundsFor([s]); s._cx = (b.minX + b.maxX) / 2; s._cy = (b.minY + b.maxY) / 2; }
  return s._cx >= c.x0 && s._cx <= c.x1 && s._cy >= c.y0 && s._cy <= c.y1;
}
const shapeOn = s => state.layers.get(s.layer)?.enabled !== false && inZone(s);
function enabledShapes() { return state.shapes.filter(shapeOn); }

function layerDefaults(dxf) {
  const table = dxf.tables?.layer?.layers || {};
  return name => {
    const l = table[name];
    const off = l ? (l.visible === false || l.frozen === true) : false;
    return { off };
  };
}

function buildShapes(first = false) {
  const factor = UNITS[activeUnit()] || 0.1;
  const { shapes, skipped, approximated } = convertEntities(state.dxf, factor, options());
  state.shapes = shapes; state.skipped = skipped;
  // capas: se cuentan sobre las figuras reales (incluye lo que viene dentro de bloques)
  const info = layerDefaults(state.dxf), prev = state.layers, next = new Map();
  for (const s of shapes) {
    if (!next.has(s.layer)) {
      const was = prev.get(s.layer);
      const off = first ? info(s.layer).off : false;
      next.set(s.layer, { name: s.layer, enabled: was ? was.enabled : !off, count: 0, off: info(s.layer).off, role: roleOf(s.layer) });
    }
    next.get(s.layer).count++;
  }
  state.layers = new Map([...next].sort((a, b) => a[0].localeCompare(b[0], 'es')));
  state.approximated = approximated;
  refresh(true);
}

function refresh(fit = false) {
  const on = enabledShapes();
  state.bounds = boundsFor(on.length ? on : state.shapes);
  if (fit) resetView();
  renderLayers(); renderPresets(); updateStats(); renderNotes(); renderPreview();
}

function renderLayers() {
  els.layerList.innerHTML = [...state.layers.values()].map((l, i) => `
    <label class="layer-row">
      <input type="checkbox" data-layer="${escapeHtml(l.name)}" ${l.enabled ? 'checked' : ''} />
      <i style="--layer-color:${layerColor(i)}"></i>
      <span class="lname"><b title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</b>${l.role ? `<em class="role role-${l.role[0]}">${l.role[1]}</em>` : ''}${l.off ? '<em class="role role-off" title="Estaba apagada o congelada en AutoCAD">apagada</em>' : ''}</span>
      <small>${fmt(l.count)}</small>
    </label>`).join('');
  const any = [...state.layers.values()].some(l => l.enabled);
  els.toggleLayers.textContent = any ? 'Ocultar todas' : 'Mostrar todas';
}

function renderPresets() {
  const layers = [...state.layers.values()];
  const has = key => layers.some(l => l.role?.[0] === key);
  const presets = [];
  if (has('muros') || has('aberturas')) presets.push(['arq', 'Solo muros y aberturas']);
  if (has('cotas') || has('ejes') || has('trama')) presets.push(['limpio', 'Sin cotas, ejes ni tramas']);
  els.presets.innerHTML = presets.map(([id, label]) => `<button type="button" data-preset="${id}">${label}</button>`).join('');
  els.presets.classList.toggle('hidden', !presets.length);
}

function applyPreset(id) {
  state.layers.forEach(l => {
    const k = l.role?.[0];
    if (id === 'arq') l.enabled = k === 'muros' || k === 'aberturas';
    if (id === 'limpio') l.enabled = !['cotas', 'ejes', 'trama'].includes(k) && !l.off;
  });
  refresh(true);
}

function updateStats() {
  const active = enabledShapes();
  const b = boundsFor(active.length ? active : state.shapes);
  els.stats.innerHTML = `${state.clip ? '<button type="button" class="zone-chip" data-zone-clear title="Volver a ver todo el plano">Zona elegida ✕</button>' : ''}<span>${fmt(active.length)} figuras</span><span>${[...state.layers.values()].filter(l => l.enabled).length} capas</span><span>${formatLen(b.width)} × ${formatLen(b.height)}</span>`;
  const types = active.reduce((a, s) => (a[s.type] = (a[s.type] || 0) + 1, a), {});
  const names = { line: 'líneas', arc: 'arcos', circle: 'círculos', rect: 'rectángulos', text: 'textos' };
  els.fileMeta.textContent = `${state.file.name} · ${formatBytes(state.file.size)}${active.length ? ' · ' + Object.entries(types).map(([t, c]) => `${fmt(c)} ${names[t] || t}`).join(' · ') : ''}`;
  const u = activeUnit();
  els.unitInfo.textContent = state.unitMode === 'auto'
    ? `Detectado: ${UNIT_NAMES[u]} (${headerUnit(state.dxf) && declaredUnitIsPlausible(headerUnit(state.dxf)) ? 'lo indica el archivo' : 'estimado por el tamaño del dibujo'})`
    : '';
}

function renderNotes() {
  const notes = [];
  const b = state.bounds, span = Math.max(b.width, b.height);
  if (span > 20000) notes.push(['warn', `El plano mide ${formatLen(b.width)} × ${formatLen(b.height)}: parece demasiado grande. Revisá las unidades o apagá capas con elementos lejanos.`]);
  else if (span < 200) notes.push(['warn', `El plano mide solo ${formatLen(b.width)} × ${formatLen(b.height)}: revisá las unidades.`]);
  const skipped = [...state.skipped].filter(([t]) => !['INSERT sin bloque'].includes(t));
  if (skipped.length) notes.push(['info', `No se importaron: ${skipped.map(([t, c]) => `${fmt(c)} ${t}`).join(', ')}.`]);
  if (state.rawSkipped?.length) notes.push(['info', `El archivo trae elementos que el conversor no lee: ${state.rawSkipped.map(([t, c]) => `${fmt(c)} ${t}`).join(', ')}.`]);
  // ElectroCAD guarda el proyecto en un documento de ~1 MB: más de unas 6.000 figuras no entran.
  const est = enabledShapes().length * 105;
  if (est > 450 * 1024) notes.push(['warn', `Son demasiadas figuras (${fmt(enabledShapes().length)}): ElectroCAD no va a poder guardar el proyecto. Apagá capas de detalle (mobiliario, tramas, cotas) hasta bajar de unas 5.000.`]);
  if (state.approximated) notes.push(['info', `${fmt(state.approximated)} curva(s) spline se aproximaron con segmentos rectos.`]);
  els.notes.innerHTML = notes.map(([k, t]) => `<p class="note ${k}">${escapeHtml(t)}</p>`).join('');
  els.notes.classList.toggle('hidden', !notes.length);
}

// ── vista previa con zoom y desplazamiento ──────────────────────────────
let raf = 0;
function schedulePreview() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderPreview(); }); }
function resetView() { state.view = { k: 1, px: 0, py: 0 }; }
function viewMetrics(width, height) {
  const b = state.bounds, pad = 44, base = Math.min((width - pad * 2) / b.width, (height - pad * 2) / b.height);
  const S = base * state.view.k, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  return { S, ox: width / 2 + state.view.px - cx * S, oy: height / 2 + state.view.py - cy * S };
}

function renderPreview() {
  const canvas = els.previewCanvas, rect = els.canvasWrap.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(320, rect.width), height = Math.max(360, rect.height);
  canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  if (!state.shapes.length) return;
  const { S, ox, oy } = viewMetrics(width, height), pt = p => ({ x: ox + p.x * S, y: oy + p.y * S });
  const names = [...state.layers.keys()];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const draw = (enabledPass) => {
    for (const s of state.shapes) {
      const enabled = shapeOn(s);
      if (enabled !== enabledPass) continue;
      ctx.strokeStyle = ctx.fillStyle = enabled ? (s.color || layerColor(names.indexOf(s.layer))) : '#354052';
      ctx.globalAlpha = enabled ? 0.92 : 0.16; ctx.lineWidth = enabled ? 1.25 : 0.8;
      ctx.beginPath();
      if (s.type === 'line') { const a = pt({ x: s.x1, y: s.y1 }), b = pt({ x: s.x2, y: s.y2 }); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      else if (s.type === 'arc') { arcPoints(s).map(pt).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); }
      else if (s.type === 'rect') { rectCorners(s).map(pt).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); }
      else if (s.type === 'circle') { const c = pt({ x: s.x1, y: s.y1 }); ctx.arc(c.x, c.y, Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * S, 0, Math.PI * 2); }
      else if (s.type === 'text') {
        const px = s.heightCm * S;
        if (px >= 4) { const p = pt({ x: s.x1, y: s.y1 }); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(s.rot || 0); ctx.font = `${Math.min(px, 60)}px DM Sans, sans-serif`; ctx.fillText(s.text.split('\n')[0].slice(0, 80), 0, 0); ctx.restore(); }
        continue;
      }
      ctx.stroke();
    }
  };
  draw(false); draw(true); ctx.globalAlpha = 1;
  // marco de la zona elegida / del arrastre en curso
  ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeStyle = '#00e87a';
  if (state.clip) { const a = pt({ x: state.clip.x0, y: state.clip.y0 }), b = pt({ x: state.clip.x1, y: state.clip.y1 }); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
  if (zoneDrag) ctx.strokeRect(zoneDrag.x0, zoneDrag.y0, zoneDrag.x1 - zoneDrag.x0, zoneDrag.y1 - zoneDrag.y0);
  ctx.setLineDash([]);
}

function zoomAt(factor, mx, my) {
  const rect = els.canvasWrap.getBoundingClientRect(), W = Math.max(320, rect.width), H = Math.max(360, rect.height);
  const k = Math.min(200, Math.max(0.2, state.view.k * factor)), ratio = k / state.view.k;
  const dx = mx - W / 2, dy = my - H / 2;
  state.view.px = dx - (dx - state.view.px) * ratio; state.view.py = dy - (dy - state.view.py) * ratio; state.view.k = k;
  schedulePreview();
}

// ── carga de archivos ────────────────────────────────────────────────────
const RAW_UNREAD = ['HATCH', 'LEADER', 'IMAGE', 'WIPEOUT', 'MLINE', 'REGION', '3DSOLID', 'MLEADER'];
function scanUnread(source) {
  const counts = new Map();
  for (const m of source.matchAll(/^\s*0\r?\n\s*([A-Z0-9_]+)\s*$/gm)) if (RAW_UNREAD.includes(m[1])) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  return [...counts];
}

async function handleFile(file) {
  setMessage(''); els.result.classList.add('hidden'); state.payload = null;
  if (!file) return;
  const isDwg = /\.dwg$/i.test(file.name);
  if (!isDwg && !/\.dxf$/i.test(file.name)) return setMessage('Elegí un archivo .dwg o .dxf.', 'error');
  if (file.size > MAX_FILE_BYTES) return setMessage('El archivo supera el límite de 20 MB.', 'error');
  els.dropTitle.textContent = 'Leyendo el archivo…';
  try {
    const buffer = await file.arrayBuffer();
    let dxf, source = '';
    if (isDwg) {
      if (!/^AC10/.test(new TextDecoder('latin1').decode(buffer.slice(0, 6)))) throw new Error('no parece un archivo DWG de AutoCAD.');
      els.dropHint.textContent = 'Cargando el lector de DWG (la primera vez tarda unos segundos)…';
      dxf = await (await import('./dwg.js')).dwgToDxfLike(buffer);
    } else {
      if (new TextDecoder('latin1').decode(buffer.slice(0, 22)).startsWith('AutoCAD Binary DXF')) throw new Error('es un DXF binario. Guardalo como DXF de texto (ASCII).');
      source = decodeText(buffer);
      dxf = new DxfParser().parseSync(source);
    }
    if (!dxf?.entities?.length) throw new Error('el archivo no contiene dibujo en el espacio modelo.');
    state.clip = null; state.zoneMode = false; state.file = file; state.dxf = dxf; state.unitMode = 'auto'; els.unitSelect.value = 'auto';
    state.guessedUnit = guessUnit(dxf); state.layers = new Map(); state.rawSkipped = source ? scanUnread(source) : [];
    buildShapes(true);
    if (!state.shapes.length) throw new Error('no se encontró geometría que se pueda convertir.');
    els.dropTitle.textContent = file.name; els.dropHint.textContent = `${formatBytes(file.size)} · Cambiar archivo`;
    els.settings.classList.remove('hidden'); els.canvasWrap.classList.remove('empty'); els.emptyState.hidden = true;
    els.legend.classList.remove('hidden'); els.viewTools.classList.remove('hidden');
    setMessage(`Detectamos ${fmt(state.shapes.length)} figuras. Revisá unidades y capas antes de convertir.`, 'success');
  } catch (error) {
    state.file = null; state.dxf = null; state.shapes = [];
    els.dropTitle.textContent = 'Arrastrá tu archivo acá'; els.dropHint.textContent = 'o hacé clic para buscarlo';
    setMessage(`No pudimos interpretar el archivo: ${error.message}`, 'error');
  }
}

// ── exportación ──────────────────────────────────────────────────────────
function createPayload() {
  const selected = enabledShapes();
  if (!selected.length) throw new Error('Activá al menos una capa para convertir.');
  // El origen sale de TODO el archivo: dos zonas del mismo plano comparten coordenadas y, importadas
  // por separado en ElectroCAD, quedan una junto a la otra.
  const b = boundsFor(selected), ball = boundsFor(state.shapes), off = { x: ball.minX - MARGIN_CM, y: ball.minY - MARGIN_CM };
  const shapes = [], texts = [];
  let sid = 1, tid = 1;
  for (const s of selected) {
    if (s.type === 'text') {
      const size = Math.max(8, Math.min(72, Math.round(s.heightCm * 2))); // 2 px por cm a zoom 1
      // ElectroCAD centra el texto en su punto; AutoCAD lo ancla abajo-izquierda (MTEXT: arriba-izquierda).
      const lines = s.text.split('\n'), w = Math.max(...lines.map(l => l.length)) * s.heightCm * 0.55, hh = lines.length * s.heightCm * 1.25;
      const dx = Math.cos(s.rot || 0), dy = Math.sin(s.rot || 0), up = s.top ? -hh / 2 : hh / 2 - s.heightCm * 0.25;
      const cx = s.x1 + dx * w / 2 + dy * up, cy = s.y1 + dy * w / 2 - dx * up;
      const t = { id: tid++, x: round3(cx - off.x), y: round3(cy - off.y), text: s.text, size, color: s.color || '', layer: 'infra' };
      if (s.rot) t.rot = round3(s.rot);
      texts.push(t); continue;
    }
    const o = { id: sid++, type: s.type, x1: round3(s.x1 - off.x), y1: round3(s.y1 - off.y), x2: round3(s.x2 - off.x), y2: round3(s.y2 - off.y), layer: 'infra' };
    if (s.type === 'arc') { o.h = round3(s.h); if (s.semi) o.semi = true; }
    if (s.rot) o.rot = round3(s.rot);
    if (s.color) o.color = s.color;
    shapes.push(o);
  }
  return {
    electrocadImportV: 1,
    origenId: `${state.file.name}|${state.file.size}|${activeUnit()}`,
    name: state.file.name.replace(/\.(dxf|dwg)$/i, '') || 'Plano importado',
    source: { format: 'DXF', fileName: state.file.name, unit: activeUnit(), importedAt: new Date().toISOString() },
    extentCm: { width: round3(b.width + MARGIN_CM * 2), height: round3(b.height + MARGIN_CM * 2) },
    shapes, texts,
  };
}

function downloadPayload() {
  const blob = new Blob([JSON.stringify(state.payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.payload.name.replace(/[^a-z0-9-_]+/gi, '-')}.electrocad.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function convert() {
  els.convertBtn.disabled = true;
  try {
    state.payload = createPayload();
    const p = state.payload, summary = `${fmt(p.shapes.length)} formas y ${fmt(p.texts.length)} textos.`;
    if (!IMPORT_ENDPOINT) {
      downloadPayload();
      els.resultTitle.textContent = 'Archivo descargado';
      els.resultText.textContent = `${summary} Guardalo: la importación dentro de ElectroCAD se habilita próximamente.`;
      els.result.classList.remove('hidden'); els.result.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    els.downloadBtn.disabled = false;
    const response = await fetch(IMPORT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.error || 'El servidor no devolvió el enlace del proyecto.');
    els.openLink.href = result.url; els.openLink.classList.remove('hidden'); els.copyLink.classList.remove('hidden');
    els.resultTitle.textContent = 'La base ya está lista'; els.resultText.textContent = `${summary} Quedó en modo de solo lectura.`;
    els.result.classList.remove('hidden'); els.result.scrollIntoView({ behavior: 'smooth', block: 'center' }); els.copyLink.dataset.url = result.url;
  } catch (error) { setMessage(error.message, 'error'); }
  finally { els.convertBtn.disabled = false; }
}

// ── eventos ──────────────────────────────────────────────────────────────
els.fileInput.addEventListener('change', e => handleFile(e.target.files?.[0]));
['dragenter', 'dragover'].forEach(t => els.dropzone.addEventListener(t, e => { e.preventDefault(); els.dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(t => els.dropzone.addEventListener(t, e => { e.preventDefault(); els.dropzone.classList.remove('dragging'); }));
els.dropzone.addEventListener('drop', e => handleFile(e.dataTransfer.files?.[0]));
els.dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); } });
els.sampleBtn.addEventListener('click', async () => {
  try { const r = await fetch(SAMPLE_URL); handleFile(new File([await r.blob()], 'plano-de-ejemplo.dxf')); }
  catch { setMessage('No se pudo cargar el ejemplo.', 'error'); }
});
els.unitSelect.addEventListener('change', () => { state.unitMode = els.unitSelect.value; buildShapes(true); });
[els.optRects, els.optTexts, els.optDims, els.optColors].forEach(el => el.addEventListener('change', () => state.dxf && buildShapes()));
els.layerList.addEventListener('change', e => { const l = state.layers.get(e.target.dataset.layer); if (!l) return; l.enabled = e.target.checked; refresh(); });
els.presets.addEventListener('click', e => { const id = e.target.dataset.preset; if (id) applyPreset(id); });
els.toggleLayers.addEventListener('click', () => { const on = [...state.layers.values()].some(l => !l.enabled); state.layers.forEach(l => l.enabled = on); refresh(true); });
els.convertBtn.addEventListener('click', convert);
els.downloadBtn.addEventListener('click', () => { try { if (!state.payload) state.payload = createPayload(); downloadPayload(); } catch (e) { setMessage(e.message, 'error'); } });
els.copyLink.addEventListener('click', async () => { await navigator.clipboard.writeText(els.copyLink.dataset.url); els.copyLink.textContent = 'Enlace copiado'; setTimeout(() => els.copyLink.textContent = 'Copiar enlace', 1600); });
window.addEventListener('resize', () => { if (state.shapes.length) schedulePreview(); });

// zoom / desplazamiento
const cvs = els.previewCanvas; let drag = null;
const local = e => { const r = cvs.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
cvs.addEventListener('wheel', e => { if (!state.shapes.length) return; e.preventDefault(); const m = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, m.x, m.y); }, { passive: false });
let zoneDrag = null;
const toSource = (x, y) => { const r = els.canvasWrap.getBoundingClientRect(), { S, ox, oy } = viewMetrics(Math.max(320, r.width), Math.max(360, r.height)); return { x: (x - ox) / S, y: (y - oy) / S }; };
function setZoneMode(on) { state.zoneMode = on; els.zoneBtn.classList.toggle('active', on); cvs.style.cursor = on ? 'crosshair' : ''; if (on) setMessage('Arrastrá sobre el plano para marcar la zona que querés importar.'); }
function clearZone() { state.clip = null; zoneDrag = null; setZoneMode(false); state.shapes.forEach(s => { delete s._cx; delete s._cy; }); refresh(true); }
cvs.addEventListener('pointerdown', e => {
  cvs.setPointerCapture(e.pointerId);
  if (state.zoneMode) { const m = local(e); zoneDrag = { x0: m.x, y0: m.y, x1: m.x, y1: m.y }; return; }
  drag = { x: e.clientX, y: e.clientY, px: state.view.px, py: state.view.py }; cvs.classList.add('panning');
});
cvs.addEventListener('pointermove', e => {
  if (zoneDrag) { const m = local(e); zoneDrag.x1 = m.x; zoneDrag.y1 = m.y; schedulePreview(); return; }
  if (!drag) return; state.view.px = drag.px + e.clientX - drag.x; state.view.py = drag.py + e.clientY - drag.y; schedulePreview();
});
['pointerup', 'pointercancel'].forEach(t => cvs.addEventListener(t, () => {
  drag = null; cvs.classList.remove('panning');
  if (!zoneDrag) return;
  const z = zoneDrag; zoneDrag = null;
  if (Math.abs(z.x1 - z.x0) > 8 && Math.abs(z.y1 - z.y0) > 8) {
    const a = toSource(Math.min(z.x0, z.x1), Math.min(z.y0, z.y1)), b = toSource(Math.max(z.x0, z.x1), Math.max(z.y0, z.y1));
    state.clip = { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; setZoneMode(false);
    refresh(true); setMessage(`Zona elegida: ${fmt(enabledShapes().length)} figuras. Podés cambiar capas u opciones.`, 'success');
  } else schedulePreview();
}));
els.zoneBtn.addEventListener('click', () => setZoneMode(!state.zoneMode));
els.stats.addEventListener('click', e => { if (e.target.closest('[data-zone-clear]')) clearZone(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && state.zoneMode) setZoneMode(false); });
cvs.addEventListener('dblclick', () => { resetView(); schedulePreview(); });
const center = () => { const r = els.canvasWrap.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
els.zoomIn.addEventListener('click', () => zoomAt(1.4, ...center()));
els.zoomOut.addEventListener('click', () => zoomAt(1 / 1.4, ...center()));
els.zoomFit.addEventListener('click', () => { resetView(); schedulePreview(); });

if (document.modelContext?.registerTool) {
  const controller = new AbortController();
  Promise.resolve(document.modelContext.registerTool({ name: 'get_dxf_conversion_summary', title: 'Revisar conversión DXF', description: 'Devuelve un resumen de las figuras y capas actualmente seleccionadas para convertir.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => ({ file: state.file?.name || null, unit: state.dxf ? activeUnit() : null, shapes: enabledShapes().length, layers: [...state.layers.values()].filter(l => l.enabled).map(l => l.name) }) }, { signal: controller.signal })).catch(() => {});
}

// Expuesto para pruebas manuales / automáticas.
window.__dxf = { state, convertEntities, createPayload, asRect, arcPoints };
