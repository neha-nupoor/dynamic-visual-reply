#!/usr/bin/env node
/** Check local configuration, renderer integrity, theme contrast and feedback routing. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as config from './visual-config.mjs';

export function report(args = {}, env = process.env) {
  const context = config.resolve({harness: args.harness, theme: args.theme}, {env});
  const harness = context.harness, problems = [], notes = [], [detected, detectedReason] = config.detectHarness(env);
  const info = config.load(path.join(config.ROOT, 'assets/renderer/dist/manifest.json'));
  const bundle = fs.readFileSync(path.join(config.ROOT, 'assets/renderer/dist/renderer.js'));
  if (createHash('sha256').update(bundle).digest('hex') !== info.sha256) problems.push('renderer.js does not match manifest.json; rebuild the bundle.');
  const contrast = config.contrastProblems(context.theme);
  problems.push(...contrast.map(problem => 'Theme contrast: ' + problem));
  if (typeof context.config.theme === 'string' && !['generic', 'base-web', 'neutral'].includes(context.config.theme) && context.theme.name !== context.config.theme)
    notes.push('Theme ' + JSON.stringify(context.config.theme) + ' was not found; using fallback ' + JSON.stringify(context.theme.name) + '. Install that theme pack beside this skill or point theme at its folder.');
  const submit = {
    codex: 'Inline uses window.openai.sendFollowUpMessage; larger views save feedback through serve.mjs.',
    'claude-inline': 'Inline adds feedback to the message box; press Enter to send. Larger views use serve.mjs.',
    'browser-local': 'serve.mjs saves <view>.feedback.json; ask the agent to read it.',
    'claude-code': 'serve.mjs saves <view>.feedback.json; ask the agent to read it.',
    static: 'Copy or export feedback and paste it into chat.',
  };
  notes.push('These checks verify files and settings, not the host rendering or submission APIs. Test those in the rendered view.');
  return {ok: !problems.length,
    harness: {id: harness.id, label: harness.label, reason: context.harnessReason, detected, detectedReason, runtimeVerified: false, feedback: submit[harness.id]},
    theme: {name: context.theme.name, source: context.themeSource, appearance: context.appearance, contrastOk: !contrast.length},
    delivery: {mode: 'embed', bundleHash: info.sha256, bundleBytes: info.bytes}, configLayers: context.layers,
    userConfig: config.userConfigPath(env), availableHarnesses: Object.fromEntries(Object.entries(config.HARNESSES).map(([id, host]) => [id, host.label])),
    problems, notes};
}
export function main() {
  const {values: args} = config.parseCli({harness: {type: 'string'}, theme: {type: 'string'}});
  if (args.help) { console.log('Usage: node doctor.mjs [--harness <id>] [--theme <pack>]'); return; }
  try {
    const result = report(args); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
  } catch (error) { console.log(JSON.stringify({ok: false, problems: [error.message]}, null, 2)); process.exitCode = 2; }
}
if (config.isMain(import.meta.url)) config.runCli(main);
