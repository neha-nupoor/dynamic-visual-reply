#!/usr/bin/env python3
"""Generate local bridge fixtures for browser regression checks.

python3 tests/browser_fixtures.py <output-directory> [--renderer-url <matching HTTPS bundle>]
Serve the output on loopback. Claude fixtures block inline JavaScript and use SRI.
The bridge is a test double: no fixture sends a real chat message.
"""
import argparse
import contextlib
import copy
import io
import json
from pathlib import Path
import shutil
import sys

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'skills/visual-response-design/scripts'))
import render
import visual_config


def generate(out, renderer_url=None):
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(render.BUNDLE, out / 'renderer.js')
    shutil.copyfile(Path(__file__).with_name('bridge_fixture.js'), out / 'bridge-fixture.js')
    written = []
    for view in ('table', 'cards', 'form', 'kanban', 'flow'):
        base = render.load(render.ROOT / 'assets/examples' / f'{view}.json')
        base['viewId'] = 'oat-regression-' + view
        if view == 'table':
            base.update(columns=[{'key': 'name', 'label': 'Name'}, {'key': 'score', 'label': 'Score', 'type': 'number', 'editable': True},
                                 {'key': 'status', 'label': 'Status'}], filterKey='status', pageSize=3,
                        rows=[{'id': f'item-{i}', 'name': f'Item {i:02}', 'score': i + 1, 'status': 'Ready' if i % 2 == 0 else 'Later'} for i in range(12)])
        elif view == 'cards':
            base['rows'] = base['rows'][:2]
            base['rows'][0]['details'] = 'Literal text: <script>example</script> & quotes "stay text".'
        elif view == 'form':
            base['fields'].append({'id': 'limit', 'label': 'Batch limit', 'type': 'number', 'value': 0, 'help': 'Zero is a valid answer.'})
        for harness in ('codex', 'claude-inline'):
            for appearance in ('light', 'dark', 'system', 'host'):
                context = visual_config.resolve({'appearance': appearance, 'delivery': {'rendererUrl': renderer_url or 'https://fixture.invalid/renderer.js'}}, harness=harness, isolated=True)
                path = out / f'{harness}-{view}-{appearance}.html'
                spec = copy.deepcopy(base)
                with contextlib.redirect_stdout(io.StringIO()):
                    render.render(spec, path, 'inline', context=context)
                html = path.read_text()
                # A relative URL is test-only; production Claude URLs must be HTTPS.
                html = html.replace('https://fixture.invalid/renderer.js', 'renderer.js')
                marker = '<script src=' if harness == 'claude-inline' else '<script data-visual-response-runtime>'
                position = html.index(marker)
                html = html[:position] + '<script src="bridge-fixture.js"></script>\n' + html[position:]
                policy = "script-src 'self'" + (" 'unsafe-inline'" if harness == 'codex' else '')
                if renderer_url:
                    from urllib.parse import urlparse
                    url = urlparse(renderer_url)
                    policy += ' ' + url.scheme + '://' + url.netloc
                policy += "; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'"
                inspector = '''<details id="fixture-inspector"><summary>Test host inspector</summary>
<p>Local test double; no real message is sent.</p><button id="fixture-reset">Reset test draft</button>
<button id="fixture-restore">Restore incoming draft</button><button id="fixture-inspect">Inspect saved draft</button>
<button id="fixture-appearance">Toggle host appearance</button>
<button id="fixture-palette">Adjust host border</button>
<pre id="fixture-receipt">null</pre><pre id="fixture-snapshot">null</pre></details>'''
                path.write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                                f'<meta http-equiv="Content-Security-Policy" content="{policy}"><title>Renderer bridge fixture</title>'
                                '<style>:root{--border:#657180;--text-primary:#191919;--surface-2:#eeeeee}:root[data-theme=dark]{--border:#717171;--text-primary:#eeeeee;--surface-2:#171717}body{margin:0;padding:16px;background:#e9ebee;font:16px system-ui}#fixture-inspector{margin-bottom:16px}#fixture-inspector pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>'
                                '</head><body>' + inspector + html + '</body></html>')
                written.append(path.name)
    print(json.dumps({'out': str(out.resolve()), 'fixtures': len(written), 'rendererUrl': renderer_url or 'local renderer.js'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--renderer-url')
    args = parser.parse_args()
    generate(args.out, args.renderer_url)
