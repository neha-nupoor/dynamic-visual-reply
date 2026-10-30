#!/usr/bin/env node
/** Reproduce README previews using the real renderer and an explicitly simulated Codex bridge. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {load, render} from '../skills/dynamic-visual-reply/scripts/render.mjs';
import {resolve} from '../skills/dynamic-visual-reply/scripts/visual-config.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || '.demo-preview');
fs.mkdirSync(out, {recursive: true});
const host = "window.openai={widgetState:null,setWidgetState(state){this.widgetState=state;return Promise.resolve()},sendFollowUpMessage({prompt}){const receipt=document.getElementById('demo-receipt');receipt.textContent=JSON.stringify(JSON.parse(prompt),null,2);receipt.hidden=false;return Promise.resolve()}};";
fs.writeFileSync(path.join(out, 'demo-host.js'), host);
const files = [];
for (const view of ['table', 'cards', 'form', 'kanban', 'flow']) for (const appearance of ['light', 'dark']) {
  const spec = load(path.join(repo, 'docs/examples', view + '.json'));
  const file = path.join(out, view + '-' + appearance + '.html');
  render(spec, file, 'inline', undefined, undefined, {context: resolve({appearance}, {harness: 'codex', isolated: true})});
  const fragment = fs.readFileSync(file, 'utf8').replace('<script data-dynamic-visual-reply-runtime>', '<script src="demo-host.js"></script><script data-dynamic-visual-reply-runtime>');
  const dark = appearance === 'dark';
  const policy = "script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'";
  fs.writeFileSync(file, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="' + policy + '"><title>Dynamic Visual Reply — ' + view + '</title>' +
    '<style>html{color-scheme:' + appearance + '}body{margin:0;padding:24px;background:' + (dark ? '#161616' : '#E9EBEE') +
    ';color:' + (dark ? '#DEDEDE' : '#333333') + ';font:14px system-ui}main{max-width:960px;margin:auto}.demo-label{margin:0 0 12px;color:' +
    (dark ? '#AFAFAF' : '#555555') + '}#demo-receipt{padding:16px;border:1px solid ' + (dark ? '#555' : '#BBB') +
    ';white-space:pre-wrap;overflow-wrap:anywhere;font:13px monospace}</style></head><body><main><p class="demo-label">Dynamic Visual Reply · local preview · simulated chat bridge</p>' +
    fragment + '<pre id="demo-receipt" hidden></pre></main></body></html>');
  files.push(path.basename(file));
}
console.log(JSON.stringify({out, files, bridge: 'simulated; no chat message is sent'}));
