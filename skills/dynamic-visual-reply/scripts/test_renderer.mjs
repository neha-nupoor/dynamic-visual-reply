import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as render from './render.mjs';
import * as config from './visual-config.mjs';
import {createPreviewServer} from './serve.mjs';
import {report} from './doctor.mjs';

const example = name => config.load(path.join(config.ROOT, 'assets/examples', name + '.json'));
const temporary = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dynamic-visual-reply-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir; };
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, JSON.stringify(value)); };
const context = (harness = 'codex', cli = {}) => config.resolve(cli, {harness, isolated: true});
const page = (t, spec, host = context(), mode = 'inline') => {
  const out = path.join(temporary(t), 'view.html'), result = render.render(spec, out, mode, undefined, undefined, {context: host});
  return {result, html: fs.readFileSync(out, 'utf8'), out};
};
const block = (html, name) => JSON.parse(html.split('data-dynamic-visual-reply-' + name + '>')[1].split('</script>')[0]);

test('all five samples satisfy the schema and cross-record contract', () => {
  for (const name of render.VIEWS) {
    const spec = example(name);
    assert.equal(render.validate(spec), spec);
    assert.deepEqual(config.schemaErrors(spec, config.load(path.join(config.SCHEMA_DIR, 'spec.schema.json'))), []);
  }
});
test('schema rejects boolean numbers, invalid fields, shapes, reserved IDs and duplicate IDs', () => {
  const broken = [];
  const mutate = (view, fn) => { const spec = example(view); fn(spec); broken.push(spec); };
  mutate('table', spec => { spec.pageSize = true; });
  mutate('table', spec => { spec.schemaVersion = true; });
  mutate('table', spec => { spec.feedbackPrompt = {}; });
  mutate('table', spec => { spec.rows[0].id = '__proto__'; });
  mutate('table', spec => { spec.pageSize = 500; });
  mutate('table', spec => { spec.rows.push({...spec.rows[0]}); });
  mutate('table', spec => { spec.appearance = 'neon'; });
  mutate('table', spec => { spec.view = 'chart'; });
  mutate('form', spec => { spec.fields[0].value = 'not-an-option'; });
  mutate('form', spec => { spec.fields[3].value = 'yes'; });
  mutate('kanban', spec => { spec.stages = ['A', 'A']; });
  broken.push({schemaVersion: 1, viewId: 'x', view: 'form', title: 'Missing fields'});
  for (const spec of broken) assert.throws(() => render.validate(spec));
});
test('schema handles JSON equality, nested references, Unicode length and unique objects', () => {
  assert.ok(config.schemaErrors(true, {const: 1}).length);
  assert.ok(config.schemaErrors(false, {type: 'integer'}).length);
  assert.deepEqual(config.schemaErrors('🦉', {type: 'string', maxLength: 1}), []);
  assert.ok(config.schemaErrors([{a: 1, b: 2}, {b: 2, a: 1}], {type: 'array', uniqueItems: true}).length);
  assert.deepEqual(config.schemaErrors('yes', {$defs: {word: {type: 'string'}}, $ref: '#/$defs/word'}), []);
});
test('JSON escaping is lossless and cannot close script blocks', () => {
  const value = {message: '</script><img src=x onerror=alert(1)> & \u2028\u2029'};
  const encoded = render.jsonForHtml(value);
  assert.ok(!encoded.includes('</script>'));
  assert.ok(!encoded.includes('\u2028'));
  assert.deepEqual(JSON.parse(encoded), value);
});
test('CSV and TSV retain quoted delimiters, newlines, escaped quotes, BOM and numbers', t => {
  const dir = temporary(t);
  for (const delimiter of [',', '\t']) {
    const file = 'rows.' + (delimiter === ',' ? 'csv' : 'tsv');
    const data = '\uFEFFid' + delimiter + 'name' + delimiter + 'effort\r\na' + delimiter + '"First' + delimiter + 'line\nsay ""hello"""' + delimiter + '10\r\nb' + delimiter + 'B' + delimiter + '2\r\n';
    fs.writeFileSync(path.join(dir, file), data);
    const spec = example('table'); delete spec.rows; spec.dataFile = file;
    const result = render.validate(render.resolveData(spec, path.join(dir, 'spec.json')));
    assert.equal(result.rows[0].name, 'First' + delimiter + 'line\nsay "hello"');
    assert.equal(result.rows[0].effort, 10); assert.equal(result.rows[1].effort, 2);
  }
  assert.throws(() => render.delimitedRows('id,name\nx,"unfinished'), /Unclosed/);
});
test('JSON datasets resolve relative to the spec and do not accept two data sources', t => {
  const dir = temporary(t); write(path.join(dir, 'rows.json'), {rows: example('table').rows});
  const spec = example('table'); delete spec.rows; spec.dataFile = 'rows.json';
  assert.equal(render.validate(render.resolveData(spec, path.join(dir, 'spec.json'))).rows.length, example('table').rows.length);
  assert.throws(() => render.resolveData({...example('table'), dataFile: 'rows.json'}, path.join(dir, 'spec.json')), /rows or dataFile/);
  fs.writeFileSync(path.join(dir, 'invalid.csv'), 'id,effort\na,not-a-number\n');
  const bad = example('table'); delete bad.rows; bad.dataFile = 'invalid.csv';
  assert.throws(() => render.resolveData(bad, path.join(dir, 'spec.json')), /Non-numeric/);
  fs.writeFileSync(path.join(dir, 'invalid.csv'), 'id,effort\na,0x10\n');
  assert.throws(() => render.resolveData({...bad, dataFile: 'invalid.csv'}, path.join(dir, 'spec.json')), /Non-numeric/);
});
test('patches merge fields, retain other rows, remove records and increment revisions', () => {
  const spec = example('table'), original = spec.rows.find(row => row.id === 'cards');
  const updated = render.applyPatch(spec, {upsert: [{id: 'cards', status: 'Accepted'}], remove: ['flows']});
  assert.equal(updated.rows.find(row => row.id === 'cards').name, original.name);
  assert.equal(updated.rows.find(row => row.id === 'cards').status, 'Accepted');
  assert.ok(!updated.rows.some(row => row.id === 'flows')); assert.equal(updated.revision, 2);
  assert.throws(() => render.applyPatch(spec, {unknown: true}), /Unknown patch/);
});
test('placement preserves the existing sample decisions and viewport behavior', () => {
  for (const [view, mode] of Object.entries({table: 'standalone', cards: 'standalone', form: 'standalone', kanban: 'inline', flow: 'inline'}))
    assert.equal(render.placement(example(view)).mode, mode);
  const table = example('table'); table.rows = table.rows.slice(0, 1);
  assert.equal(render.placement(table).mode, 'inline');
  assert.equal(render.placement(table, 360).mode, 'standalone');
  table.rows.push({id: 'extra', name: 'Extra'}); assert.equal(render.placement(table).mode, 'standalone');
  table.rows = table.rows.slice(0, 1); table.rows[0].name = 'Long description '.repeat(100);
  assert.equal(render.placement(table).mode, 'standalone');
});
test('placement reflects theme control sizes and board limits', () => {
  const normal = context();
  const larger = config.merge(normal.theme, {control: {minHeight: 64, inputHeight: 72}, type: {body: 20}});
  assert.ok(render.placement(example('flow'), undefined, undefined, {theme: larger}).estimatedHeightPx > render.placement(example('flow')).estimatedHeightPx);
  const board = example('kanban'); board.rows = Array.from({length: 7}, (_, index) => ({id: 'r' + index, title: 'Item', stage: 'To review'}));
  assert.equal(render.placement(board).mode, 'standalone');
});
test('explicit presentation overrides placement and writes a spec snapshot', t => {
  const spec = example('table'); spec.presentation = 'inline';
  const {result, out} = page(t, spec, context(), 'auto');
  assert.equal(result.placement.reason, 'Explicit presentation override');
  assert.equal(config.load(out.replace('.html', '.spec.json')).resolvedPresentation.mode, 'inline');
});
test('all appearances and hosts embed the identical runtime and keep draft keys stable', t => {
  const expectedKey = createHash('sha256').update('1.0.0:sample-review:table').digest('hex').slice(0, 24);
  for (const harness of config.harnessIds()) for (const appearance of ['light', 'dark', 'system', 'host']) {
    const {result, html} = page(t, example('table'), context(harness, {appearance}));
    assert.equal(result.delivery, 'embed'); assert.equal(result.rendererHash, render.manifest().sha256);
    assert.equal(block(html, 'spec').stateKey, expectedKey);
    assert.equal(block(html, 'config').appearance, appearance);
    assert.equal(block(html, 'config').rendererHash, render.manifest().sha256);
    assert.ok(!html.includes('<script src='));
    assert.equal(html.split('<script data-dynamic-visual-reply-runtime>\n')[1].split('\n</script>')[0], fs.readFileSync(render.BUNDLE, 'utf8'));
  }
});
test('Codex and Claude handoffs preserve native adapters and different submission copy', t => {
  for (const harness of ['codex', 'claude-inline']) {
    const {result, html} = page(t, example('flow'), context(harness));
    assert.equal(result.handoff.type, harness === 'codex' ? 'contentReference' : 'show_widget');
    assert.equal(block(html, 'config').adapter, harness);
    if (harness === 'codex') assert.match(result.contentReference, /^visualize\{"path":.*\}$/);
    else assert.equal(block(html, 'config').copy.submit.message, 'Add to chat');
  }
});
test('large inline views and byte limits route to the same browser feedback path', t => {
  for (const harness of ['codex', 'claude-inline']) {
    const {result, html} = page(t, example('table'), context(harness), 'auto');
    assert.equal(result.harness, 'browser-local'); assert.equal(result.handoff.type, 'serve');
    assert.match(result.handoff.command, /^node ".*serve\.mjs"/); assert.ok(html.startsWith('<!doctype html>'));
    assert.equal(block(html, 'config').adapter, 'browser-local');
  }
  const limited = context('claude-inline', {placement: {maxInlineBytes: 1000}});
  assert.equal(page(t, example('flow'), limited, 'auto').result.handoff.type, 'serve');
  assert.throws(() => page(t, example('flow'), limited, 'inline'), /exceeds/);
});
test('host detection is a suggestion and explicit harness selection wins', () => {
  assert.equal(config.detectHarness({CLAUDECODE: '1', CODEX_HOME: '/tmp'})[0], 'claude-code');
  assert.equal(config.detectHarness({CODEX_HOME: '/tmp'})[0], 'codex');
  assert.equal(config.detectHarness({})[0], 'static');
  assert.equal(config.resolve({}, {harness: 'browser-local', env: {CLAUDECODE: '1'}, isolated: true}).harness.id, 'browser-local');
});
test('generic and legacy theme names resolve to one readable theme', () => {
  for (const name of ['generic', 'base-web', 'neutral']) {
    const resolved = context('codex', {theme: name});
    assert.equal(resolved.theme.name, 'generic'); assert.equal(resolved.themeSource, config.THEME_FILE);
    assert.deepEqual(config.contrastProblems(resolved.theme), []);
  }
  assert.equal(context('codex', {theme: 'missing-pack'}).theme.name, 'generic');
  assert.ok(!Object.hasOwn(config.load(config.THEME_FILE), 'appearance'));
});
test('older theme packs inherit accent roles from their own palette', () => {
  const theme = config.load(config.THEME_FILE);
  for (const key of ['accentFill', 'onAccentFill', 'accentBorder', 'onSelected']) delete theme.dark[key];
  theme.dark.accent = '#bb99ff';
  for (const key of ['accentFill', 'accentBorder', 'onSelected']) assert.equal(config.completeTheme(theme).dark[key], '#bb99ff');
});
test('new config names take priority while legacy names remain readable', t => {
  const dir = temporary(t), env = {HOME: dir, XDG_CONFIG_HOME: dir};
  const old = path.join(dir, 'visual-response/config.json'), current = path.join(dir, 'dynamic-visual-reply/config.json');
  write(old, {appearance: 'dark'}); assert.equal(config.userConfigPath(env), old);
  write(current, {appearance: 'light'}); assert.equal(config.userConfigPath(env), current);
  assert.equal(config.userConfigPath({...env, VISUAL_RESPONSE_CONFIG: old}), old);
  assert.equal(config.userConfigPath({...env, VISUAL_RESPONSE_CONFIG: old, DYNAMIC_VISUAL_REPLY_CONFIG: current}), current);
  const project = path.join(dir, 'repo'); fs.mkdirSync(path.join(project, '.git'), {recursive: true});
  write(path.join(project, '.visual-response.json'), {appearance: 'dark'});
  assert.equal(config.projectConfigPath(project), path.join(project, '.visual-response.json'));
  write(path.join(project, '.dynamic-visual-reply.json'), {appearance: 'light'});
  const resolved = config.resolve({}, {cwd: project, env, harness: 'browser-local'});
  assert.equal(resolved.appearance, 'light'); assert.equal(resolved.sources.appearance, 'project');
});
test('config layers, appearance overrides, and browser switches preserve user choices', t => {
  const dir = temporary(t), user = path.join(dir, 'user.json'), project = path.join(dir, 'repo');
  write(user, {appearance: 'dark', copy: {badge: 'From user'}}); fs.mkdirSync(path.join(project, '.git'), {recursive: true});
  write(path.join(project, '.dynamic-visual-reply.json'), {appearance: 'light'});
  const env = {HOME: dir, DYNAMIC_VISUAL_REPLY_CONFIG: user};
  const resolved = config.resolve({appearance: 'system'}, {cwd: project, env, harness: 'claude-inline'});
  assert.equal(resolved.appearance, 'system'); assert.equal(resolved.sources.appearance, 'command line');
  assert.equal(resolved.sources['copy.badge'], 'user'); assert.equal(resolved.switch('browser-local').config.copy.badge, 'From user');
  const spec = example('flow'); spec.appearance = 'light';
  const actual = block(page(t, spec, resolved).html, 'config');
  assert.equal(actual.appearance, 'light'); assert.ok(!actual.hostPalette);
});
test('harness appearance defaults and explicit fixed modes are preserved', () => {
  for (const harness of config.harnessIds()) {
    assert.equal(context(harness).appearance, harness === 'claude-inline' ? 'host' : 'system');
    for (const appearance of ['light', 'dark']) assert.equal(context(harness, {appearance}).appearance, appearance);
  }
});
test('invalid settings, removed delivery settings and disabled views fail explicitly', t => {
  for (const cli of [{colour: 'blue'}, {placement: {inlineLimits: {table: 0}}}, {feedback: {messageFormat: 'yaml'}}, {delivery: {rendererUrl: 'https://example.com'}}])
    assert.throws(() => config.resolve(cli, {isolated: true}), /invalid/);
  assert.throws(() => page(t, example('flow'), context('codex', {views: {enabled: ['table']}})), /disabled/);
});
test('runtime configuration only sends copy and feedback overrides', t => {
  for (const messageFormat of ['json', 'summary']) {
    const actual = block(page(t, example('flow'), context('codex', {feedback: {messageFormat}, copy: {badge: 'Review'}})).html, 'config');
    assert.deepEqual(actual.copy, {badge: 'Review'});
    assert.deepEqual(actual.feedback, messageFormat === 'json' ? undefined : {messageFormat: 'summary'});
  }
  assert.match(config.cssVariables(context().theme, 'system'), /prefers-color-scheme: dark/);
});
test('new hash feedback and legacy version feedback share schemaVersion 1', () => {
  const feedback = {schemaVersion: 1, viewId: 'test', view: 'form', revision: 1, selectedIds: [], reviewedIds: [], items: [], fields: [], comment: ''};
  const schema = config.load(path.join(config.SCHEMA_DIR, 'feedback.schema.json'));
  for (const source of [{rendererHash: render.manifest().sha256}, {rendererVersion: '1.3.0'}, {}])
    assert.deepEqual(config.schemaErrors({...feedback, source}, schema), []);
  assert.ok(config.schemaErrors({...feedback, source: {rendererHash: 'bad'}}, schema).length);
});
test('doctor checks every harness locally without implying native bridge verification', t => {
  const dir = temporary(t), user = path.join(dir, 'settings.json'); write(user, {});
  for (const harness of config.harnessIds()) {
    const result = report({harness}, {HOME: dir, DYNAMIC_VISUAL_REPLY_CONFIG: user});
    assert.equal(result.ok, true); assert.equal(result.delivery.mode, 'embed'); assert.equal(result.harness.runtimeVerified, false);
  }
});
test('packaged helper runs with no npm install and no Python executable on PATH', t => {
  const dir = temporary(t), skill = path.join(dir, 'skill');
  fs.cpSync(config.ROOT, skill, {recursive: true, filter: file => !file.split(path.sep).some(part => ['node_modules', '__pycache__'].includes(part))});
  const out = path.join(dir, 'result.html');
  const result = spawnSync(process.execPath, [path.join(skill, 'scripts/render.mjs'), '--spec', path.join(skill, 'assets/examples/flow.json'),
    '--out', out, '--harness', 'codex'], {cwd: dir, env: {PATH: dir, HOME: dir}, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).handoff.type, 'contentReference');
  assert.ok(fs.existsSync(out));
});
test('CLI errors are structured and do not produce a view', t => {
  const dir = temporary(t);
  for (const args of [['--unknown'], ['--spec', path.join(config.ROOT, 'assets/examples/flow.json'), '--out', path.join(dir, 'bad.html'), '--format', 'wrong']]) {
    const result = spawnSync(process.execPath, [path.join(config.ROOT, 'scripts/render.mjs'), ...args], {encoding: 'utf8'});
    assert.equal(result.status, 2); assert.equal(typeof JSON.parse(result.stderr).error, 'string');
  }
  assert.ok(!fs.existsSync(path.join(dir, 'bad.html')));
});
test('local server handles idle connections and saves the exact feedback envelope', async t => {
  const {out} = page(t, example('table'), context('browser-local'), 'standalone');
  const {server, feedback} = createPreviewServer(out);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port, idle = net.connect(server.address().port, '127.0.0.1');
  await once(idle, 'connect');
  t.after(() => { idle.destroy(); server.closeAllConnections(); server.close(); });
  assert.deepEqual(await (await fetch(url + '/api/feedback', {signal: AbortSignal.timeout(2000)})).json(), {feedback: null});
  const response = await fetch(url); assert.match(await response.text(), /window.dynamicVisualReplySave/);
  const payload = {message: 'Continue with these instructions', feedback: {schemaVersion: 1, viewId: 'sample', comment: 'Keep 🦉 and quotes " intact'}};
  const saved = await fetch(url + '/api/feedback', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: url}, body: JSON.stringify(payload)});
  assert.deepEqual(await saved.json(), {saved: true, path: feedback});
  assert.deepEqual(config.load(feedback), payload);
  assert.deepEqual(await (await fetch(url + '/api/feedback')).json(), payload);
  for (const [headers, body, status] of [
    [{'Content-Type': 'application/json', Origin: 'https://elsewhere.invalid'}, JSON.stringify(payload), 403],
    [{'Content-Type': 'text/plain'}, JSON.stringify(payload), 400],
    [{'Content-Type': 'application/json'}, '{"feedback":{"schemaVersion":true}}', 400],
    [{'Content-Type': 'application/json'}, '{invalid}', 400],
    [{'Content-Type': 'application/json'}, JSON.stringify({feedback: {schemaVersion: 1}, comment: 'x'.repeat(1_000_000)}), 400],
  ]) {
    const failed = await fetch(url + '/api/feedback', {method: 'POST', headers, body});
    assert.equal(failed.status, status);
    assert.deepEqual(config.load(feedback), payload, 'Failed submission must preserve the last receipt');
  }
  assert.ok(!fs.readdirSync(path.dirname(feedback)).some(name => name.endsWith('.tmp')));
});
