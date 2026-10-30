#!/usr/bin/env node
/** Generate local bridge doubles for browser checks; no real agent receives messages. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT, load, render} from '../skills/dynamic-visual-reply/scripts/render.mjs';
import {resolve, isMain, requireValue, runCli} from '../skills/dynamic-visual-reply/scripts/visual-config.mjs';

export function generate(out) {
  out = path.resolve(out); fs.mkdirSync(out, {recursive: true});
  fs.copyFileSync(fileURLToPath(new URL('./bridge_fixture.js', import.meta.url)), path.join(out, 'bridge-fixture.js'));
  const written = [];
  for (const view of ['table', 'cards', 'form', 'kanban', 'flow']) {
    const base = load(path.join(ROOT, 'assets/examples', view + '.json')); base.viewId = 'oat-regression-' + view;
    if (view === 'table') Object.assign(base, {
      columns: [{key: 'name', label: 'Name'}, {key: 'score', label: 'Score', type: 'number', editable: true}, {key: 'status', label: 'Status'}],
      filterKey: 'status', pageSize: 3,
      rows: Array.from({length: 12}, (_, index) => ({id: 'item-' + index, name: 'Item ' + String(index).padStart(2, '0'), score: index + 1, status: index % 2 === 0 ? 'Ready' : 'Later'})),
    });
    else if (view === 'cards') { base.rows = base.rows.slice(0, 2); base.rows[0].details = 'Literal text: <script>example</script> & quotes "stay text".'; }
    else if (view === 'form') base.fields.push({id: 'limit', label: 'Batch limit', type: 'number', value: 0, help: 'Zero is a valid answer.'});
    for (const harness of ['codex', 'claude-inline']) for (const appearance of ['light', 'dark', 'system', 'host']) {
      const file = path.join(out, harness + '-' + view + '-' + appearance + '.html');
      render(structuredClone(base), file, 'inline', undefined, undefined, {context: resolve({appearance}, {harness, isolated: true})});
      let html = fs.readFileSync(file, 'utf8');
      html = html.replace('<script data-dynamic-visual-reply-runtime>', '<script src="bridge-fixture.js"></script>\n<script data-dynamic-visual-reply-runtime>');
      const policy = "script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'";
      const inspector = '<details id="fixture-inspector"><summary>Test host inspector</summary>' +
        '<p>Local test double; no real message is sent.</p><button id="fixture-reset">Reset test draft</button>' +
        '<button id="fixture-restore">Restore incoming draft</button><button id="fixture-inspect">Inspect saved draft</button>' +
        '<button id="fixture-appearance">Toggle host appearance</button><button id="fixture-palette">Adjust host border</button>' +
        '<pre id="fixture-receipt">null</pre><pre id="fixture-snapshot">null</pre></details>';
      fs.writeFileSync(file, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<meta http-equiv="Content-Security-Policy" content="' + policy + '"><title>Renderer bridge fixture</title>' +
        '<style>:root{--border:#657180;--text-primary:#191919;--surface-2:#eeeeee}:root[data-theme=dark]{--border:#717171;--text-primary:#eeeeee;--surface-2:#171717}body{margin:0;padding:16px;background:#e9ebee;font:16px system-ui}body :is(td,label,p){color:#fafafa}#fixture-inspector{margin-bottom:16px}#fixture-inspector pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>' +
        '</head><body>' + inspector + html + '</body></html>');
      written.push(path.basename(file));
    }
  }
  return {out, fixtures: written.length, delivery: 'embed'};
}
if (isMain(import.meta.url)) runCli(() => {
  requireValue(process.argv.length === 3, 'Usage: node tests/browser_fixtures.mjs <output-directory>');
  console.log(JSON.stringify(generate(process.argv[2])));
});
