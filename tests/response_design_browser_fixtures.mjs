#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, render, load} from '../skills/dynamic-visual-reply/scripts/render.mjs';
import {resolve, harnessIds} from '../skills/dynamic-visual-reply/scripts/visual-config.mjs';
import {route} from '../skills/dynamic-visual-reply/scripts/route.mjs';

const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, {recursive: true});
const fixtures = [];
for (const view of ['table', 'cards', 'form', 'kanban', 'flow']) for (const readOnly of [true, false]) for (const harness of harnessIds()) {
  const spec = load(path.join(ROOT, 'assets/examples', view + '.json'));
  Object.assign(spec, {viewId: 'layout-' + view + '-' + harness + '-' + readOnly, title: 'Shared layout: ' + view});
  delete spec.readOnly;
  if (view === 'table') Object.assign(spec, {pageSize: 2, columns: [{key: 'name', label: 'Name'}, {key: 'score', label: 'Score', type: 'number'}],
    rows: Array.from({length: 4}, (_, i) => ({id: 'item-' + i, name: 'Item ' + i, score: i}))});
  const decision = route({view, feedback: readOnly ? 'none' : 'per-item'});
  const name = [harness, view, readOnly ? 'readonly' : 'review'].join('-') + '.html';
  const file = path.join(out, name);
  render(spec, file, 'inline', 680, 900, {route: decision, context: resolve({appearance: 'light'}, {harness, isolated: true})});
  let html = fs.readFileSync(file, 'utf8');
  // Host double, deliberately separate from the native adapters and the UI.
  const spy = `<script>window.calls={load:0,save:0,subscribe:0,submit:0};
window.dynamicVisualReplyHost={id:'fixture',capabilities:{submit:'message',persist:true,restore:true},
loadDraft(){calls.load++;return null},saveDraft(){calls.save++},
onExternalDraft(){calls.subscribe++;return ()=>{}},
submit(message){calls.submit++;window.feedback=message.feedback;return Promise.resolve({receipt:'submitted'})}};</script>`;
  html = html.replace('<script data-dynamic-visual-reply-runtime>', spy + '<script data-dynamic-visual-reply-runtime>');
  // Give every host the same outer frame; wrapper differences are not component layout.
  html = html.replace(/^.*?<body>/s, '').replace(/<\/body>.*$/s, '');
  fs.writeFileSync(file, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Response design layout fixture</title><style>body{margin:0;padding:16px;font:16px system-ui}</style></head><body>' + html + '</body></html>');
  fixtures.push({name, view, readOnly, harness});
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(fixtures));
console.log(JSON.stringify({out, fixtures: fixtures.length, nativeBridges: false}));
