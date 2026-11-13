#!/usr/bin/env node
/** Optional bounded policy-comprehension evaluation; no tools or side effects in the child CLI. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {route, help} from '../skills/dynamic-visual-reply/scripts/route.mjs';
import {parseCli, requireValue, runCli} from '../skills/dynamic-visual-reply/scripts/visual-config.mjs';

runCli(() => {
  const {values: args} = parseCli({harness: {type: 'string'}, out: {type: 'string'}});
  requireValue(args.harness === 'codex' && args.out, '--harness codex --out <report.json> required');
  const cases = JSON.parse(fs.readFileSync(new URL('./live_routing_cases.json', import.meta.url)));
  const skill = fs.readFileSync(new URL('../skills/response-design/SKILL.md', import.meta.url), 'utf8');
  const prompt = 'This is an isolated response-policy comprehension test. Do not perform the tasks or call tools.\n' + skill + '\n' + help() +
    '\nFor each request, output its id and a facts object usable by route.mjs. Classify only supplied facts. Do not add a preferred view unless the user explicitly requests it. Return JSON only: {"cases":[{"id":"...","facts":{...}}]}.\n' +
    JSON.stringify(cases.map(({id, prompt}) => ({id, request: prompt})));
  const out = path.resolve(args.out), scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'response-design-live-'));
  fs.mkdirSync(path.dirname(out), {recursive: true});
  try {
    const last = path.join(scratch, 'last.json');
    const flags = ['exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '--sandbox', 'read-only', '-c', 'project_doc_max_bytes=0', '-C', scratch, '--output-last-message', last, '-'];
    const result = spawnSync('codex', flags, {cwd: scratch, input: prompt, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024});
    const report = {harness: args.harness, cases: cases.length, kind: 'isolated-policy-comprehension', discoveryTested: false, nativeSubmissionTested: false};
    if (result.status !== 0 || result.error) {
      let detail = result.error?.message || (result.stderr || result.stdout).slice(-1500);
      try { detail = JSON.parse(result.stdout).result || detail; } catch {}
      Object.assign(report, {status: 'unavailable', error: detail});
    } else {
      const data = JSON.parse(fs.readFileSync(last, 'utf8'));
      requireValue(Array.isArray(data.cases), 'Missing cases in model response');
      const results = cases.map(c => {
        const candidates = data.cases.filter(row => row.id === c.id);
        let actual, error;
        try { requireValue(candidates.length === 1, 'Missing or duplicate case'); actual = route(candidates[0].facts); } catch (e) { error = e.message; }
        const pass = !error && Object.entries(c.expected).every(([key, value]) => actual[key] === value);
        return {id: c.id, pass, facts: candidates[0]?.facts, expected: c.expected, actual, ...(error ? {error} : {})};
      });
      Object.assign(report, {status: results.every(r => r.pass) ? 'passed' : 'failed', passed: results.filter(r => r.pass).length, results});
    }
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({...report, results: undefined, report: out}));
    if (report.status !== 'passed') process.exitCode = 1;
  } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
});
