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

// ── Etapa 2: iluminación, EE.UU. y Francia ─────────────────────────────
const ticksDiag = (cx, cy, r, len = .25) => [45, 135, 225, 315].map(a => { const t = a * Math.PI / 180; return L([cx + Math.cos(t) * r, cy + Math.sin(t) * r], [cx + Math.cos(t) * (r + len), cy + Math.sin(t) * (r + len)]); });
const ticksOrto = (cx, cy, r, len = .25) => [0, 90, 180, 270].map(a => { const t = a * Math.PI / 180; return L([cx + Math.cos(t) * r, cy + Math.sin(t) * r], [cx + Math.cos(t) * (r + len), cy + Math.sin(t) * (r + len)]); });
const txt = (s, x, y, size = .34) => T(x - s.length * size * .3, y + size * .5, s, size); // texto centrado en (x,y), aprox.
const brazoPared = (x0, x1, y = 0, h = .2) => [L([x0, y], [x1, y]), L([x0, y - h], [x0, y + h])]; // ⊢— (fijación a pared)
const hoja = (cx, cy, ang, len = .45, w = .2) => { // lámpara en forma de hoja (emergencia)
  const a = ang * Math.PI / 180, d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]], pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; const s = Math.sin(t * Math.PI) * w; pts.push([cx + d[0] * len * t + n[0] * s, cy + d[1] * len * t + n[1] * s]); }
  for (let i = 16; i >= 0; i--) { const t = i / 16; const s = -Math.sin(t * Math.PI) * w * .35; pts.push([cx + d[0] * len * t + n[0] * s, cy + d[1] * len * t + n[1] * s]); }
  return Lc(...pts);
};
const cono = (cx, cy, ang, len = .4, w = .22) => { // proyector (cono) que sale de (cx,cy)
  const a = ang * Math.PI / 180, d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
  const p = (s, t) => [cx + d[0] * s + n[0] * t, cy + d[1] * s + n[1] * t];
  return [L(p(0, -w * .35), p(len, -w), p(len, w), p(0, w * .35), p(0, -w * .35)), arc(...p(len, 0), w, ang - 90, ang + 90, 10)];
};
const barraLuces = n => { const w = .2 * n + .3, out = [L([-w / 2, -.12], [w / 2, -.12])];
  for (let i = 0; i < n; i++) { const x = -w / 2 + .25 + i * .2; out.push(L([x, -.12], [x, -.04]), C(x, .04, .07)); } return out; };
const batten = n => { const out = [], w = 1.6; for (let i = 0; i < n; i++) { const y = (i - (n - 1) / 2) * .1; out.push(L([-w / 2, y], [w / 2, y])); }
  const h = Math.max(.12, (n - 1) * .05 + .1); out.push(L([-w / 2, -h], [-w / 2, h]), L([w / 2, -h], [w / 2, h])); return out; };
const reloj = (cx, cy, r) => C(cx, cy, r);
const D = (cx, cy, r, lleno) => { // media luna «D» que mira a la derecha (aplique)
  const pts = arcPts(cx, cy, r, -90, 90, 16);
  return [Lc(...pts), ...(lleno ? [F(...arcPts(cx + .02, cy, r * .62, -90, 90, 12))] : [])];
};

const pack6 = [
  ...[1, 2, 4, 6, 8].map(n => sym(`Barra de ${n} luz${n > 1 ? 'es' : ''}`, barraLuces(n), `${n}-light bar`)),
  ...[1, 2, 3, 4].map(n => sym(`Listón fluorescente, ${n} tubo${n > 1 ? 's' : ''}`, batten(n), `Batten fluorescent, ${n} lamp${n > 1 ? 's' : ''}`)),
  sym('Ventilador de techo', [C(0, 0, .35), ...ticksDiag(0, 0, .35), txt('F', 0, 0)], 'Ceiling fan'),
  sym('Luz de techo', [C(0, 0, .35), L([-.65, -.65], [-.25, -.25]), L([.65, -.65], [.25, -.25]), L([-.65, .65], [-.25, .25]), L([.65, .65], [.25, .25]), txt('L', 0, 0)], 'Ceiling light'),
  sym('Boca de luz de techo', [C(0, 0, .38), ...ticksDiag(0, 0, .38)], 'Ceiling light outlet'),
  sym('Luz de techo con cadena', [C(-.15, 0, .38), ...ticksDiag(-.15, 0, .38), txt('PC', .62, -.05, .28)], 'Ceiling light with pull cord'),
  sym('Teclado de control', [rect(-.22, -.35, .44, .7), L([0, -.35], [0, .35]), L([-.22, -.12], [.22, -.12]), L([-.22, .12], [.22, .12])], 'Control keypad'),
  sym('Luz descendente (downlight)', [C(-.15, 0, .26), ...X(-.15, 0, .17), arc(-.15, 0, .42, 110, 250, 12), L([.2, -.1], [.62, -.1]), flecha(.72, -.1, 1, 0, .12), L([.2, .1], [.62, .1]), flecha(.72, .1, 1, 0, .12)], 'Down lighter'),
  sym('Equipo autónomo de emergencia', [rect(-.55, -.3, 1.1, .6)], 'Emergency battery unit'),
  sym('Equipo autónomo de emergencia (con faros)', [rect(-.75, -.1, 1.5, .7), C(-.45, -.42, .2), C(.45, -.42, .2), C(-.45, -.42, .07), C(.45, -.42, .07), L([-.45, -.22], [-.45, -.1]), L([.45, -.22], [.45, -.1]),
    rect(-.6, .12, .55, .2), rect(.3, .05, .28, .45)], 'Emergency battery unit'),
  sym('Equipo de emergencia con dos luces', [L([-.45, .1], [-.45, -.45], [.45, -.45], [.45, .1]), L([-.75, .1], [.75, .1]), hoja(-.55, .1, 150, .55, .26), hoja(.55, .1, 30, .55, .26)], 'Emergency battery unit with two lights'),
  sym('Luz de emergencia de pared (tortuga)', [C(.15, 0, .32), txt('E', .15, 0, .32), ...brazoPared(-.5, -.17)], 'Emergency bulkhead light'),
  sym('Cartel de salida de emergencia (leyenda europea)', [rect(-.8, -.3, 1.6, .6), F([-.65, -.18], [-.42, -.18], [-.42, .18], [-.65, .18]), L([-.15, -.2], [-.15, .1]), flecha(-.15, .2, 0, 1, .12),
    C(.32, -.16, .06, true), L([.3, -.08], [.24, .08], [.1, .2]), L([.24, .08], [.36, .2]), L([.29, -.04], [.45, .02])], 'Emergency bulkhead light, euro legend'),
  sym('Luz de emergencia doble, remota', [L([-.15, -.75], [.15, -.75]), L([0, -.75], [0, -.15]), hoja(0, -.1, 135, .55, .18), hoja(0, -.1, 45, .55, .18)], 'Emergency duplex light, remote mounted'),
  sym('Luces de emergencia', [F([-.55, -.25], [-.15, -.25], [-.35, 0]), F([-.55, .25], [-.15, .25], [-.35, 0]), C(.35, 0, .2, true)], 'Emergency lights'),
  sym('Luz de emergencia embutida', [rect(-.6, -.35, 1.2, .7), F([-.6, .35], [.6, -.35], [.6, .35])], 'Emergency light, recessed'),
  sym('Señalización de emergencia', [rect(-.35, -.2, .9, .4), F([-.25, -.2], [.25, -.2], [0, 0]), F([-.25, .2], [.25, .2], [0, 0]), L([-.7, 0], [-.35, 0])], 'Emergency sign'),
  sym('Luz de emergencia simple, remota', [L([-.15, -.75], [.15, -.75]), L([0, -.75], [0, -.05]), arc(0, .15, .4, 180, 360, 16), L([-.4, .15], [.4, .15])], 'Emergency single light, remote mounted'),
  sym('Luminaria de techo cerrada', [rect(-.3, -.3, .6, .6), ...X(0, 0, .3)], 'Enclosed ceiling luminaire'),
  sym('Cartel de salida, colgante', [C(0, 0, .45), ...X(0, 0, .32)], 'Exit sign, pendant mounted'),
  sym('Cartel de salida, de pared', [C(.2, 0, .4), ...X(.2, 0, .28), ...brazoPared(-.7, -.2)], 'Exit sign, wall mounted'),
  sym('Luz de piso hacia arriba (uplight)', [C(0, 0, .4), L([-.6, 0], [.6, 0]), L([0, -.6], [0, .6]), F([0, 0], ...arcPts(0, 0, .4, 180, 270, 8)), F([0, 0], ...arcPts(0, 0, .4, 0, 90, 8))], 'Floor uplight'),
  sym('Bañador de piso', [rect(-.4, -.4, .8, .45), L([-.12, .05], [-.35, .45]), L([.12, .05], [.35, .45])], 'Floor washer light'),
  sym('Luz empotrada en el piso', [rect(-.42, -.42, .84, .84), C(0, 0, .4)], 'Inground light, floor mounted'),
  sym('Luz integrada', [C(0, 0, .4), L([-.32, .32], [.52, -.52])], 'Integrated light'),
  sym('Luz direccional de acento', [C(0, -.1, .38), L([-.55, -.25], [0, .4], [.55, -.25])], 'Light, directional accent'),
  sym('Luz direccional con línea de enfoque', [C(-.5, 0, .35), L([-.5, 0], [.85, 0])], 'Light, directional aiming line'),
  sym('Luz direccional con flecha', [C(0, -.3, .38), L([0, -.3], [0, .45]), flecha(0, .6, 0, 1, .16)], 'Light, directional arrow'),
  sym('Proyector en poste', [Lc([0, -.5], [.5, 0], [0, .5], [-.5, 0]), C(0, 0, .3), L([0, -.5], [0, -.62]), C(0, -.7, .08, true)], 'Light flood, pole mounted'),
  sym('Proyector de pared', [Lc([.25, -.45], [.7, 0], [.25, .45], [-.2, 0]), C(.25, 0, .27), ...brazoPared(-.75, -.2)], 'Light flood, wall mounted'),
  sym('Luz en poste', [C(0, 0, .4), C(0, 0, .28)], 'Light, pole mounted'),
  sym('Luz en columna', [C(0, .15, .35), ...ticksDiag(0, .15, .35, .2), L([0, -.2], [0, -.62]), C(0, -.7, .08, true)], 'Light, stanchion mounted'),
  sym('Luz de superficie', [C(0, 0, .4)], 'Light, surface mounted'),
  sym('Riel de luces', [L([-.75, .15], [.75, .15]), ...[-.45, 0, .45].map(x => Lc([x - .16, -.15], [x + .16, -.15], [x, .1]))], 'Light track'),
  sym('Fotocélula de iluminación', [C(.15, 0, .38), txt('PC', .15, 0, .3), ...brazoPared(-.55, -.23)], 'Lighting photocell'),
  sym('Luces montadas en riel', [C(-.45, -.15, .3), C(.35, -.15, .3), L([-.15, -.15], [.05, -.15]), L([.65, -.15], [.95, -.15]), L([.35, -.15], [.35, .45]), flecha(.35, .6, 0, 1, .16)], 'Lights, track mounted'),
  sym('Rejilla difusora (louver)', [rect(-.7, -.3, 1.4, .6), ...[-.5, -.3, -.1, .1, .3, .5].map(x => L([x, -.3], [x, .3])), L([-.7, -.1], [.7, -.1]), L([-.7, .1], [.7, .1])], 'Louvers'),
  sym('Luminaria de techo', [...X(0, 0, .3)], 'Luminaire ceiling mount'),
  sym('Mini spot', [L([.3, -.4], [.3, .4]), L([-.55, 0], [.3, 0]), L([-.1, -.3], [.3, 0], [-.1, .3])], 'Mini spotlight'),
  sym('Luminaria fluorescente modular', [rect(-.6, -.3, 1.2, .6)], 'Modular fluorescent fitting'),
  sym('Luminaria fluorescente modular con inversor', [rect(-.6, -.3, 1.2, .6), F([.25, .3], [.6, -.3], [.6, .3])], 'Modular fluorescent fitting, inverter'),
  sym('Luminaria fluorescente modular (cuadrada)', [rect(-.55, -.32, 1.1, .64), C(0, 0, .45)], 'Modular fluorescent fitting'),
  sym('Luz de noche', [rect(-.35, -.2, .7, .4), txt('NL', 0, 0, .26)], 'Night light'),
  sym('Luz de noche (enchufable)', [C(0, .15, .38), C(0, .15, .24), L([-.25, -.15], [-.25, -.5], [.25, -.5], [.25, -.15]), L([-.1, -.5], [-.1, -.72]), L([.1, -.5], [.1, -.72])], 'Night light'),
  sym('Iluminación exterior', [C(-.15, 0, .25), ...X(-.15, 0, .17), txt('S', .35, 0, .34)], 'Outdoor lighting'),
  sym('Iluminación exterior, baliza', [C(-.15, 0, .25), ...X(-.15, 0, .17), txt('B', .35, 0, .34)], 'Outdoor lighting, bollard'),
  sym('Luz colgante', [C(0, 0, .4), L([-.65, 0], [.65, 0]), L([0, -.65], [0, .65]), F([0, 0], ...arcPts(0, 0, .4, 180, 270, 8))], 'Pendant light'),
  sym('Luz de techo embutida', [C(0, 0, .35), ...ticksDiag(0, 0, .35), txt('R', 0, 0, .3)], 'Recessed ceiling light'),
  sym('Luz de techo embutida (con brazo)', [C(.25, 0, .4), C(.25, 0, .28), ...X(.25, 0, .2), L([-.2, 0], [-.15, 0]), rect(-.65, -.45, .1, .9), L([-.55, 0], [-.15, 0])], 'Recessed ceiling light'),
  sym('Luz embutida', [rect(-.6, -.15, 1.2, .3), L([-.6, .15], [.6, -.15])], 'Recessed light'),
  sym('Luz embutida (R)', [C(0, 0, .35), txt('R', 0, 0, .32)], 'Recessed light'),
  sym('Luz de calle', [Lc(...arcPts(-.7, 0, .12, 0, 360, 16)), L([-.58, 0], [-.3, 0]), L([-.3, -.25], [.35, -.25]), arc(.35, 0, .25, -90, 90, 10), L([.35, .25], [-.3, .25], [-.3, -.25])], 'Roadway light'),
  sym('Luz de calle, cabeza cobra', [C(-.65, 0, .17), L([-.48, 0], [-.3, 0]), L([-.3, -.12], [.55, -.2]), arc(.55, 0, .2, -90, 90, 10), L([.55, .2], [-.3, .12], [-.3, -.12])], 'Roadway light, cobra head'),
  sym('Proyector (spot)', [rect(-.45, -.4, .15, .8), L([-.3, -.25], [-.15, -.25]), L([-.3, .25], [-.15, .25]), L([-.15, -.35], [.2, -.35]), arc(.2, 0, .35, -90, 90, 14), L([.2, .35], [-.15, .35], [-.15, -.35])], 'Spotlight'),
  sym('Spot de dos cabezas', [C(-.25, .05, .3), ...cono(.0, -.15, -35, .45, .2), ...cono(.0, .25, 35, .45, .2)], 'Spotlight, double head'),
  sym('Spot de una cabeza', [C(-.25, 0, .3), ...cono(.05, 0, 0, .45, .22)], 'Spotlight, single head'),
  sym('Luz fluorescente de superficie', [rect(-.55, -.3, 1.1, .6), L([-.55, .3], [.55, -.3])], 'Surface fluorescent light'),
  sym('Luz suspendida', [C(0, 0, .32), C(0, 0, .12, true)], 'Suspended light'),
  sym('Luces suspendidas', [rect(-.6, -.3, 1.2, .6), C(-.25, 0, .1, true), C(.25, 0, .1, true)], 'Suspended lights'),
  sym('Luces dobles colgantes', [C(-.55, 0, .28), ...ticksDiag(-.55, 0, .28, .17), C(.55, 0, .28), ...ticksDiag(.55, 0, .28, .17), L([-.27, 0], [.27, 0]), C(0, 0, .07, true)], 'Twin lights, pendant mounted'),
  sym('Luz bajo mueble', [C(0, 0, .38), F(...arcPts(0, 0, .38, 90, 270, 12)), L([0, -.6], [0, .6])], 'Under cabinet light'),
  sym('Aplique de pared (en columna)', [C(0, -.2, .35), L([0, .15], [0, .5]), L([-.2, .5], [.2, .5])], 'Wall light'),
  sym('Aplique de pared (regleta)', [rect(-.55, -.18, 1.1, .32), L([-.35, .14], [-.35, .28]), L([.35, .14], [.35, .28]), L([-.45, .28], [-.25, .28]), L([.25, .28], [.45, .28])], 'Wall light'),
  sym('Aplique de pared', [C(.2, 0, .35), L([-.6, 0], [-.15, 0])], 'Wall light'),
  sym('Aplique de pared (triangular)', [L([-.3, -.4], [-.3, .4]), Lc([-.3, 0], [.3, -.3], [.3, .3])], 'Wall light'),
  sym('Aplique de pared (cruz)', [...X(-.05, 0, .22), L([.25, -.35], [.25, .35])], 'Wall light'),
  sym('Boca de aplique de pared', [C(.25, 0, .32), ...ticksDiag(.25, 0, .32, .18), ...brazoPared(-.65, -.07)], 'Wall light outlet'),
  sym('Luz de jardín, a prueba de intemperie', [C(0, 0, .35), ...ticksDiag(0, 0, .35, .2), txt('WP', 0, 0, .26)], 'Weatherproof landscape light'),
  sym('Downlight estanco', [C(0, 0, .38), txt('WP', 0, 0, .28)], 'Waterproof downlight'),
  sym('Aplique de pared arriba y abajo', [rect(-.35, -.35, .7, .7), C(0, 0, .07, true)], 'Wall up and down light'),
];

const pack7 = [
  sym('Luminaria colgante', [C(0, 0, .38), ...ticksOrto(0, 0, .38)], 'Pendant fixture light'),
  sym('Plafón de techo', [C(0, 0, .45), ...ticksDiag(0, 0, .45)], 'Surface ceiling light'),
  sym('Luminaria de techo embutida', [C(0, 0, .45), C(0, 0, .32, true), ...ticksDiag(0, 0, .45)], 'Recessed ceiling light'),
  sym('Luminaria', [...X(0, 0, .55)], 'Luminaire light'),
  sym('Luz de piso', [rect(-.55, -.55, 1.1, 1.1), C(0, 0, .45), ...X(0, 0, .55)], 'Floor light'),
  sym('Luz de escalón', [...D(-.25, 0, .45), L([-.05, -.3], [.4, -.6]), flecha(.48, -.66, 1, -.75, .14), L([-.05, .3], [.4, .6]), flecha(.48, .66, 1, .75, .14)], 'Step light'),
  sym('Luz exterior', [C(0, 0, .5), ...X(0, 0, .35)], 'Outdoor light'),
  sym('Luz LED (tira)', [...[-.06, .06].flatMap(y => Array.from({ length: 9 }, (_, i) => L([-.85 + i * .2, y], [-.73 + i * .2, y])))], 'LED light'),
  sym('Aplique de pared', [L([-.65, -.4], [-.65, .4]), L([-.65, 0], [-.35, 0]), C(.05, 0, .4), ...X(.05, 0, .28)], 'Wall light'),
  sym('Aplique de pared de superficie', [...D(-.3, 0, .45), L([.15, 0], [.6, 0])], 'Surface wall light'),
  sym('Aplique de pared embutido', [...D(-.3, 0, .45, true), L([.15, 0], [.6, 0])], 'Recessed wall light'),
  sym('Ventilador de techo con luz', [C(0, 0, .2), C(0, 0, .1), ...[0, 90, 180, 270].map(a => { const t = a * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    return L([c * .2 - s * .2, s * .2 + c * .2], [c * .2 - s * .2 + c * .55 + s * .15, s * .2 + c * .2 + s * .55 - c * .15]); })], 'Ceiling fan with light'),
];

const tomaUS = (lineas, extra = []) => [C(.15, 0, .35), ...lineas.map(y => L([-.65, y], [.15 + Math.sqrt(Math.max(0, .35 ** 2 - y * y)), y])), ...extra];
const aspas = (cx, cy, r) => [L([cx - r - .35, cy - .4], [cx - r, cy]), L([cx + r, cy], [cx + r + .35, cy + .4])];
const pack8 = [
  sym('Caja eléctrica', [F([-.6, -.12], [.6, -.12], [.55, .12], [-.6, .12])], 'Electrical switchbox'),
  sym('Interruptor unipolar', [txt('S', 0, 0, .6)], 'Single pole switch'),
  sym('Interruptor de tres vías (S3)', [T(-.3, .25, 'S', .6), T(.08, .35, '3', .32)], 'Three-way switch'),
  sym('Tomacorriente simple', tomaUS([0]), 'Singleplex receptacle'),
  sym('Tomacorriente doble', tomaUS([-.08, .08]), 'Duplex receptacle'),
  sym('Tomacorriente doble a prueba de agua', tomaUS([-.08, .08], [txt('WP', .78, .15, .26)]), 'Duplex receptacle, WP = waterproof'),
  sym('Tomacorriente doble con disyuntor (GFCI)', tomaUS([-.08, .08], [txt('GFCI', .72, .35, .2)]), 'GFCI duplex receptacle'),
  sym('Tomacorriente con tierra aislada', tomaUS([-.08, .08], [Lc([.15, -.25], [.38, .17], [-.08, .17]), txt('*', .65, -.3, .35)]), 'Isolated ground receptacle'),
  sym('Tomacorriente conmutado', tomaUS([-.08, .08], [F(...arcPts(.15, 0, .35, 180, 360, 12))]), 'Switched receptacle'),
  sym('Tomacorriente cuádruple', tomaUS([-.08, .08], [L([.15, -.35], [.15, .35])]), 'Fourplex (four gang) receptacle'),
  sym('Tomacorriente de 240 V', tomaUS([-.13, 0, .13]), '240-volt receptacle'),
  sym('Luminaria de techo (cadena)', [C(0, 0, .35), ...ticksOrto(0, 0, .35, .2), txt('PC', .5, .4, .2)], 'Ceiling mounted light fixture, PC = pullchain'),
  sym('Luminaria de pared', [C(.15, 0, .35), L([-.5, 0], [-.2, 0])], 'Wall-mounted light fixture'),
  sym('Luminaria embutida', [C(0, 0, .35), txt('R', 0, 0, .3)], 'Recessed light fixture'),
  sym('Luminaria a prueba de intemperie', [C(.1, 0, .35), L([-.5, 0], [-.25, 0]), txt('WP', .55, .35, .2)], 'Weatherproof light fixture'),
  sym('Luminaria fluorescente', [rect(-.6, -.25, 1.2, .5), C(-.35, 0, .2)], 'Fluorescent light fixture'),
  sym('Luminaria fluorescente (línea)', [L([-.6, 0], [.6, 0]), L([-.6, -.15], [-.6, .15]), L([.6, -.15], [.6, .15])], 'Fluorescent light fixture'),
  sym('Ventilador de techo', [C(0, 0, .3), ...aspas(0, 0, .3), txt('CF', .55, .55, .2)], 'Ceiling fan'),
  sym('Luz y ventilador combinados', [C(0, 0, .3), C(0, 0, .15), ...aspas(0, 0, .3)], 'Combination light & fan'),
  sym('Extractor (ventilador)', [C(0, 0, .3), ...aspas(0, 0, .3), txt('VF', .55, .55, .2)], 'Power vent fan'),
  sym('Motor eléctrico (número = HP)', [C(0, 0, .3), ...aspas(0, 0, .3), txt('2', 0, 0, .3)], 'Electric motor, number = HP'),
  sym('Detector de humo', [C(0, 0, .38), txt('SD', 0, 0, .28)], 'Smoke detector'),
  sym('Interruptor automático (breaker)', [L([-.7, .1], [-.35, .1]), arc(0, .1, .35, 180, 360, 16), L([.35, .1], [.7, .1])], 'Circuit breaker'),
  sym('Toma de teléfono', [F([-.3, -.3], [.25, 0], [-.3, .3]), L([.28, -.32], [.28, .32])], 'Telephone jack'),
  sym('Transformador de timbre', [rect(-.35, -.35, .7, .7), txt('T', 0, 0, .34)], 'Doorbell transformer'),
  sym('Pulsador de timbre', [rect(-.35, -.35, .7, .7), C(0, 0, .15, true)], 'Doorbell pushbutton'),
  sym('Tierra', [L([0, -.6], [0, .05]), ...tierraLineas(.05, .45)], 'Ground'),
];

const intF = (ang, len = .95) => brazo(-.2, .3, .17, ang, len);
const pack9 = [
  (() => { const b = intF(-45); return sym('Interruptor simple', [C(-.2, .3, .17), L(b.p0, b.p1)], 'Interrupteur simple allumage'); })(),
  (() => { const l = brazo(0, .3, .17, -130, .8), r = brazo(0, .3, .17, -50, .8); return sym('Interruptor doble', [C(0, .3, .17), L(l.p0, l.p1), L(r.p0, r.p1)], 'Double interrupteur'); })(),
  (() => { const u = brazo(0, 0, .17, -40, .8), d = brazo(0, 0, .17, 140, .8);
    return sym('Conmutador (va y viene)', [C(0, 0, .17), L(u.p0, u.p1), L(d.p0, d.p1), remate(u, 1, .2), remate(d, 1, .2, 'ccw')], 'Interrupteur va-et-vient'); })(),
  sym('Punto de luz', [...X(0, 0, .45)], "Point d'éclairage"),
  sym('Pulsador', [C(0, 0, .45), C(0, 0, .35)], 'Bouton poussoir'),
  sym('Toma 2P+T con protección', [arc(0, -.25, .4, 0, 180, 16), L([-.55, .15], [.55, .15]), L([0, .15], [0, .6]), L([-.55, -.25], [-.4, -.25]), L([.4, -.25], [.55, -.25])], 'Prise 2P + T à éclips'),
  sym('Toma de teléfono', [L([-.25, -.2], [-.25, .05], [.25, .05], [.25, -.2]), L([0, .05], [0, .7]), txt('TP', 0, -.45, .3)], 'Prise téléphone'),
  sym('Toma de televisión', [L([-.25, -.2], [-.25, .05], [.25, .05], [.25, -.2]), L([0, .05], [0, .7]), txt('TV', 0, -.45, .3)], 'Prise télévision'),
  sym('Toma de seguridad', [C(0, 0, .3), L([-.3, -.45], [-.2, -.2]), L([.3, -.45], [.2, -.2]), L([0, .3], [0, .7])], 'Prise de sécurité'),
  sym('Aparato de calefacción', [rect(-.9, -.15, 1.8, .3), ...[-.6, -.3, 0, .3, .6].map(x => L([x, -.15], [x, .15]))], 'Appareil de chauffage'),
  sym('Pulsador luminoso', [C(0, 0, .45), C(0, 0, .35), ...X(0, 0, .24)], 'B.P. lumineux'),
];

const PACKS = [
  { file: 'eclib-planos-electricos-tabla-general', library: 'Planos eléctricos — tabla general', symbols: pack1 },
  { file: 'eclib-interruptores-y-pulsadores-unifilares', library: 'Interruptores y pulsadores (unifilares)', symbols: pack2 },
  { file: 'eclib-instalacion-electrica-mexico', library: 'Instalación eléctrica — México', symbols: pack3 },
  { file: 'eclib-simbologia-electrica-normalizada-iec', library: 'Simbología eléctrica normalizada (IEC)', symbols: pack4 },
  { file: 'eclib-instalacion-electrica-espana', library: 'Instalación eléctrica — España (unifilar y multifilar)', symbols: pack5 },
  { file: 'eclib-iluminacion-planos-de-arquitectura', library: 'Iluminación — planos de arquitectura', symbols: pack6 },
  { file: 'eclib-luminarias', library: 'Luminarias', symbols: pack7 },
  { file: 'eclib-instalacion-electrica-estados-unidos', library: 'Instalación eléctrica — Estados Unidos', symbols: pack8 },
  { file: 'eclib-instalacion-electrica-francia', library: 'Instalación eléctrica — Francia', symbols: pack9 },
];
const out = process.argv[2] || '.';
const solo = process.argv[3] ? process.argv[3].split(',') : null; // nombres de archivo a escribir (opcional)
for (const p of PACKS) {
  if (solo && !solo.includes(p.file)) continue;
  const lib = { ecFormat: 'ec-library', version: 1, app: 'ElectroCAD', library: { name: p.library }, symbols: p.symbols };
  fs.writeFileSync(path.join(out, p.file + '.json'), JSON.stringify(lib));
  console.log(p.file, p.symbols.length);
}
