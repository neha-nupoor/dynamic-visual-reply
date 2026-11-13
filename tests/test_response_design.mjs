import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {route, applyRoute} from '../skills/dynamic-visual-reply/scripts/route.mjs';
import {ROOT, render, load, BUNDLE, placement} from '../skills/dynamic-visual-reply/scripts/render.mjs';
import {resolve, harnessIds} from '../skills/dynamic-visual-reply/scripts/visual-config.mjs';

const cases = load(fileURLToPath(new URL('./response_design_cases.json', import.meta.url)));
for (const c of cases) test('routing: ' + c.id, () => {
  const actual = route(c.facts);
  for (const [key, value] of Object.entries(c.expected)) assert.deepEqual(actual[key], value, key);
  assert.deepEqual(route(JSON.parse(JSON.stringify(c.facts))), actual, 'stable across serialization and repeat calls');
});

test('inline:true and omitted inline route identically; inline:false only demotes automatic read-only views', () => {
  for (const c of cases) {
    const {inline, ...base} = c.facts;
    const original = route(base);
    assert.deepEqual(route({...base, inline: true}), original, c.id + ' inline:true');
    const offline = route({...base, inline: false});
    if (original.target === 'markdown' || original.reason === 'requested-view' || original.reason === 'requested-report'
      || original.reason === 'item-feedback' || original.readOnly === false || !['visual', 'visualization', 'custom-visual'].includes(original.target)
      || c.facts.format === 'visualization' || c.facts.format === 'custom' || c.facts.view) assert.deepEqual(offline, original, c.id + ' inline:false kept');
    else assert.deepEqual(offline, {target: 'markdown', reason: 'no-inline-host', offerReview: true}, c.id + ' inline:false demoted');
  }
});

test('dense routes preserve feedback mode regardless of other visual triggers', () => {
  for (const feedback of ['none', 'overall', 'per-item']) for (const singleReply of [undefined, false, true])
    for (const visualBenefit of [false, true]) for (const visualReport of [false, true]) {
      const facts = {intent: 'compare', recordLike: true, items: 2, tableRows: [15], feedback, visualBenefit, visualReport,
        ...(singleReply === undefined ? {} : {singleReply})};
      const decision = route(facts);
      assert.equal(decision.target, 'visual');
      assert.equal(decision.readOnly, feedback !== 'per-item', JSON.stringify(facts));
    }
});

test('automatic comparison cards require a known positive small item count', () => {
  for (const [items, expected] of [[undefined, 'table'], [0, 'table'], [1, 'cards'], [2, 'cards'], [4, 'cards'], [5, 'table'], [15, 'table']]) {
    const facts = {intent: 'compare', recordLike: true, tableRows: [15], ...(items === undefined ? {} : {items})};
    const decision = route(facts);
    assert.equal(decision.view, expected, JSON.stringify(facts));
    assert.equal(decision.readOnly, true);
    assert.equal(route({...facts, view: 'cards'}).view, 'cards', 'explicit view still wins');
  }
});

test('invalid facts fail rather than silently changing a route', () => {
  for (const facts of [null, [], {items: true}, {items: -1}, {words: 1.5}, {recordLike: 'true'}, {tableRows: [3, '7']},
    {format: 'html'}, {view: 'chart'}, {feedback: 'yes'}, {harness: 'codex'}, {unrecognized: true},
    {visualBenefit: 'yes'}, {inline: 'false'}, {customLayout: true}, {customLayout: true, customReason: ''}]) assert.throws(() => route(facts));
});

test('selected profile/mode is enforced and source data is retained', () => {
  const decision = route({view: 'table', feedback: 'per-item'});
  const spec = load(path.join(ROOT, 'assets/examples/table.json'));
  const before = structuredClone(spec);
  const result = applyRoute(spec, decision);
  assert.deepEqual(spec, before);
  assert.deepEqual(result.columns, spec.columns);
  assert.deepEqual(result.rows, spec.rows);
  assert.equal(result.readOnly, false);
  for (const bad of [{...decision, target: 'markdown'}, {...decision, profile: 'form-v1'}, {...decision, readOnly: 'false'}])
    assert.throws(() => applyRoute(spec, bad));
  assert.throws(() => applyRoute({...spec, view: 'cards'}, decision));
  assert.throws(() => applyRoute({...spec, readOnly: true}, decision));
  assert.throws(() => applyRoute(spec, route({format: 'custom'})), /Only a visual route/);
});

test('all profiles retain identical content, theme, runtime and state keys on all adapter IDs', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'response-design-test-'));
  try {
    const runtime = fs.readFileSync(BUNDLE, 'utf8');
    for (const view of ['table', 'cards', 'form', 'kanban', 'flow']) for (const readOnly of [true, false]) {
      const decision = route({view, feedback: readOnly ? 'none' : 'per-item'});
      const base = load(path.join(ROOT, 'assets/examples', view + '.json'));
      delete base.readOnly;
      let reference;
      for (const harness of harnessIds()) {
        const result = render(structuredClone(base), path.join(out, harness + view + readOnly + '.html'), 'inline', 680, 900,
          {route: decision, context: resolve({appearance: 'light'}, {harness, isolated: true})});
        const snapshot = load(result.spec);
        delete snapshot.resolvedPresentation;
        if (!reference) reference = snapshot;
        assert.deepEqual(snapshot, reference, harness + '/' + view);
        const html = fs.readFileSync(result.path, 'utf8');
        if (result.delivery === 'url') assert.ok(html.includes('integrity="' + load(path.join(ROOT, 'assets/renderer/dist/manifest.json')).sri + '"'), 'same runtime by SRI');
        else assert.ok(html.includes(runtime), 'same checked-in runtime');
        assert.equal(result.view, view);
        assert.equal(result.theme, 'generic');
      }
    }
  } finally { fs.rmSync(out, {recursive: true, force: true}); }
});

test('CLI route reaches renderer and keeps explicit placement and payload safeguards', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'route-cli-test-'));
  try {
    const facts = path.join(out, 'facts.json'), decisionFile = path.join(out, 'route.json');
    fs.writeFileSync(facts, JSON.stringify({recordLike: true, tableRows: [15]}));
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/route.mjs'), '--facts', facts, '--out', decisionFile]);
    const args = [path.join(ROOT, 'scripts/render.mjs'), '--spec', path.join(ROOT, 'assets/examples/table.json'),
      '--route', decisionFile, '--out', path.join(out, 'view.html'), '--harness', 'codex'];
    const rendered = JSON.parse(execFileSync(process.execPath, args, {encoding: 'utf8'}));
    assert.equal(load(rendered.spec).readOnly, true);
    assert.equal(rendered.format, 'inline');
    const decision = load(decisionFile), base = load(path.join(ROOT, 'assets/examples/table.json'));
    const context = resolve({appearance: 'light'}, {harness: 'codex', isolated: true});
    assert.equal(render(structuredClone(base), path.join(out, 'standalone.html'), 'standalone', undefined, undefined, {route: decision, context}).format, 'standalone');
    assert.equal(render({...base, presentation: 'standalone'}, path.join(out, 'spec-placement.html'), 'auto', undefined, undefined, {route: decision, context}).format, 'standalone');
    const small = resolve({placement: {maxInlineBytes: 1000}}, {harness: 'codex', isolated: true});
    const fallback = render(structuredClone(base), path.join(out, 'oversize.html'), 'auto', undefined, undefined, {route: decision, context: small});
    assert.equal(fallback.harness, 'browser-local');
    assert.equal(fallback.format, 'standalone');
    assert.equal(fallback.handoff.type, 'serve');
    assert.throws(() => render(structuredClone(base), path.join(out, 'explicit-oversize.html'), 'inline', undefined, undefined, {route: decision, context: small}), /exceeds/);
  } finally { fs.rmSync(out, {recursive: true, force: true}); }
});

test('entrypoints stay below the old 1708-word core, with relevant host references only', () => {
  const router = fs.readFileSync(new URL('../skills/response-design/SKILL.md', import.meta.url), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  assert.ok((router + renderer).trim().split(/\s+/).length <= 1100);
  assert.ok(Buffer.byteLength(router + renderer) < 11556);
  for (const [text, dir] of [[router, path.resolve(ROOT, '../response-design')], [renderer, ROOT]]) {
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) if (!match[1].includes('://'))
      assert.ok(fs.existsSync(path.resolve(dir, match[1])), 'reachable reference: ' + match[1]);
  }
});

test('narrow three-column tables use standalone instead of compressing readable headers', () => {
  const spec = {...load(path.join(ROOT, 'assets/examples/table.json')), readOnly: true};
  spec.rows = spec.rows.slice(0, 1);
  assert.equal(placement(spec, 320, 900).mode, 'standalone');
  assert.equal(placement(spec, 736, 900).mode, 'inline');
});
