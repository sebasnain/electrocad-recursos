// Copia el WASM de libredwg-web a public/libredwg/ para servirlo junto con la página.
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('public/libredwg', { recursive: true });
copyFileSync('node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm', 'public/libredwg/libredwg-web.wasm');
