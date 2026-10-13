# Recursos ElectroCAD — Conversor DXF

Aplicación web (Vite + JavaScript) que lee un **DWG o DXF** de AutoCAD en el navegador y lo convierte a las **formas editables de ElectroCAD** (`shapes[]` y `texts[]`, el mismo formato de `formas.js`). Nada se sube a ningún servidor.

## Desarrollo

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build
```

## Qué convierte

| DXF | ElectroCAD |
|---|---|
| `LINE` | línea |
| `LWPOLYLINE` / `POLYLINE` | líneas, **arcos reales** (bulge) y, si son 4 lados a 90°, un **rectángulo** (también girado) |
| `CIRCLE` | círculo |
| `ARC` | arco con flecha `h` (semicírculo si mide 180°) |
| `SPLINE` / `ELLIPSE` | segmentos rectos (spline evaluado con sus nudos) |
| `TEXT` / `MTEXT` | texto (se limpian los códigos de formato de MTEXT) |
| `INSERT` | bloque explotado (posición, escala, espejo, rotación, punto base, matrices) |
| `DIMENSION` | opcional (apagado por defecto) |

No se convierte: sombreados (`HATCH`), directrices, imágenes, sólidos. La página avisa cuántos hay.

Detalles: unidades por `$INSUNITS` o estimadas por el tamaño; capas apagadas/congeladas en AutoCAD vienen desmarcadas; sugerencia de rol por nombre de capa (Muros, Aberturas, Cotas…) con atajos; acepta DXF en UTF-8 o ANSI; el `.dwg` no se lee (hay que guardarlo como DXF).

## Salida

`<nombre>.electrocad.json`:

```json
{ "electrocadImportV": 1, "name": "…", "source": {…}, "extentCm": {"width":…,"height":…},
  "shapes": [{"id":1,"type":"line|rect|circle|arc","x1":…,"y1":…,"x2":…,"y2":…,"layer":"infra","h?":…,"semi?":true,"rot?":…,"color?":"#rrggbb"}],
  "texts":  [{"id":1,"x":…,"y":…,"text":"…","size":16,"color":"","layer":"infra","rot?":…}] }
```

Coordenadas en cm, eje Y hacia abajo, esquina del dibujo a 100 cm del origen.

## Pendiente

- **Importar dentro de ElectroCAD**: hoy la página solo descarga el archivo. Falta el botón "Importar plano" en la app que sume `shapes`/`texts` al proyecto (con `setDirty()` y deshacer).
- Alternativa por enlace: definir `VITE_ELECTROCAD_IMPORT_ENDPOINT` (ver `.env.example`) con una función que cree un proyecto compartido y devuelva `{ id, url }`.

## DWG

Los `.dwg` se leen con [`@mlightcad/libredwg-web`](https://github.com/mlightcad/libredwg-web) (LibreDWG compilado a WebAssembly, **GPL-3.0**). Se carga solo al subir un `.dwg` (`src/dwg.js`, import dinámico; el `.wasm` pesa ~10 MB, ~2,5 MB comprimido) y se adapta a la forma de `dxf-parser` para reusar el mismo conversor.

**Licencia:** por usar esa librería, esta página es GPL-3.0 (ver `LICENSE`) y debe publicar su código fuente (`VITE_SOURCE_URL`, ver `.env.example`). Por eso vive **aparte de ElectroCAD**: no se copia código GPL dentro de la app, solo se intercambia un archivo (`.electrocad.json`).

## Zonas

Las hojas con varios planos (cortes, vistas, carátula) se pueden recortar con el botón ▭ de la vista previa: se importa solo lo que queda dentro del recuadro.
