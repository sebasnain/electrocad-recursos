// Packs dibujados A MANO (no salen de un DWG/PDF: las fuentes eran imágenes).
// node dibujar.mjs <carpeta-salida>  → escribe un eclib-*.json por pack.
// Cada símbolo se describe en unidades U (1 = 100 px de Fabric), eje y hacia ABAJO.
// Solo usa path / circle / text: es lo que entiende la vista previa de la página
// (src/simbolos.js) y lo que acepta el importador de ElectroCAD.
import fs from 'fs';
import path from 'path';

const COLOR = '#f5a623', SW = 6, U = 100;
const R = v => Math.round(v * 100) / 100;

// ── Primitivas ─────────────────────────────────────────────────────────
// Cada símbolo es una lista de piezas: {k:'L',pts,closed?} trazo, {k:'F',pts} relleno,
// {k:'C',x,y,r,fill?} círculo, {k:'T',x,y,text,size} texto (x,y = base izquierda).
const L = (...pts) => ({ k: 'L', pts });
const Lc = (...pts) => ({ k: 'L', pts, closed: true });
const F = (...pts) => ({ k: 'F', pts });
const C = (x, y, r, fill) => ({ k: 'C', x, y, r, fill: !!fill });
const T = (x, y, text, size) => ({ k: 'T', x, y, text, size });
const rect = (x, y, w, h) => Lc([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
const arcPts = (cx, cy, r, a0, a1, n = 24) => { // grados, sentido de pantalla (y abajo)
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
};
const arc = (...a) => L(...arcPts(...a));
// arco superior (∩) de un círculo: de 180° a 360°
const arco = (cx, cy, r) => arc(cx, cy, r, 180, 360);
const X = (cx, cy, s) => [L([cx - s, cy - s], [cx + s, cy + s]), L([cx + s, cy - s], [cx - s, cy + s])];
const flecha = (x, y, dx, dy, s = .14) => { // punta rellena en (x,y) apuntando a (dx,dy)
  const m = Math.hypot(dx, dy), ux = dx / m, uy = dy / m;
  return F([x, y], [x - ux * s - uy * s * .55, y - uy * s + ux * s * .55], [x - ux * s + uy * s * .55, y - uy * s - ux * s * .55]);
};

// Brazo de interruptor: sale del borde del círculo (cx,cy,r) con ángulo `ang` (grados de pantalla)
// hasta largo `len` desde el centro. Devuelve {p0,p1,d} para colgarle remates.
const brazo = (cx, cy, r, ang, len) => {
  const a = ang * Math.PI / 180, d = [Math.cos(a), Math.sin(a)];
  return { p0: [cx + d[0] * r, cy + d[1] * r], p1: [cx + d[0] * len, cy + d[1] * len], d };
};
const at = (b, t) => [b.p0[0] + (b.p1[0] - b.p0[0]) * t, b.p0[1] + (b.p1[1] - b.p0[1]) * t];
// remate perpendicular al brazo; lado 'cw' = girado 90° horario en pantalla, 'out' = hacia afuera en x
const remate = (b, t = 1, len = .28, lado = 'cw') => {
  let p = [-b.d[1], b.d[0]];               // horario en pantalla (y abajo)
  if (lado === 'ccw') p = [b.d[1], -b.d[0]];
  if (lado === 'out' && Math.sign(p[0]) !== Math.sign(b.d[0])) p = [-p[0], -p[1]];
  const q = at(b, t);
  return L(q, [q[0] + p[0] * len, q[1] + p[1] * len]);
};

// ── Fabric ─────────────────────────────────────────────────────────────
function toFabric(piezas) {
  const objs = [], stroke = [], fill = [];
  const P = ([x, y]) => [R(x * U), R(y * U)];
  for (const p of piezas.flat()) {
    if (p.k === 'C') { objs.push({ type: 'circle', originX: 'center', originY: 'center', left: R(p.x * U), top: R(p.y * U), radius: R(p.r * U), fill: p.fill ? COLOR : 'transparent', stroke: COLOR, strokeWidth: SW }); continue; }
    if (p.k === 'T') { objs.push({ type: 'text', originX: 'left', originY: 'bottom', left: R(p.x * U), top: R(p.y * U), text: p.text, fontSize: R(p.size * U), fill: COLOR, stroke: null, fontFamily: 'Arial', fontWeight: 'bold' }); continue; }
    const tgt = p.k === 'F' ? fill : stroke;
    p.pts.forEach((q, j) => tgt.push([j ? 'L' : 'M', ...P(q)]));
    if (p.closed || p.k === 'F') tgt.push(['Z']);
  }
  const pathObj = (pp, isFill) => {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (const q of pp) { if (q.length < 3) continue; a = Math.min(a, q[1]); c = Math.max(c, q[1]); b = Math.min(b, q[2]); d = Math.max(d, q[2]); }
    return { type: 'path', originX: 'left', originY: 'top', left: a, top: b, width: R(c - a), height: R(d - b), path: pp, fill: isFill ? COLOR : 'transparent', stroke: COLOR, strokeWidth: isFill ? 1 : SW, strokeLineCap: 'round', strokeLineJoin: 'round' };
  };
  if (stroke.length) objs.unshift(pathObj(stroke, false));
  if (fill.length) objs.push(pathObj(fill, true));
  return objs;
}
const sym = (name, piezas, desc = '') => ({
  name, description: desc, geometryData: { version: '5.3.0', objects: toFabric(piezas) },
  connectionPoints: [{ x: 0, y: 0, type: 'inout' }],
  materialConfig: { countInMaterials: false, materialName: name, unit: 'unidad', defaultQty: 1 },
  laborConfig: { count: false, type: 'boca', fixed: 0 },
});

// ── Pack 1: tabla general para planos (Latinoamérica) ──────────────────
const caja = () => rect(-.8, -.75, 1.6, 1.5);
const solarRayado = () => { // mitad de abajo rayada a 45°
  const out = [], x0 = -.8, x1 = .8, y0 = 0, y1 = .75;
  for (let k = x0 - (y1 - y0); k <= x1; k += .16) {
    let ax = k, ay = y1, bx = k + (y1 - y0), by = y0;           // línea de abajo-izq a arriba-der
    if (ax < x0) { ay -= (x0 - ax); ax = x0; }
    if (bx > x1) { by += (bx - x1); bx = x1; }
    if (ay > by && ax < bx) out.push(L([ax, ay], [bx, by]));
  }
  return out;
};
const casetaRayas = () => { // triángulo con vértice a la izquierda, rayado horizontal
  const out = [L([-.62, 0], [.8, -.6]), L([-.62, 0], [.8, .6])];
  for (let y = -.48; y <= .481; y += .12) out.push(L([-.62 + 1.42 * Math.abs(y) / .6, y], [.8, y]));
  return out;
};
const tomaRayas = (x0, x1, cx, cy, r, dy) => [-dy, dy].map(y => L([x0, cy + y], [Math.min(x1, cx + Math.sqrt(r * r - y * y)), cy + y]));

const pack1 = [
  sym('Central nuclear', [caja(), C(0, 0, .42)]),
  sym('Central geotérmica', [caja(), L([-.8, -.12], [.8, -.12]), L([-.45, .12], [.45, .12]), L([-.28, .3], [.28, .3]), L([-.11, .48], [.11, .48])]),
  sym('Central eólica', [caja(), L([-.8, 0], [.5, 0]), L([.2, -.75], [.8, .75]), L([.8, -.75], [.2, .75])]),
  sym('Central solar (en servicio)', [caja(), L([-.8, 0], [.8, 0]), ...solarRayado(),
    L([-.5, -.6], [-.18, -.25]), flecha(-.12, -.18, 1, 1.1), L([-.05, -.6], [.27, -.25]), flecha(.33, -.18, 1, 1.1)]),
  sym('Subestación (caseta, a la intemperie)', [caja(), ...casetaRayas()]),
  sym('Subestación convertidora', [C(0, -.35, .55), L([-.75, .55], [-.42, .55]), L([-.32, .8], [-.05, .32]),
    L(...Array.from({ length: 17 }, (_, i) => [.05 + i * .04, .55 - .12 * Math.sin(i / 16 * 2 * Math.PI)]))]),
  sym('Cabina para instalación exterior', [L([-.5, -.4], [-.5, .75], [.5, .75], [.5, -.4]),
    L(...Array.from({ length: 21 }, (_, i) => { const t = -1 + i / 10; return [t * .62, -.33 - .42 * (1 - t * t)]; }))]),
  sym('Tablero empotrado', [rect(-1, -.5, 2, 1), F([-1, .5], [1, -.5], [1, .5])]),
  sym('Soporte para línea aérea', [C(0, 0, .45)]),
  sym('Soporte de madera', [C(0, 0, .45), L([-.45, 0], [.45, 0]), L([0, -.45], [0, .45])]),
  sym('Soporte metálico', [C(0, 0, .45), F(...arcPts(0, 0, .45, -90, 90))]),
  sym('Torre', [F([-.4, -.4], [.4, -.4], [.4, .4], [-.4, .4])]),
  sym('Luminaria', [L([-1.1, 0], [.5, 0]), ...X(.5, 0, .28)]),
  sym('Línea aérea con soporte de concreto y retenida vertical', [C(0, .05, .2), L([-.95, -.35], [-.19, -.01]), L([.19, -.01], [.95, -.35]),
    L([0, .25], [0, .6]), L([-.16, .6], [.16, .6])]),
  sym('Red subterránea con soporte de concreto y luminaria', [L([-.95, -.5], [.95, -.5]), L([0, -.5], [0, -.32]), C(0, 0, .32),
    L([-.95, 0], [-.8, 0]), L([-.68, 0], [-.53, 0]), L([-.44, 0], [-.32, 0]), L([.32, 0], [.44, 0]), L([.53, 0], [.68, 0]), L([.8, 0], [.95, 0]),
    L([0, .32], [0, .72]), ...X(0, .72, .22)]),
  sym('Caja de conexión / derivación', [C(0, 0, .5), C(0, 0, .1, true)]),
  sym('Centro de distribución', [rect(-.55, -.18, 1.1, .36), ...[-.33, -.11, .11, .33].map(x => L([x, -.18], [x, -.45])), L([0, .18], [0, .65])]),
  sym('Tomacorriente (potencia)', [L([0, -.7], [0, 0]), arco(0, .4, .4)]),
  sym('Tomacorriente monofásico', [C(0, 0, .38), ...tomaRayas(-.9, 1, 0, 0, .38, .1)]),
  sym('Tomacorriente monofásico en el piso', [rect(-.6, -.48, 1.2, .96), C(0, 0, .34), ...[-.09, .09].map(y => L([-Math.sqrt(.34 ** 2 - y * y), y], [Math.sqrt(.34 ** 2 - y * y), y]))]),
  sym('Tomacorriente monofásico puesta a tierra', [C(.1, 0, .42), ...tomaRayas(-.95, 1, .1, 0, .42, .11), T(.5, .3, 'T', .32)]),
  sym('Tres tomas', [L([-1, -.62], [.15, -.62], [.15, .45]), ...[-.32, .02, .36].map(y => arco(.15, y + .28, .3))]),
  sym('Tomacorriente múltiple (potencia)', [L([-1, -.4], [.15, -.4], [.15, .02]), arco(.15, .32, .3), L([-.05, .45], [.45, -.12]), T(.5, .15, '3', .42)]),
  sym('Tomacorriente (potencia) con interruptor unipolar', [L([-1, -.4], [.1, -.4], [.1, .12]), arco(.1, .42, .3), L([.1, .12], [.42, -.42], [.72, -.3])]),
  (() => { const b = brazo(-.3, .3, .22, -55, 1.15); return sym('Interruptor', [C(-.3, .3, .22), L(b.p0, b.p1)]); })(),
  (() => { const b = brazo(-.3, .3, .22, -55, 1.15); return sym('Interruptor con luz piloto', [C(-.3, .3, .22), ...X(-.3, .3, .13), L(b.p0, b.p1)]); })(),
  (() => { const b = brazo(-.3, .3, .22, -45, 1.15); return sym('Interruptor bipolar', [C(-.3, .3, .22), L(b.p0, b.p1), remate(b, 1, .25), remate(b, .8, .25)]); })(),
  sym('Interruptor de tres vías (S3)', [C(-.55, .12, .06, true), T(-.45, .3, 'S', .7), T(.03, .42, '3', .4)]),
  (() => { const l = brazo(0, .3, .22, -135, .95), r = brazo(0, .3, .22, -45, .95);
    return sym('Conmutador unipolar', [C(0, .3, .22), L(l.p0, l.p1), L(r.p0, r.p1), remate(l, 1, .25, 'out'), remate(r, 1, .25, 'out')]); })(),
  sym('Botón de presión', [C(0, 0, .45), C(0, 0, .3)]),
  sym('Botón de presión con lámpara indicadora', [C(0, 0, .45), C(0, 0, .3), ...X(0, 0, .19)]),
  sym('Botón de presión con cubierta protectora de vidrio', [C(-.05, 0, .26), C(-.05, 0, .13), L([.05, -.8], [.05, -.42], [.42, -.42], [.42, .42], [.05, .42], [.05, .8])]),
  sym('Salida para lámpara incandescente (empotrado en pared)', [L([-.65, -.4], [-.65, .4]), L([-.65, 0], [.65, 0]), C(0, 0, .3, true)]),
  sym('Salida para artefacto fluorescente en el techo', [rect(-.95, -.3, 1.9, .6), C(0, 0, .22)]),
];

// ── Pack 2: interruptores y pulsadores (unifilares) ────────────────────
const S0 = { cx: -.3, cy: .3, r: .22 };
const base = (ang = -50, len = 1.15) => { const b = brazo(S0.cx, S0.cy, S0.r, ang, len); return { b, piezas: [C(S0.cx, S0.cy, S0.r), L(b.p0, b.p1)] }; };
const pack2 = [
  (() => { const { piezas } = base(-55); return sym('Interruptor (símbolo genérico)', piezas); })(),
  (() => { const { b, piezas } = base(); return sym('Interruptor unipolar', [...piezas, remate(b)]); })(),
  (() => { const bs = [-135, -45, 45, 135].map(a => brazo(0, 0, .2, a, .9));
    return sym('Conmutador de cruce', [C(0, 0, .2), ...bs.map(b => L(b.p0, b.p1)), ...bs.map(b => remate(b, 1, .28, 'out'))]); })(),
  (() => { const { b, piezas } = base(-55); return sym('Interruptor con luz piloto', [...piezas, ...X(S0.cx, S0.cy, .13)]); })(),
  (() => { const { b, piezas } = base(); const a = at(b, .45), z = at(b, .95);
    return sym('Interruptor regulador', [...piezas, Lc(a, z, [z[0], a[1]])]); })(),
  (() => { const { b, piezas } = base(); return sym('Interruptor bipolar', [...piezas, remate(b), remate(b, .78)]); })(),
  (() => { const l = brazo(0, .3, .2, -135, .9), r = brazo(0, .3, .2, -45, .9);
    return sym('Conmutador unipolar', [C(0, .3, .2), L(l.p0, l.p1), L(r.p0, r.p1), remate(l, 1, .28, 'out'), remate(r, 1, .28, 'out')]); })(),
  (() => { const l = brazo(0, .3, .2, -135, .9), r = brazo(0, .3, .2, -45, .9);
    return sym('Interruptor doble', [C(0, .3, .2), L(l.p0, l.p1), L(r.p0, r.p1), remate(l), remate(r)]); })(),
  (() => { const l = brazo(0, .3, .2, -135, .9), r = brazo(0, .3, .2, -45, .9), s = .11;
    return sym('Interruptor de persianas', [C(0, .3, .2), L(l.p0, l.p1), L(r.p0, r.p1), remate(l, 1, .28, 'out'), remate(r, 1, .28, 'out'),
      Lc([-.3, -.32], [-.3 - s, -.32 + s * 1.6], [-.3 + s, -.32 + s * 1.6]), Lc([.3, -.14], [.3 - s, -.14 - s * 1.6], [.3 + s, -.14 - s * 1.6])]); })(),
  (() => { const u = brazo(0, 0, .2, -45, .85), d = brazo(0, 0, .2, 135, .85);
    return sym('Interruptor unipolar de dos posiciones', [C(0, 0, .2), L(u.p0, u.p1), L(d.p0, d.p1), remate(u), remate(d)]); })(),
  (() => { const { b, piezas } = base(-45); const c = at(b, .72), p = [-b.d[1], b.d[0]], w = .09, h = .2;
    const q = (s, t) => [c[0] + b.d[0] * s + p[0] * t, c[1] + b.d[1] * s + p[1] * t];
    return sym('Interruptor de control de potencia', [...piezas, F(q(-w, -h), q(w, -h), q(w, h), q(-w, h))]); })(),
  (() => { const { b, piezas } = base(); const e = b.p1;
    return sym('Interruptor con jalador', [...piezas, remate(b), L([e[0] + .02, e[1] + .04], [e[0] + .02, e[1] + .34]), flecha(e[0] + .02, e[1] + .44, 0, 1, .12)]); })(),
  (() => { const { b, piezas } = base(); return sym('Interruptor temporizador', [...piezas, remate(b), T(b.p1[0] + .1, b.p1[1] + .62, 't', .34)]); })(),
  (() => { const { b, piezas } = base(); return sym('Interruptor de tirador', [...piezas, L(b.p1, [b.p1[0], b.p1[1] + .3])]); })(),
  sym('Botón pulsador', [C(0, 0, .45), C(0, 0, .22)]),
  sym('Botón pulsador (con punto)', [C(0, 0, .45), C(0, 0, .2, true)]),
  sym('Botón pulsador protegido contra uso involuntario', [C(-.05, 0, .26), C(-.05, 0, .1), L([.08, -.8], [.08, -.42], [.42, -.42], [.42, .42], [.08, .42], [.08, .8])]),
  sym('Botón pulsador con indicador luminoso', [C(0, 0, .45), ...X(0, 0, .2)]),
];

// ── Pack 3: instalación eléctrica (México) ─────────────────────────────
const patitas = (cx, cy, r) => [45, 135, 225, 315].map(a => { const t = a * Math.PI / 180; return L([cx + Math.cos(t) * r, cy + Math.sin(t) * r], [cx + Math.cos(t) * (r + .24), cy + Math.sin(t) * (r + .24)]); });
const pack3 = [
  sym('Salida de centro', [C(0, 0, .4), ...patitas(0, 0, .4)]),
  sym('Arbotante', [C(-.3, 0, .4), ...patitas(-.3, 0, .4), L([.1, 0], [.75, 0]), L([.75, -.32], [.75, .32])]),
  sym('Apagador sencillo', [C(0, 0, .45), L([0, -.45], [0, .45]), C(-.22, 0, .06, true), C(.22, 0, .06, true)]),
  sym('Apagador de escalera', [C(0, 0, .45), L([0, 0], [0, .45]), L([0, 0], [-.32, -.32]), L([0, 0], [.32, -.32]),
    C(0, -.26, .06, true), C(-.24, .12, .06, true), C(.24, .12, .06, true)]),
  sym('Contacto dúplex', [C(0, 0, .45), L([-.37, -.25], [.25, .37]), L([-.25, -.37], [.37, .25])]),
  sym('Acometida eléctrica', [L([-1, 0], [-.3, 0], [-.05, -.32], [.05, .25], [.3, 0], [.95, 0]), L([.72, -.2], [.95, 0], [.72, .2])]),
  sym('Medidor', [rect(-.6, -.32, 1.2, .64), F([-.6, -.32], [.6, -.32], [.6, -.18], ...arcPts(0, -1.08, 1.06, 56.4, 123.6).map(([x, y]) => [x, y]), [-.6, -.18])]),
  sym('Centro de carga', [rect(-.6, -.35, 1.2, .7), F([-.6, .35], [.6, -.35], [.6, .35])]),
  sym('Sube instalación eléctrica (S.I.E.)', [T(-.36, -.18, 'S.I.E.', .26), C(0, .2, .2)]),
];

// ── Ayudas para rayados ────────────────────────────────────────────────
// Rayado paralelo recortado a un polígono CONVEXO (ang en grados de pantalla, gap en U).
const rayado = (poly, ang, gap = .15) => {
  const a = ang * Math.PI / 180, d = [Math.cos(a), Math.sin(a)], n = [-Math.sin(a), Math.cos(a)];
  const pr = poly.map(p => p[0] * n[0] + p[1] * n[1]);
  const lo = Math.min(...pr), hi = Math.max(...pr), out = [];
  for (let k = lo + gap / 2; k < hi; k += gap) {
    const pts = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const s = p[0] * n[0] + p[1] * n[1] - k, t = q[0] * n[0] + q[1] * n[1] - k;
      if (s * t <= 0 && s !== t) { const u = s / (s - t); pts.push([p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])]); }
    }
    if (pts.length >= 2) { pts.sort((A, B) => (A[0] * d[0] + A[1] * d[1]) - (B[0] * d[0] + B[1] * d[1])); out.push(L(pts[0], pts[pts.length - 1])); }
  }
  return out;
};
const cuad = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const tierraLineas = (y, w = .55) => [L([-w, y], [w, y]), L([-w * .62, y + .14], [w * .62, y + .14]), L([-w * .25, y + .28], [w * .25, y + .28])];
const exclam = (x, y, h = .5) => [L([x, y - h / 2], [x, y + h * .22]), C(x, y + h * .45, .04, true)];
// contacto vertical (IEC): borne arriba hasta -.3, cuchilla desde abajo hacia arriba a la izquierda
const contacto = () => [L([0, -.85], [0, -.3]), L([0, .3], [-.24, -.32]), L([0, .3], [0, .85])];

// ── Etapa 1, pack A: simbología eléctrica normalizada (IEC, en castellano) ─
const pack4 = [
  sym('Caja de empalme', [C(0, 0, .5), C(0, 0, .14, true)]),
  sym('Corriente continua', [L([-.6, -.12], [.6, -.12]), L([-.6, .12], [-.25, .12]), L([-.15, .12], [.15, .12]), L([.25, .12], [.6, .12])]),
  sym('Central hidráulica en servicio', [rect(-.75, -.75, 1.5, 1.5), L([-.75, .75], [.75, -.75]), ...rayado([[-.75, -.75], [.75, -.75], [-.75, .75]], 0, .14)]),
  sym('Central térmica en servicio', [rect(-.75, -.75, 1.5, 1.5), L([-.75, 0], [.75, 0]), ...rayado(cuad(-.75, 0, 1.5, .75), -45, .16)]),
  (() => { const l = brazo(0, .35, .3, -135, 1.05), r = brazo(0, .35, .3, -45, 1.05);
    return sym('Conmutador unipolar', [C(0, .35, .3), L(l.p0, l.p1), L(r.p0, r.p1), remate(l, 1, .3, 'out'), remate(r, 1, .3, 'out')]); })(),
  sym('Contacto de corte (normal cerrado)', [L([0, -.85], [0, -.3], [.2, -.3]), L([0, .3], [.3, -.42]), L([0, .3], [0, .85])]),
  sym('Contacto con disparo automático', [...contacto(), F([0, -.3], [.14, -.38], [0, -.46])]),
  sym('Contacto sin disparo automático', [...contacto(), C(0, -.38, .07)]),
  sym('Contacto operado manualmente', [...contacto(), L([-.8, 0], [-.68, 0]), L([-.58, 0], [-.46, 0]), L([-.36, 0], [-.14, 0]), L([-.8, -.1], [-.8, .1])]),
  sym('Descargador de sobretensiones', [rect(-.25, -.45, .5, .9), L([0, -.85], [0, .02]), flecha(0, .12, 0, 1, .14), L([0, .45], [0, .85])]),
  sym('Detector automático de incendio', [rect(-.6, -.6, 1.2, 1.2), ...exclam(0, -.02, .7)]),
  sym('Dispositivo de protección contra sobretensiones (DPS)', [rect(-.35, -.6, .7, 1.2), L([0, -.85], [0, -.1]), flecha(0, 0, 0, 1, .14), L([0, .85], [0, .1]), flecha(0, 0, 0, -1, .14)]),
  sym('DPS tipo varistor', [rect(-.16, -.42, .32, .84), L([0, -.85], [0, -.42]), L([0, .42], [0, .85]), L([-.32, -.32], [.32, .32], [.32, .55])]),
  sym('Doble aislamiento', [rect(-.6, -.6, 1.2, 1.2), rect(-.32, -.32, .64, .64)]),
  sym('Empalme', [L([-.8, 0], [.8, 0]), C(0, 0, .14, true)]),
  sym('Equipotencialidad', [Lc([-.6, -.3], [.6, -.3], [0, .7]), C(0, .05, .26), L([0, -.75], [0, -.3])]),
  sym('Extintor para equipo eléctrico', [Lc([0, -.75], [.75, .6], [-.75, .6]), rect(-.25, .1, .5, .5)]),
  sym('Fusible', [rect(-.45, -.18, .9, .36), L([-.85, 0], [.85, 0])]),
  sym('Generador', [C(0, 0, .5), T(-.19, .2, 'G', .45)]),
  (() => { const b = brazo(-.25, .3, .3, -55, 1.2); return sym('Interruptor, símbolo general', [C(-.25, .3, .3), L(b.p0, b.p1)]); })(),
  sym('Interruptor automático en aire', [L([0, -.85], [0, -.3]), arc(0, 0, .2, -90, 90), L([0, .3], [0, .85])]),
  (() => { const b = brazo(-.25, .3, .3, -45, 1.2); return sym('Interruptor bipolar', [C(-.25, .3, .3), L(b.p0, b.p1), remate(b, 1, .28), remate(b, .8, .28)]); })(),
  (() => { const b = brazo(-.25, .3, .3, -60, 1.2); return sym('Interruptor con luz piloto', [C(-.25, .3, .3), ...X(-.25, .3, .18), L(b.p0, b.p1)]); })(),
  (() => { const b = brazo(-.25, .3, .3, -50, 1.2); return sym('Interruptor unipolar con tiempo de cierre', [C(-.25, .3, .3), L(b.p0, b.p1), remate(b, 1, .28)]); })(),
  sym('Interruptor diferencial', [L([-.2, -.62], [.2, -.62]), L([0, -.9], [0, -.72]), flecha(0, -.62, 0, 1, .12), L([0, -.62], [0, -.3]), L([0, .3], [-.24, -.32]), L([0, .3], [0, .85]),
    rect(-.62, -.22, .24, .22), L([-.5, 0], [-.5, .45], [-.08, .45]), C(.02, .45, .08), L([-.38, -.11], [-.12, -.11])]),
  (() => { const u = brazo(0, 0, .3, -45, 1.05), d = brazo(0, 0, .3, 135, 1.05);
    return sym('Interruptor unipolar de dos vías', [C(0, 0, .3), L(u.p0, u.p1), L(d.p0, d.p1), remate(u, 1, .28), remate(d, 1, .28)]); })(),
  sym('Interruptor seccionador para AT', [L([-.9, .1], [-.3, .1]), L([-.3, .1], [.18, -.25]), L([.3, .1], [.9, .1]), F([.22, .1], [.36, .02], [.36, .18])]),
  sym('Interruptor termomagnético', [L([0, -.85], [0, -.3]), ...X(0, -.6, .1), L([0, .3], [-.24, -.32]), L([0, .3], [0, .85])]),
  sym('Lámpara', [C(0, 0, .5), ...X(0, 0, .35)]),
  sym('Masa', [L([0, -.75], [0, .15]), L([-.6, .15], [.6, .15]), L([-.48, .15], [-.62, .42]), L([0, .15], [-.14, .42]), L([.48, .15], [.34, .42])]),
  sym('Parada de emergencia', [C(0, 0, .55), Lc([-.42, -.25], [.42, -.25], [0, .45]), ...exclam(0, -.02, .38)]),
  sym('Seccionador', [L([-.9, .1], [-.3, .1]), L([-.3, .1], [.22, -.25]), L([.36, -.06], [.36, .26]), L([.36, .1], [.9, .1])]),
  sym('Subestación', [C(0, 0, .5), ...rayado(arcPts(0, 0, .44, 0, 360, 40), -45, .13)]),
  sym('Tablero general', [rect(-.9, -.4, 1.8, .8), ...rayado(cuad(-.9, -.4, 1.8, .8), -45, .12)]),
  sym('Tablero de distribución', [rect(-.9, -.4, 1.8, .8), F([-.9, .4], [.9, -.4], [.9, .4])]),
  sym('Tierra', [L([0, -.7], [0, .1]), ...tierraLineas(.1)]),
  sym('Tierra de protección', [C(0, .1, .5), L([0, -.8], [0, .05]), ...tierraLineas(.05, .36)]),
  sym('Tierra aislada', [arc(0, .4, .62, 180, 360), L([0, -.8], [0, .12]), ...tierraLineas(.12, .4)]),
  sym('Tomacorriente, símbolo general', [L([0, -.75], [0, 0]), arco(0, .45, .45)]),
  sym('Tomacorriente en el piso', [rect(-.6, -.55, 1.2, 1.1), C(0, 0, .42), ...[-.07, .07].map(y => L([-Math.sqrt(.42 ** 2 - y * y), y], [Math.sqrt(.42 ** 2 - y * y), y]))]),
  sym('Tomacorriente monofásico', [C(.05, 0, .42), ...tomaRayas(-.95, 1, .05, 0, .42, .09), L([.4, .32], [.66, .32]), L([.53, .32], [.53, .6])]),
  sym('Tomacorriente trifásico', [C(.1, 0, .42), ...[-.16, 0, .16].map(y => L([-.95, y], [.1 + Math.sqrt(.42 ** 2 - y * y), y]))]),
  sym('Transformador, símbolo general', [C(0, -.2, .3), C(0, .2, .3), L([0, -.85], [0, -.5]), L([0, .5], [0, .85])]),
  sym('Transformador de aislamiento', [C(0, -.18, .42), C(0, .18, .42), L([-.75, 0], [.75, 0])]),
  sym('Transformador de seguridad', [L([-.6, -.6], [.6, -.6], [.6, .25], [0, .7], [-.6, .25], [-.6, -.6]), C(0, -.15, .26), C(0, .15, .26), L([-.48, 0], [.48, 0])]),
];

// ── Etapa 1, pack B: instalación eléctrica España (unifilar y multifilar) ─
const S1 = { cx: -.25, cy: .3, r: .2 };
const intE = (ang = -50) => { const b = brazo(S1.cx, S1.cy, S1.r, ang, 1.05); return { b, piezas: [C(S1.cx, S1.cy, S1.r), L(b.p0, b.p1)] }; };
const copa = (extra = []) => [arc(0, -.25, .45, 0, 180), ...extra]; // copa (∪) de las tomas españolas
const pack5 = [
  (() => { const { b, piezas } = intE(); return sym('Interruptor', [...piezas, remate(b, 1, .26)]); })(),
  (() => { const { b, piezas } = intE(-45); return sym('Interruptor bipolar', [...piezas, remate(b, 1, .26), remate(b, .8, .26)]); })(),
  (() => { const { b, piezas } = intE(-40); return sym('Interruptor tripolar', [...piezas, remate(b, 1, .26), remate(b, .82, .26), remate(b, .64, .26)]); })(),
  (() => { const { b, piezas } = intE(); return sym('Interruptor de tirador', [...piezas, L(b.p1, [b.p1[0], b.p1[1] + .28])]); })(),
  (() => { const l = brazo(0, .3, .2, -130, .9), r = brazo(0, .3, .2, -40, .9);
    return sym('Interruptor doble', [C(0, .3, .2), L(l.p0, l.p1), L(r.p0, r.p1), remate(l, 1, .26), remate(r, 1, .26)]); })(),
  (() => { const u = brazo(0, 0, .2, -40, .85), d = brazo(0, 0, .2, 140, .85);
    return sym('Conmutador', [C(0, 0, .2), L(u.p0, u.p1), L(d.p0, d.p1), remate(u, 1, .26), remate(d, 1, .26)]); })(),
  (() => { const bs = [-135, -45, 45, 135].map(a => brazo(0, 0, .2, a, .9));
    return sym('Conmutador de cruce', [C(0, 0, .2), ...bs.map(b => L(b.p0, b.p1)), ...bs.map(b => remate(b, 1, .28, 'out'))]); })(),
  sym('Pulsador', [C(0, 0, .35, true)]),
  sym('Toma de corriente bipolar (sin tierra)', [...copa(), L([0, .2], [0, .8])]),
  sym('Toma de corriente bipolar 16 A con toma de tierra', [...copa(), L([-.55, .2], [.55, .2]), L([0, .2], [0, .8])]),
  sym('Toma de corriente bipolar 25 A con toma de tierra', [...copa(), L([-.55, .2], [.55, .2]), L([-.35, .4], [.35, .4]), L([0, .2], [0, .8])]),
  sym('Toma de corriente trifásica con toma de tierra', [...copa(), L([-.55, .2], [.55, .2]), L([0, -.45], [0, .8])]),
  sym('Clavija', [L([0, -.8], [0, .1]), F([-.13, .1], [.13, .1], [.13, .7], [-.13, .7])]),
  sym('Punto de luz', [...X(0, 0, .5)]),
  sym('Lámpara fluorescente', [L([-.8, 0], [.8, 0]), L([-.8, -.14], [-.8, .14]), L([.8, -.14], [.8, .14])]),
  sym('Lámpara fluorescente (variante)', [L(...arcPts(-.62, 0, .16, 90, 270, 10), ...arcPts(.62, 0, .16, -90, 90, 10), [-.62, .16]), ...X(0, 0, .14)]),
  sym('Fusible unipolar', [L([0, -.8], [0, .8]), rect(-.14, -.32, .28, .64)]),
  sym('Seccionador de neutro', [L([0, -.7], [0, .7]), flecha(0, -.78, 0, -1, .14), flecha(0, .78, 0, 1, .14)]),
  (() => { const b = brazo(-.25, .3, .2, -30, 1); const e = at(b, .82); return sym('Interruptor de control de potencia (ICP)', [C(-.25, .3, .2), L(b.p0, b.p1), ...X(e[0], e[1], .1)]); })(),
  sym('Interruptor diferencial', [L([-.2, -.62], [.2, -.62]), L([0, -.9], [0, -.72]), flecha(0, -.62, 0, 1, .12), L([0, -.62], [0, -.3]), L([0, .3], [-.24, -.32]), L([0, .3], [0, .85]),
    rect(-.62, -.22, .24, .22), L([-.5, 0], [-.5, .45], [-.08, .45]), C(.02, .45, .08), L([-.38, -.11], [-.12, -.11])]),
  sym('Interruptor magnetotérmico (PIA)', [L([0, -.85], [0, -.3]), ...X(0, -.6, .1), L([0, .3], [-.24, -.32]), L([0, .3], [0, .85])]),
  sym('Telerruptor', [L([-.8, 0], [-.1, 0]), F([-.1, -.3], [.5, -.3], [.5, .3], [-.1, .3])]),
  sym('Automático de escalera', [L([-.8, 0], [-.1, 0]), F([-.1, -.3], [.5, -.3], [.5, .3], [-.1, .3])]),
  sym('Timbre', [F(...arcPts(0, 0, .45, 180, 360)), L([0, 0], [0, .6])]),
  sym('Zumbador', [F(...arcPts(0, -.35, .45, 0, 180)), L([0, .1], [0, .6])]),
  sym('Sirena', [F([0, -.45], [.45, .15], [-.45, .15]), L([0, .15], [0, .6])]),
  sym('Caja de registro', [C(0, 0, .25), L([-.6, 0], [-.25, 0]), L([.25, 0], [.6, 0]), L([0, -.6], [0, -.25]), L([0, .25], [0, .6])]),
  sym('Caja de paso', [C(0, 0, .25), L([-.65, 0], [-.25, 0]), L([.25, 0], [.65, 0])]),
  sym('Equipo de alumbrado de emergencia', [F([-.4, -.3], [0, 0], [-.4, .3]), F([.4, -.3], [0, 0], [.4, .3])]),
  sym('Reactancia (multifilar)', [L([-.85, 0], [.85, 0]), F([-.45, -.12], [.45, -.12], [.45, .12], [-.45, .12])]),
  sym('Cebador (multifilar)', [L([-.75, 0], [.75, 0]), C(0, 0, .3, true)]),
  sym('Toma de corriente bipolar (multifilar)', [C(0, 0, .45), C(-.2, 0, .09, true), C(.2, 0, .09, true), L([-.8, 0], [-.45, 0]), L([.45, 0], [.8, 0])]),
  sym('Toma de corriente bipolar con tierra (multifilar)', [C(0, 0, .45), C(0, -.2, .11), C(-.18, .12, .11), C(.18, .12, .11), L([-.8, 0], [-.45, 0]), L([.45, 0], [.8, 0]), L([0, -.75], [0, -.45])]),
  sym('Lámpara (multifilar)', [C(0, 0, .4), ...X(0, 0, .28), L([-.8, 0], [-.4, 0]), L([.4, 0], [.8, 0])]),
  sym('Lámpara fluorescente (multifilar)', [rect(-.7, -.1, 1.4, .2), L([-.95, 0], [-.7, 0]), L([.7, 0], [.95, 0])]),
  sym('Clavija macho (multifilar)', [L([-.8, 0], [.7, 0]), L([.45, -.22], [.7, 0], [.45, .22])]),
  sym('Clavija hembra (multifilar)', [L([-.15, 0], [.8, 0]), L([-.55, -.3], [-.15, 0], [-.55, .3])]),
  sym('Timbre (multifilar)', [F(...arcPts(0, 0, .45, 180, 360)), L([-.2, 0], [-.2, .35], [-.5, .35]), L([.2, 0], [.2, .35], [.5, .35])]),
  sym('Zumbador (multifilar)', [F(...arcPts(0, -.35, .45, 0, 180)), L([-.2, .08], [-.2, .4], [-.5, .4]), L([.2, .08], [.2, .4], [.5, .4])]),
  sym('Sirena (multifilar)', [F([0, -.45], [.45, .15], [-.45, .15]), L([-.2, .15], [-.2, .4], [-.5, .4]), L([.2, .15], [.2, .4], [.5, .4])]),
];

const PACKS = [
  { file: 'eclib-planos-electricos-tabla-general', library: 'Planos eléctricos — tabla general', symbols: pack1 },
  { file: 'eclib-interruptores-y-pulsadores-unifilares', library: 'Interruptores y pulsadores (unifilares)', symbols: pack2 },
  { file: 'eclib-instalacion-electrica-mexico', library: 'Instalación eléctrica — México', symbols: pack3 },
  { file: 'eclib-simbologia-electrica-normalizada-iec', library: 'Simbología eléctrica normalizada (IEC)', symbols: pack4 },
  { file: 'eclib-instalacion-electrica-espana', library: 'Instalación eléctrica — España (unifilar y multifilar)', symbols: pack5 },
];
const out = process.argv[2] || '.';
const solo = process.argv[3] ? process.argv[3].split(',') : null; // nombres de archivo a escribir (opcional)
for (const p of PACKS) {
  if (solo && !solo.includes(p.file)) continue;
  const lib = { ecFormat: 'ec-library', version: 1, app: 'ElectroCAD', library: { name: p.library }, symbols: p.symbols };
  fs.writeFileSync(path.join(out, p.file + '.json'), JSON.stringify(lib));
  console.log(p.file, p.symbols.length);
}
