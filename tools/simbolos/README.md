# Conversor de símbolos (DWG / PDF → biblioteca de ElectroCAD)

Pasos (cada script lee/escribe JSON intermedios):
1. `dump.mjs` — lee los `.dwg` con libredwg-web (GPL) y los vuelca a JSON. Para PDF: `pdfprims.py` (PyMuPDF, solo trazos de color).
2. `cluster.mjs` / `clusterprims.mjs` — junta los trazos cercanos: cada grupo es un símbolo; el texto cercano es su nombre.
3. `sheet.cjs` — hoja de contacto numerada para revisar a ojo.
4. `cur/*.json` — curado a mano: nombres por número de grupo, `merge`, `tags`.
5. `build.mjs` — arma la biblioteca (`ec-library`, objetos Fabric 5.3).
6. `verify.cjs` / `zipimport.cjs` — pasan los símbolos por el importador REAL de ElectroCAD y los dibujan.

Los `.zip` salen en `packs/` (no en `public/`: publicarlos es otra decisión, ver derechos de autor de las fuentes).
