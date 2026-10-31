// Catálogo de bibliotecas de símbolos para ElectroCAD (.zip "ec-library").
// Cada pack se baja y se importa en ElectroCAD → Mi biblioteca de símbolos → «Importar .zip».
// La vista previa dibuja la geometría Fabric (path / circle / text) como SVG, sin librerías.

const BASE = `${import.meta.env.BASE_URL}packs/`;
const esc = v => String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

function symbolSvg(sym) {
  const objs = sym.geometryData?.objects || [];
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  const grow = (x, y) => { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y); };
  let body = '';
  for (const o of objs) {
    const stroke = o.stroke || 'currentColor', sw = o.strokeWidth || 4, fill = o.fill && o.fill !== 'transparent' ? o.fill : 'none';
    if (o.type === 'circle') {
      grow(o.left - o.radius, o.top - o.radius); grow(o.left + o.radius, o.top + o.radius);
      body += `<circle cx="${o.left}" cy="${o.top}" r="${o.radius}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    } else if (o.type === 'path') {
      const dd = (o.path || []).map(s => { if (s.length > 2) grow(s[1], s[2]); return s.join(' '); }).join(' ');
      body += `<path d="${dd}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (o.type === 'text') {
      grow(o.left, o.top - o.fontSize); grow(o.left + o.text.length * o.fontSize * 0.6, o.top);
      body += `<text x="${o.left}" y="${o.top}" font-size="${o.fontSize}" font-family="Arial" fill="${o.fill || stroke}">${esc(o.text)}</text>`;
    }
  }
  if (!body) return '';
  const p = 10, w = c - a + 2 * p, h = d - b + 2 * p;
  return `<svg viewBox="${a - p} ${b - p} ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${body}</svg>`;
}

export async function mountSymbolCatalog(host) {
  let cat;
  try { cat = await (await fetch(`${BASE}catalog.json`, { cache: 'no-cache' })).json(); } catch { return; }
  if (!Array.isArray(cat) || !cat.length) return;
  host.innerHTML = `
    <div class="intro"><p class="eyebrow">BIBLIOTECAS DE SÍMBOLOS</p>
      <h2>Símbolos para ElectroCAD</h2>
      <p>Descargá un pack y, en ElectroCAD, abrí <strong>Mi biblioteca de símbolos → ⬆ Importar .zip</strong>. Quedan en tu cuenta y los podés editar, renombrar o borrar como cualquier símbolo propio.</p></div>
    <div class="pack-grid">${cat.map((p, i) => `
      <article class="pack" data-i="${i}">
        <h3>${esc(p.name)}</h3>
        <p class="pack-n">${p.symbols} símbolos · ${Math.max(1, Math.round(p.bytes / 1024))} KB</p>
        <p>${esc(p.description)}</p>
        <p class="pack-src">Fuente: ${esc(p.source || '')}</p>
        <div class="pack-actions"><a class="primary link-button" href="${BASE}${encodeURIComponent(p.file)}" download>Descargar .zip</a>
          <button type="button" class="secondary" data-view>Ver los símbolos</button></div>
        <div class="pack-view hidden"></div>
      </article>`).join('')}</div>`;
  host.querySelectorAll('.pack').forEach(card => {
    const p = cat[+card.dataset.i], view = card.querySelector('.pack-view'), btn = card.querySelector('[data-view]');
    btn.addEventListener('click', async () => {
      if (!view.dataset.ok) {
        btn.disabled = true; btn.textContent = 'Cargando…';
        try {
          const lib = await (await fetch(`${BASE}${p.json}`)).json();
          view.innerHTML = lib.symbols.map(s => `<figure title="${esc(s.name)}">${symbolSvg(s)}<figcaption>${esc(s.name)}</figcaption></figure>`).join('');
          view.dataset.ok = '1';
        } catch { view.textContent = 'No se pudo cargar la vista previa.'; }
        btn.disabled = false;
      }
      const open = view.classList.toggle('hidden');
      btn.textContent = open ? 'Ver los símbolos' : 'Ocultar';
    });
  });
}
