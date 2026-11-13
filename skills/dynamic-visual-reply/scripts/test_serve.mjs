// Process-level checks for serve.mjs flags: node --test scripts/test_serve.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SERVE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'serve.mjs');
// Same envelope the browser adapter posts through window.dynamicVisualReplySave.
const payload = {message: '{"request":"go"}', feedback: {schemaVersion: 1}, title: 'Review'};

function start(t, ...flags) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvr-serve-'));
  const html = path.join(dir, 'view.html');
  fs.writeFileSync(html, '<!doctype html><html><body><script data-dynamic-visual-reply-runtime></script></body></html>');
  const child = spawn(process.execPath, [SERVE, html, '--port', '0', ...flags], {stdio: ['ignore', 'pipe', 'pipe']});
  const exited = once(child, 'exit');
  t.after(() => { if (child.exitCode === null) child.kill(); fs.rmSync(dir, {recursive: true, force: true}); });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  const lines = () => stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const ready = new Promise((resolve, reject) => {
    const check = () => { if (stdout.includes('\n')) { child.stdout.off('data', check); resolve(lines()[0]); } };
    child.stdout.on('data', check); child.once('exit', code => reject(new Error('serve exited early: ' + code)));
  });
  return {child, exited, ready, lines, dir};
}
const submit = url => fetch(url + 'api/feedback', {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(payload), signal: AbortSignal.timeout(5000)});

test('--once prints a submitted event and exits 0 after the first saved feedback', async t => {
  const {exited, ready, lines} = start(t, '--once');
  const {url, feedback, once: flag} = await ready;
  assert.equal(flag, true);
  const response = await submit(url);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {saved: true, path: feedback});
  const [code] = await exited;
  assert.equal(code, 0);
  assert.deepEqual(lines().at(-1), {event: 'submitted', feedback});
  assert.deepEqual(JSON.parse(fs.readFileSync(feedback, 'utf8')), payload);
});

test('--once ignores rejected submissions and keeps serving', async t => {
  const {child, ready} = start(t, '--once');
  const {url} = await ready;
  const bad = await fetch(url + 'api/feedback', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: '{"feedback":{"schemaVersion":2}}'});
  assert.equal(bad.status, 400);
  assert.equal((await submit(url)).status, 200);
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
});

test('--timeout exits non-zero with a timeout event when nothing is submitted', async t => {
  const {exited, ready, lines} = start(t, '--once', '--timeout', '0.3');
  const {feedback} = await ready;
  const [code] = await exited;
  assert.equal(code, 3);
  assert.deepEqual(lines().at(-1), {event: 'timeout', feedback, seconds: 0.3});
  assert.ok(!fs.existsSync(feedback));
});

test('default mode keeps serving after a submission', async t => {
  const {child, ready, lines} = start(t);
  const {url, once: flag} = await ready;
  assert.equal(flag, undefined);
  assert.equal((await submit(url)).status, 200);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(child.exitCode, null);
  assert.equal(lines().length, 1);
});
