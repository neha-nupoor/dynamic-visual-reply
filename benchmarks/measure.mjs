#!/usr/bin/env node
/** Export aggregate telemetry and public spec sizes, never conversation contents. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {values: args} = parseArgs({options: {'session-log': {type: 'string'}, out: {type: 'string'}}});
if (!args['session-log']) throw new Error('Usage: node benchmarks/measure.mjs --session-log <Codex rollout.jsonl> [--out docs/benchmark.json]');
const rows = fs.readFileSync(args['session-log'], 'utf8').trim().split('\n').map(JSON.parse);
const records = rows.filter(row => row.type === 'token_usage_record');
if (!records.length) throw new Error('No token_usage_record telemetry found');
const turnIds = [...new Set(records.map(row => row.payload.turn_id))];
const fields = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
const turns = turnIds.map((turn, index) => {
  const calls = [...new Map(records.filter(row => row.payload.turn_id === turn).map(row => [row.payload.response_id, row])).values()];
  const usage = Object.fromEntries(fields.map(field => [field, calls.reduce((sum, row) => sum + (row.payload.usage[field] || 0), 0)]));
  for (const field of fields) if (usage[field] !== (calls.at(-1).payload.turn_token_usage[field] || 0))
    throw new Error('Usage sum differs from cumulative turn usage: ' + field);
  return {phase: index === 0 ? 'author specs and initial presentation attempt' : index === 1 ? 'correct inline presentation' : 'follow-up interaction ' + (index - 1),
    apiCalls: calls.length, recordedAt: calls.at(-1).timestamp, usage: {...usage, uncached_input_tokens: usage.input_tokens - usage.cached_input_tokens}};
});
const metadata = rows.find(row => row.type === 'turn_context')?.payload;
const usage = Object.fromEntries([...fields, 'uncached_input_tokens'].map(field => [field, turns.reduce((sum, turn) => sum + turn.usage[field], 0)]));
const views = ['table', 'cards', 'form', 'kanban', 'flow'].map(view => {
  const raw = fs.readFileSync(path.join(repo, 'docs/examples', view + '.json'));
  return {view, specBytes: raw.length, compactSpecBytes: Buffer.byteLength(JSON.stringify(JSON.parse(raw))), sha256: createHash('sha256').update(raw).digest('hex')};
});
const bundle = JSON.parse(fs.readFileSync(path.join(repo, 'skills/dynamic-visual-reply/assets/renderer/dist/manifest.json'), 'utf8'));
const result = {measuredAt: turns.at(-1).recordedAt, model: metadata?.model || null, reasoningEffort: metadata?.effort || null,
  scope: 'Dedicated synthetic Codex demo: spec authoring, initial display attempt, display-reference correction, and any recorded follow-up interactions. Excludes skill development/migration.',
  widgets: views.length, apiCalls: turns.reduce((sum, turn) => sum + turn.apiCalls, 0), usage, turns,
  specAuthoringTurnOutputTokens: turns[0].usage.output_tokens,
  currentRendererBuild: {bytes: bundle.bytes, sha256: bundle.sha256, modelRegenerated: false}, views,
  limitations: ['One run, not a statistical performance or usability study.',
    'Cached input is included in input; reasoning output is included in output. Do not add them twice.',
    'Input includes harness instructions, tool definitions, skill reads and repeated context. Output includes reasoning, tool arguments and captions.',
    'No controlled prose or handwritten-HTML baseline was measured; no percentage token or usability improvement is claimed.',
    'Codex uses file references; Claude inline string delivery includes the renderer and will have different token costs.']};
const out = path.resolve(args.out || path.join(repo, 'docs/benchmark.json'));
fs.mkdirSync(path.dirname(out), {recursive: true}); fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({out, widgets: result.widgets, turns: result.turns.length, usage}));
