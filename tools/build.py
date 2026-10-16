#!/usr/bin/env python3
"""Builds the single self-contained index.html (CSS, JS and fonts inlined) and the service worker."""
import base64, hashlib, pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
js_parts = ['logic.js'] + sorted(p.name for p in src.glob('[0-9][0-9]-*.js'))
js = '\n'.join((src / n).read_text() for n in js_parts)
if '</script' in js.lower():
    sys.exit('A script contains </script, which would end the inline block early.')
def font(name):
    return 'data:font/woff;base64,' + base64.b64encode((src / 'fonts' / name).read_bytes()).decode()
css = (src / 'style.css').read_text()
css = css.replace('__FONT_REG__', font('heros-regular.woff')).replace('__FONT_BOLD__', font('heros-bold.woff')).replace('__FONT_CN__', font('heroscn-bold.woff'))
html = (src / 'shell.html').read_text().replace('/*__CSS__*/', css).replace('/*__JS__*/', js)
(root / 'index.html').write_text(html)
(root / 'manifest.webmanifest').write_text((src / 'manifest.webmanifest').read_text())
version = hashlib.sha256((html + (src / 'sw.js').read_text() + (src / 'manifest.webmanifest').read_text()).encode()).hexdigest()[:10]
(root / 'sw.js').write_text((src / 'sw.js').read_text().replace('__VERSION__', version))
print(f'index.html {len(html)/1024:.0f} KB, cache version {version}')
