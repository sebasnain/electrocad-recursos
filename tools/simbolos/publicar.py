# Suma (o actualiza) packs dibujados en el catálogo de la página.
# python publicar.py packs.json   (lista de [archivo-sin-extension, nombre, descripcion, fuente])
# Antes: node dibujar.mjs ../../public/packs <archivos>  (deja el .json en public/packs)
# Escribe el .zip (library.json adentro) en packs/ y public/packs/ y actualiza los dos catalog.json.
import json, zipfile, os, sys
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
os.chdir(RAIZ)
meta = json.load(open(sys.argv[1], encoding='utf-8'))
cats = {f: json.load(open(f, encoding='utf-8')) for f in ['packs/catalog.json', 'public/packs/catalog.json']}
for base, name, desc, src in meta:
    data = open(f'public/packs/{base}.json', 'rb').read()
    n = len(json.loads(data)['symbols'])
    for d in ['packs', 'public/packs']:
        with zipfile.ZipFile(f'{d}/{base}.zip', 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('library.json', data)
    size = os.path.getsize(f'packs/{base}.zip')
    for f, c in cats.items():
        e = {'file': base + '.zip', 'name': name, 'symbols': n, 'description': desc, 'bytes': size}
        if f.startswith('public'):
            e.update({'json': base + '.json', 'source': src})
        i = next((k for k, x in enumerate(c) if x['file'] == e['file']), None)
        if i is None: c.append(e)
        else: c[i] = e
    print(base, n, 'simbolos', size, 'bytes')
for f, c in cats.items():
    open(f, 'w', encoding='utf-8', newline='\n').write(json.dumps(c, indent=1, ensure_ascii=False) + '\n')
