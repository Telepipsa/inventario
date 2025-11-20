#!/usr/bin/env python3
"""
Genera public/icons/icons.json listando los archivos en public/icons.
Ejecutar desde la raíz del proyecto:
python scripts/generate_icons_json.py
"""
import os
import json

icons_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
icons_dir = os.path.normpath(icons_dir)
if not os.path.isdir(icons_dir):
    print('No existe el directorio', icons_dir)
    raise SystemExit(1)

files = [f for f in os.listdir(icons_dir) if os.path.isfile(os.path.join(icons_dir, f))]
# filter common image extensions
files = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.svg', '.webp'))]
files.sort()

out = os.path.join(icons_dir, 'icons.json')
with open(out, 'w', encoding='utf-8') as fh:
    json.dump(files, fh, ensure_ascii=False, indent=2)

print('Wrote', out)
