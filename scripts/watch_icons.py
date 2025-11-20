#!/usr/bin/env python3
"""
Watch the `public/icons` folder and regenerate `public/icons/icons.json`
when the set of files changes. Run in background while developing:

python scripts/watch_icons.py

This script uses a simple polling loop (no extra dependencies) and is
intended for local development on Windows/macOS/Linux.
"""
import os
import time
import json
import sys

ROOT = os.path.dirname(os.path.dirname(__file__))
ICONS_DIR = os.path.join(ROOT, 'public', 'icons')
OUT_FILE = os.path.join(ICONS_DIR, 'icons.json')
POLL_INTERVAL = 2.0  # seconds

if not os.path.isdir(ICONS_DIR):
    print('Icons directory does not exist:', ICONS_DIR)
    sys.exit(1)


def list_icons():
    files = [f for f in os.listdir(ICONS_DIR) if os.path.isfile(os.path.join(ICONS_DIR, f))]
    files = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.svg', '.webp'))]
    files.sort()
    return files


def write_icons_json(files):
    with open(OUT_FILE, 'w', encoding='utf-8') as fh:
        json.dump(files, fh, ensure_ascii=False, indent=2)
    print('Wrote', OUT_FILE)


def main():
    prev = list_icons()
    # ensure file exists at start
    write_icons_json(prev)
    try:
        while True:
            time.sleep(POLL_INTERVAL)
            cur = list_icons()
            if cur != prev:
                print('Detected change in icons folder — regenerating icons.json')
                write_icons_json(cur)
                prev = cur
    except KeyboardInterrupt:
        print('\nWatcher stopped by user')


if __name__ == '__main__':
    main()
