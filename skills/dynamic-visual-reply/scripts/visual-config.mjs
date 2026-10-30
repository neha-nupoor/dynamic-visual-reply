/** Settings, theme resolution and the JSON Schema subset used by the skill. No runtime packages. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual, parseArgs} from 'node:util';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_DIR = path.join(ROOT, 'config');
export const SCHEMA_DIR = path.join(CONFIG_DIR, 'schema');
export const THEME_FILE = path.join(CONFIG_DIR, 'theme.json');
export const PROJECT_FILE = '.dynamic-visual-reply.json';
export const HARNESSES = {
  codex: {label: 'Codex / ChatGPT widget host', adapter: 'codex'},
  'claude-inline': {label: 'Claude inline widget', adapter: 'claude-inline'},
  'claude-code': {label: 'Claude Code terminal', adapter: 'browser-local'},
  'browser-local': {label: 'Local browser', adapter: 'browser-local'},
  static: {label: 'Static HTML', adapter: null},
};
export const CLAUDE_CONFIG = {
  appearance: 'host',
  placement: {viewport: {width: 680, height: 900}, maxSpecBytes: 24000},
  feedback: {messageFormat: 'summary'},
  copy: {submit: {message: 'Add to chat'}, feedbackSubmit: {message: 'Add feedback to chat'},
    status: {submitted: 'Added to your message box. Press Enter to send it.'}},
};
export const HOST_PALETTE = {
  canvas: '--surface-0', surface: '--surface-2', text: '--text-primary',
  muted: '--text-secondary', divider: '--border', controlBorder: '--border-strong',
  accent: '--fill-accent', onAccent: '--on-accent', selected: '--bg-accent',
  hover: '--surface-1', success: '--text-success', warning: '--text-warning', error: '--text-danger',
};
export const load = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const existsFile = file => { try { return fs.statSync(file).isFile(); } catch { return false; } };
const isDir = file => { try { return fs.statSync(file).isDirectory(); } catch { return false; } };
const expandHome = (file, env = process.env) => file === '~' || file.startsWith('~/')
  ? path.join(env.HOME || env.USERPROFILE || os.homedir(), file.slice(2)) : file;

export function merge(base, override) {
  if (!object(base) || !object(override)) return override;
  const entries = new Map(Object.entries(base));
  for (const [key, value] of Object.entries(override))
    entries.set(key, object(value) && object(base[key]) ? merge(base[key], value) : value);
  return Object.fromEntries(entries);
}
function leaves(value, prefix = '') {
  if (object(value) && Object.keys(value).length)
    return Object.entries(value).filter(([key]) => key !== '$schema')
      .flatMap(([key, item]) => leaves(item, prefix ? prefix + '.' + key : key));
  return [[prefix, value]];
}
export function diff(value, base) {
  if (!object(value) || !object(base)) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (!Object.hasOwn(base, key)) return [[key, item]];
    if (object(item) && object(base[key])) {
      const nested = diff(item, base[key]);
      return Object.keys(nested).length ? [[key, nested]] : [];
    }
    return isDeepStrictEqual(item, base[key]) ? [] : [[key, item]];
  }));
}
const typeOk = (value, expected) => (Array.isArray(expected) ? expected : [expected]).some(type => ({
  object: () => object(value), array: () => Array.isArray(value), string: () => typeof value === 'string',
  boolean: () => typeof value === 'boolean', integer: () => Number.isInteger(value),
  number: () => typeof value === 'number' && Number.isFinite(value), null: () => value === null,
})[type]?.());
const canonical = value => JSON.stringify(object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))]))
  : Array.isArray(value) ? value.map(item => JSON.parse(canonical(item))) : value);

export function schemaErrors(instance, schema, root = schema, baseDir = SCHEMA_DIR, location = '$') {
  if (schema.$ref) {
    const [target, pointer = ''] = schema.$ref.split('#');
    const document = target ? load(path.join(baseDir, target)) : root;
    const node = pointer.split('/').filter(Boolean).reduce((value, key) => value[key.replace(/~1/g, '/').replace(/~0/g, '~')], document);
    return schemaErrors(instance, node, document, baseDir, location);
  }
  const errors = [], sub = (part, value = instance, at = location) => schemaErrors(value, part, root, baseDir, at);
  if (schema.type && !typeOk(instance, schema.type)) return [location + ': expected ' + JSON.stringify(schema.type)];
  if (Object.hasOwn(schema, 'const') && !isDeepStrictEqual(instance, schema.const)) errors.push(location + ': must equal ' + JSON.stringify(schema.const));
  if (schema.enum && !schema.enum.some(value => isDeepStrictEqual(instance, value))) errors.push(location + ': must be one of ' + JSON.stringify(schema.enum));
  if (schema.not && !sub(schema.not).length) errors.push(location + ': matches a forbidden value');
  for (const part of schema.allOf || []) errors.push(...sub(part));
  if (schema.anyOf && schema.anyOf.every(part => sub(part).length)) errors.push(location + ': matches none of the allowed shapes');
  if (schema.if) {
    const branch = !sub(schema.if).length ? schema.then : schema.else;
    if (branch) errors.push(...sub(branch));
  }
  if (typeof instance === 'string') {
    const length = [...instance].length;
    if (length < (schema.minLength || 0)) errors.push(location + ': too short');
    if (schema.maxLength !== undefined && length > schema.maxLength) errors.push(location + ': longer than ' + schema.maxLength);
    if (schema.pattern && !new RegExp(schema.pattern).test(instance)) errors.push(location + ': does not match ' + schema.pattern);
  }
  if (typeOk(instance, 'number')) {
    if (schema.minimum !== undefined && instance < schema.minimum) errors.push(location + ': below ' + schema.minimum);
    if (schema.maximum !== undefined && instance > schema.maximum) errors.push(location + ': above ' + schema.maximum);
    if (schema.exclusiveMinimum !== undefined && instance <= schema.exclusiveMinimum) errors.push(location + ': must exceed ' + schema.exclusiveMinimum);
  }
  if (Array.isArray(instance)) {
    if (instance.length < (schema.minItems || 0)) errors.push(location + ': needs at least ' + schema.minItems + ' items');
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) errors.push(location + ': allows at most ' + schema.maxItems + ' items');
    if (schema.uniqueItems && new Set(instance.map(canonical)).size !== instance.length) errors.push(location + ': items must be unique');
    if (schema.items) instance.forEach((item, index) => errors.push(...sub(schema.items, item, location + '[' + index + ']')));
  }
  if (object(instance)) {
    for (const key of schema.required || []) if (!Object.hasOwn(instance, key)) errors.push(location + ': missing ' + key);
    for (const [key, value] of Object.entries(instance)) {
      if (Object.hasOwn(schema.properties || {}, key)) errors.push(...sub(schema.properties[key], value, location + '.' + key));
      else if (schema.additionalProperties === false) errors.push(location + ': unknown key ' + key);
      else if (object(schema.additionalProperties)) errors.push(...sub(schema.additionalProperties, value, location + '.' + key));
    }
  }
  return errors;
}
export function checkSchema(instance, name, label) {
  const errors = schemaErrors(instance, load(path.join(SCHEMA_DIR, name + '.schema.json')));
  requireValue(!errors.length, label + ' is invalid: ' + errors.slice(0, 5).join('; '));
}

export function skillDirs(env = process.env) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const extra = (env.DYNAMIC_VISUAL_REPLY_THEME_PATH || env.VISUAL_RESPONSE_THEME_PATH || '').split(path.delimiter).filter(Boolean);
  return [...extra, path.dirname(ROOT), ...['.agents', '.claude', '.codex', '.cursor'].map(name => path.join(home, name, 'skills'))];
}
const themeFile = folder => [path.join(folder, 'theme.json'), path.join(folder, 'assets/theme.json')].find(existsFile);
export function findTheme(reference, env = process.env, baseDir) {
  if (object(reference)) return [reference, 'inline'];
  if (['generic', 'base-web', 'neutral'].includes(reference)) return [load(THEME_FILE), THEME_FILE];
  let file = expandHome(reference, env);
  if (!path.isAbsolute(file) && baseDir && (reference.includes('/') || reference.endsWith('.json'))) file = path.join(baseDir, file);
  if (file.endsWith('.json') && existsFile(file)) return [load(file), file];
  if (isDir(file) && themeFile(file)) return [load(themeFile(file)), themeFile(file)];
  if (/^[a-z0-9][a-z0-9-]*$/.test(reference)) {
    for (const folder of skillDirs(env)) {
      const found = themeFile(path.join(folder, reference));
      if (found) return [load(found), found];
    }
  }
  return null;
}
export function completePalette(palette) {
  return {...palette, accentFill: palette.accentFill ?? palette.accent, onAccentFill: palette.onAccentFill ?? palette.onAccent,
    accentBorder: palette.accentBorder ?? palette.accent, onSelected: palette.onSelected ?? palette.accent};
}
export function completeTheme(theme) {
  const result = merge(load(THEME_FILE), theme);
  delete result.motion;
  for (const mode of ['light', 'dark']) result[mode] = {...result[mode], ...completePalette(theme[mode])};
  return result;
}
function luminance(color) {
  const values = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values.reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
export function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + .05) / (values[0] + .05);
}
export function contrastProblems(theme) {
  const problems = [];
  for (const mode of ['light', 'dark']) {
    const palette = completePalette(theme[mode]);
    const pairs = ['canvas', 'surface', 'selected', 'hover'].flatMap(bg => ['text', 'muted'].map(fg => [fg, bg, 4.5]));
    pairs.push(...['canvas', 'surface', 'hover'].map(bg => ['accent', bg, 4.5]), ['onSelected', 'selected', 4.5],
      ['onAccent', 'accent', 4.5], ['onAccentFill', 'accentFill', 4.5], ['controlBorder', 'surface', 3], ['accentBorder', 'surface', 3]);
    for (const [fg, bg, minimum] of pairs) {
      const ratio = contrast(palette[fg], palette[bg]);
      if (ratio < minimum) problems.push(mode + ': ' + fg + ' on ' + bg + ' is ' + ratio.toFixed(2) + ':1, needs ' + minimum + ':1');
    }
  }
  return problems;
}
export function cssVariables(theme, appearance) {
  const block = palette => Object.entries(palette).map(([role, value]) => '  --vr-' + role.replace(/[A-Z]/g, match => '-' + match.toLowerCase()) + ': ' + value + ';').join('\n');
  const shared = '  --vr-font: ' + theme.fontFamily + ';\n  --vr-radius-control: ' + theme.radius.control + 'px;\n' +
    '  --vr-radius-surface: ' + theme.radius.surface + 'px;\n  --vr-control-height: ' + theme.control.minHeight + 'px;';
  appearance ||= theme.appearance || 'light';
  const first = appearance === 'dark' ? 'dark' : 'light';
  let css = ':root {\n' + shared + '\n' + block(completePalette(theme[first])) + '\n}\n';
  if (['system', 'host'].includes(appearance)) {
    const dark = block(completePalette(theme.dark));
    css += '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {\n' + dark + '\n} }\n:root[data-theme="dark"] {\n' + dark + '\n}\n';
  }
  return css;
}
export const harnessIds = () => Object.keys(HARNESSES);
export function loadHarness(id) {
  requireValue(Object.hasOwn(HARNESSES, id), 'Unknown harness ' + JSON.stringify(id) + '; available: ' + harnessIds().join(', '));
  return {id, ...HARNESSES[id]};
}
export function detectHarness(env = process.env) {
  if (env.CLAUDECODE === '1') return ['claude-code', 'Claude Code uses the local browser; choose claude-inline only when show_widget is available'];
  const id = ['CODEX_SANDBOX', 'CODEX_SANDBOX_NETWORK_DISABLED', 'CODEX_HOME'].some(key => Object.hasOwn(env, key)) ? 'codex' : 'static';
  return [id, id === 'static' ? 'No harness markers found; choose --harness explicitly when needed' : 'Suggested by environment markers; runtime bridge not verified'];
}
export function userConfigPath(env = process.env) {
  const override = env.DYNAMIC_VISUAL_REPLY_CONFIG || env.VISUAL_RESPONSE_CONFIG;
  if (override) return expandHome(override, env);
  const base = env.XDG_CONFIG_HOME || path.join(env.HOME || env.USERPROFILE || os.homedir(), '.config');
  const current = path.join(base, 'dynamic-visual-reply/config.json'), legacy = path.join(base, 'visual-response/config.json');
  return fs.existsSync(current) || !fs.existsSync(legacy) ? current : legacy;
}
export function projectConfigPath(start) {
  for (let folder = path.resolve(start);;) {
    for (const name of [PROJECT_FILE, '.visual-response.json']) if (existsFile(path.join(folder, name))) return path.join(folder, name);
    const parent = path.dirname(folder);
    if (fs.existsSync(path.join(folder, '.git')) || parent === folder) return null;
    folder = parent;
  }
}
export class Context {
  constructor(values) { Object.assign(this, values); }
  switch(harness) { return resolve(this.inputs.cli, {...this.inputs, harness}); }
  get appearance() { return this.config.appearance || (this.harness.id === 'claude-inline' ? 'host' : 'system'); }
}
export function resolve(cli = {}, {harness, cwd, env = process.env, isolated = false} = {}) {
  cli = Object.fromEntries(Object.entries(cli).filter(([, value]) => value !== null && value !== undefined));
  const layers = [['defaults', path.join(CONFIG_DIR, 'defaults.json'), load(path.join(CONFIG_DIR, 'defaults.json'))]];
  if (!isolated) {
    const user = userConfigPath(env), project = projectConfigPath(cwd || process.cwd());
    if (existsFile(user)) layers.push(['user', user, load(user)]);
    if (project) layers.push(['project', project, load(project)]);
  }
  if (Object.keys(cli).length) layers.push(['command line', 'flags', cli]);
  for (const [name, source, data] of layers) checkSchema(data, 'config', name + ' config (' + source + ')');
  let chosen = harness || cli.harness, reason;
  if (!chosen) for (const [, , data] of layers) chosen = data.harness || chosen;
  if (!chosen || chosen === 'auto') [chosen, reason] = isolated ? ['codex', 'Isolated default'] : detectHarness(env);
  else reason = harness || cli.harness ? 'Requested explicitly' : 'Set in configuration';
  const host = loadHarness(chosen);
  if (chosen === 'claude-inline') layers.splice(1, 0, ['host:claude-inline', 'built-in host defaults', CLAUDE_CONFIG]);
  let config = {}; const sources = {};
  for (const [name, , data] of layers) {
    config = merge(config, data);
    for (const [leaf] of leaves(data)) Object.defineProperty(sources, leaf, {value: name, enumerable: true, configurable: true});
  }
  delete config.$schema;
  const project = layers.find(([name]) => name === 'project');
  const baseDir = project ? path.dirname(project[1]) : cwd || process.cwd();
  const found = findTheme(config.theme, env, baseDir) || findTheme(config.themeFallback || 'generic', env, baseDir);
  requireValue(found, 'Theme ' + JSON.stringify(config.theme) + ' was not found and the fallback is missing');
  const [theme, themeSource] = found;
  checkSchema(theme, 'theme', 'Theme (' + themeSource + ')');
  return new Context({config, theme: completeTheme(theme), harness: host, harnessReason: reason, themeSource,
    layers: layers.map(([name, source]) => [name, source]), sources, inputs: {cli, cwd, env, isolated}});
}
export function parseCli(options, args = process.argv.slice(2), allowPositionals = false) {
  return parseArgs({args, options: {...options, help: {type: 'boolean', short: 'h'}}, allowPositionals, strict: true});
}
export function isMain(url) {
  if (!process.argv[1] || process.argv[1] === '-') return false;
  try { return url === pathToFileURL(fs.realpathSync(process.argv[1])).href; }
  catch { return false; }
}
export async function runCli(fn) {
  try { await fn(); } catch (error) { process.stderr.write(JSON.stringify({error: error.message}) + '\n'); process.exitCode = 2; }
}
