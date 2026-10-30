#!/usr/bin/env node
/** Hydrate the shared renderer from a JSON spec, using Node built-ins only. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as config from './visual-config.mjs';
const {ROOT, load, requireValue, object} = config;
export {ROOT, load};
export const VIEWS = ['table', 'cards', 'form', 'kanban', 'flow'];
export const BUNDLE = path.join(ROOT, 'assets/renderer/dist/renderer.js');
export const MANIFEST = path.join(ROOT, 'assets/renderer/dist/manifest.json');
const bytes = value => Buffer.byteLength(value, 'utf8');
const length = value => [...String(value)].length;
const sum = values => values.reduce((total, value) => total + value, 0);
// Preserve the existing placement estimates, including Python's ties-to-even rounding.
const round = value => value % 1 === .5 ? Math.floor(value) + Math.floor(value) % 2 : Math.round(value);

export function identifiers(items, field, kind) {
  requireValue(Array.isArray(items), kind + ' must be an array');
  const seen = new Set();
  for (const item of items) {
    requireValue(object(item), 'Each ' + kind + ' item must be an object');
    const value = item[field];
    requireValue(typeof value === 'string' && value.trim(), kind + '.' + field + ' must be a nonempty string');
    requireValue(!seen.has(value), 'Duplicate ' + kind + ' identifier: ' + value);
    seen.add(value);
  }
  return seen;
}
export function validate(spec) {
  config.checkSchema(spec, 'spec', 'Spec');
  if (['table', 'cards', 'kanban'].includes(spec.view) && spec.rows) identifiers(spec.rows, 'id', 'rows');
  if (spec.view === 'table') identifiers(spec.columns, 'key', 'columns');
  if (spec.view === 'kanban') {
    const stages = spec.stages || ['To review', 'In progress', 'Done'];
    for (const row of spec.rows || []) requireValue(stages.includes(row.stage ?? stages[0]), 'Invalid stage in row ' + row.id);
  }
  if (spec.view === 'form') {
    identifiers(spec.fields, 'id', 'fields');
    for (const field of spec.fields) if (['select', 'multiselect'].includes(field.type)) {
      const ids = identifiers(field.options, 'id', 'options');
      if (field.type === 'select') requireValue(!field.value || ids.has(field.value), 'Selected value must be an option ID');
    }
  }
  if (spec.view === 'flow') identifiers(spec.nodes, 'id', 'nodes');
  return spec;
}
/** RFC-style quoted delimited records, including escaped quotes and embedded newlines. */
export function delimitedRows(text, delimiter = ',') {
  const records = []; let row = [], cell = '', quoted = false, recordStarted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char !== '\n' && char !== '\r') recordStarted = true;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else if (quoted || cell === '') quoted = !quoted;
      else cell += char;
    } else if (!quoted && char === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      if (recordStarted) records.push([...row, cell]);
      row = []; cell = ''; recordStarted = false;
    } else cell += char;
  }
  requireValue(!quoted, 'Unclosed quoted field in delimited data');
  if (recordStarted) records.push([...row, cell]);
  const headers = records.shift() || [];
  return records.map(values => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? null])));
}
export function resolveData(spec, source) {
  if (!Object.hasOwn(spec, 'dataFile')) return spec;
  requireValue(['table', 'cards', 'kanban'].includes(spec.view), 'dataFile is supported for record views');
  requireValue(!Object.hasOwn(spec, 'rows'), 'Use rows or dataFile, not both');
  const file = path.resolve(path.dirname(source), spec.dataFile); delete spec.dataFile;
  const extension = path.extname(file).toLowerCase();
  let rows;
  if (['.csv', '.tsv'].includes(extension)) {
    rows = delimitedRows(fs.readFileSync(file, 'utf8'), extension === '.tsv' ? '\t' : ',');
    for (const row of rows) for (const column of spec.columns || []) {
      if (column.type === 'number' && (row[column.key] ?? '') !== '') {
        const text = String(row[column.key]).trim().replace(/(?<=\d)_(?=\d)/g, '');
        const number = Number(text);
        requireValue(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) && Number.isFinite(number), 'Non-numeric value in ' + column.key);
        row[column.key] = number;
      }
    }
  } else {
    const data = load(file);
    rows = Array.isArray(data) ? data : object(data) ? data.rows : null;
  }
  spec.rows = rows;
  return spec;
}
export function applyPatch(spec, patch) {
  requireValue(object(patch), 'Patch must be an object');
  const allowed = ['upsert', 'remove', 'title', 'context', 'revision', 'fields', 'nodes'];
  requireValue(Object.keys(patch).every(key => allowed.includes(key)), 'Unknown patch operation');
  if (Object.hasOwn(patch, 'upsert') || Object.hasOwn(patch, 'remove')) {
    requireValue(['table', 'cards', 'kanban'].includes(spec.view), 'Row patches require a record view');
    const updates = patch.upsert || [], removed = patch.remove || [];
    identifiers(updates, 'id', 'upsert');
    requireValue(Array.isArray(removed) && removed.every(id => typeof id === 'string'), 'remove must contain IDs');
    const rows = new Map(spec.rows.filter(row => !removed.includes(row.id)).map(row => [row.id, row]));
    for (const update of updates) rows.set(update.id, {...rows.get(update.id), ...update});
    spec.rows = [...rows.values()];
  }
  for (const key of ['title', 'context', 'revision', 'fields', 'nodes']) if (Object.hasOwn(patch, key)) spec[key] = patch[key];
  if (!Object.hasOwn(patch, 'revision')) spec.revision = (spec.revision ?? 1) + 1;
  return validate(spec);
}
export function jsonForHtml(value) {
  return JSON.stringify(value).replace(/[&<>\u2028\u2029]/g, char => ({'&': '\\u0026', '<': '\\u003c', '>': '\\u003e',
    '\u2028': '\\u2028', '\u2029': '\\u2029'})[char]);
}
let defaultContextValue;
export const defaultContext = () => defaultContextValue ||= config.resolve({}, {isolated: true});

export function placement(spec, width, height, {config: settingsConfig, theme} = {}) {
  const context = defaultContext(); settingsConfig ||= context.config; theme ||= context.theme;
  const settings = settingsConfig.placement;
  width ||= settings.viewport.width; height ||= settings.viewport.height;
  requireValue(width >= 320 && height >= 240, 'Viewport must be at least 320 × 240');
  const budget = Math.min(settings.heightBudget.maxPx, Math.trunc(height * settings.heightBudget.fraction));
  const {type, layout, control, spacingUnit: unit} = theme;
  const [cellY, cellX] = theme.table.cellPadding, pad = layout.inlinePadding, inner = width - 2 * pad - 8;
  const char = type.small * .5, bodyLine = type.body * type.lineHeight, smallLine = type.small * type.lineHeight;
  const titleLine = type.inlineTitle * type.titleLineHeight, charsPerLine = Math.max(20, Math.trunc(inner / char));
  const contextLines = sum(['goal', 'next'].map(key => Math.ceil(length(spec.context?.[key] || '') / charsPerLine)));
  const titleLines = Math.max(1, Math.ceil(length(spec.title || '') / Math.max(20, Math.trunc((inner - 90) / (type.inlineTitle * .42)))));
  const actionRow = control.minHeight + 2 * unit;
  const base = 2 * pad + titleLine + 2 * unit + actionRow + control.minHeight + smallLine + contextLines * smallLine + (titleLines - 1) * titleLine;
  const feedbackBlock = smallLine + unit + control.inputHeight + control.minHeight;
  let estimatedWidth = 320, estimatedHeight, allowed, reason = 'Small view fits the estimated inline budget';
  const limit = settings.inlineLimits[spec.view];
  if (spec.view === 'table') {
    const rows = spec.rows || [], columns = spec.columns;
    const widths = columns.map(column => Math.max(90, Math.min(180, length(column.label) * char + 28)));
    estimatedWidth = control.minHeight + 2 * cellX + 190 + sum(widths);
    const header = control.inputHeight + 2 * unit + control.minHeight + unit + smallLine + 2 * cellY;
    const rowHeights = rows.map(row => {
      const lines = Math.max(1, ...columns.map((column, index) => Math.ceil(length(row[column.key] ?? '') / Math.max(10, Math.trunc(widths[index] / char)))));
      return Math.max(feedbackBlock + 2 * cellY, lines * smallLine + 2 * cellY);
    });
    estimatedHeight = base + header + sum(rowHeights);
    allowed = !!limit && rows.length <= limit.rows && columns.length <= limit.columns;
    if (!allowed) reason = limit ? 'Table exceeds ' + limit.rows + ' rows or ' + limit.columns + ' data columns' : 'Tables are standalone for this harness';
  } else if (spec.view === 'cards') {
    const rows = spec.rows || [], across = Math.max(1, Math.min(2, Math.floor(inner / (layout.cardMinWidth + 15))));
    const cardWidth = Math.max(layout.cardMinWidth, inner / across - 2 * unit);
    const heights = rows.map(row => 2 * layout.surfacePadding + bodyLine + feedbackBlock + control.minHeight + 4 * unit
      + bodyLine * Math.ceil((length(row.title || '') + length(row.summary || '')) / Math.max(20, Math.trunc(cardWidth / char))));
    estimatedHeight = base;
    for (let index = 0; index < rows.length; index += across) estimatedHeight += Math.max(0, ...heights.slice(index, index + across));
    estimatedWidth = layout.cardMinWidth + 40;
    allowed = !!limit && rows.length <= limit.items;
    if (!allowed) reason = limit ? 'Cards exceed ' + limit.items + ' items' : 'Cards are standalone for this harness';
  } else if (spec.view === 'form') {
    const units = sum((spec.fields || []).map(field => field.type === 'multiselect' ? (field.options || []).length : field.type === 'textarea' ? 2 : 1));
    estimatedHeight = base + units * (control.inputHeight + smallLine + unit);
    allowed = !!limit && units <= limit.units;
    if (!allowed) reason = limit ? 'Form exceeds ' + limit.units + ' compact control units; textareas count as 2' : 'Forms are standalone for this harness';
  } else if (spec.view === 'flow') {
    const across = Math.max(1, Math.floor(inner / layout.flowMinWidth));
    const detailLines = Math.max(1, ...spec.nodes.map(node => Math.ceil(length(node.detail || '') / Math.max(25, Math.trunc(inner / char)))));
    const nodeHeight = 4 * unit + 2 * bodyLine + unit;
    estimatedHeight = base + Math.ceil(spec.nodes.length / across) * nodeHeight + control.minHeight + 3 * unit + detailLines * bodyLine + feedbackBlock;
    allowed = !!limit && spec.nodes.length <= limit.nodes;
    if (!allowed) reason = limit ? 'A flow larger than ' + limit.nodes + ' nodes uses the side panel' : 'Flows are standalone for this harness';
  } else {
    const rows = spec.rows || [], stages = spec.stages || ['To review', 'In progress', 'Done'];
    const counts = stages.map(stage => rows.filter(row => (row.stage ?? stages[0]) === stage).length);
    const across = Math.max(1, Math.floor(inner / (layout.cardMinWidth + 12)));
    const card = 2 * layout.surfacePadding + bodyLine + control.inputHeight + feedbackBlock;
    estimatedHeight = base;
    for (let index = 0; index < counts.length; index += across) estimatedHeight += bodyLine + 3 * unit + Math.max(...counts.slice(index, index + across)) * card;
    allowed = !!limit && rows.length <= (limit.items || 0);
    if (!allowed) reason = 'Kanban uses the side panel';
  }
  if (allowed && estimatedWidth > inner) { allowed = false; reason = 'Estimated content width would require horizontal scrolling'; }
  if (allowed && estimatedHeight > budget) { allowed = false; reason = 'Estimated view height exceeds the inline screen budget'; }
  return {mode: allowed ? 'inline' : 'standalone', reason, estimatedHeightPx: round(estimatedHeight), estimatedWidthPx: round(estimatedWidth),
    heightBudgetPx: budget, viewportWidthPx: width, viewportHeightPx: height};
}
export function manifest() {
  const info = load(MANIFEST);
  requireValue(createHash('sha256').update(fs.readFileSync(BUNDLE)).digest('hex') === info.sha256,
    'Renderer bundle differs from its manifest; rebuild before use');
  return info;
}
export function runtimeConfig(context, appearance, rendererHash) {
  const defaults = load(path.join(ROOT, 'config/defaults.json'));
  const result = {harness: context.harness.id, appearance, rendererHash};
  if (context.harness.adapter) result.adapter = context.harness.adapter;
  for (const key of ['copy', 'feedback']) {
    const override = config.diff(context.config[key] || {}, defaults[key]);
    if (Object.keys(override).length) result[key] = override;
  }
  if (appearance === 'host' && context.harness.id === 'claude-inline') result.hostPalette = config.HOST_PALETTE;
  return result;
}
export function fragment(spec, context, appearance, info) {
  const parts = ['<div data-dynamic-visual-reply-root></div>',
    '<script type="application/json" data-dynamic-visual-reply-config>' + jsonForHtml(runtimeConfig(context, appearance, info.sha256)) + '</script>',
    '<script type="application/json" data-dynamic-visual-reply-theme>' + jsonForHtml(config.diff(context.theme, load(config.THEME_FILE))) + '</script>',
    '<script type="application/json" data-dynamic-visual-reply-spec>' + jsonForHtml(spec) + '</script>'];
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  requireValue(!bundle.toLowerCase().includes('</script'), 'Bundle contains an unsafe closing script tag');
  parts.push('<script data-dynamic-visual-reply-runtime>\n' + bundle + '\n</script>');
  return parts.join('\n') + '\n';
}
export function pageStyle(context, appearance) {
  const theme = context.theme, width = theme.layout.maxWidth;
  const gutter = 'padding-block:16px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))';
  if (['system', 'host'].includes(appearance)) return ':root{--vr-page:' + theme.light.canvas + '}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--vr-page:' +
    theme.dark.canvas + ';color-scheme:dark}}:root[data-theme="dark"]{--vr-page:' + theme.dark.canvas + ';color-scheme:dark}body{margin:0;' + gutter +
    ';font-family:system-ui;background:var(--vr-page)}[data-dynamic-visual-reply-root]{max-width:' + width + 'px;margin:auto}';
  return ':root{color-scheme:' + appearance + '}body{margin:0;' + gutter + ';font-family:system-ui;background:' + theme[appearance].canvas +
    '}[data-dynamic-visual-reply-root]{max-width:' + width + 'px;margin:auto}';
}
export function wrap(body, kind, spec, context, appearance) {
  return kind === 'fragment' ? body : '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Dynamic visual reply</title><style>' + pageStyle(context, appearance) + '</style></head><body>\n' + body + '</body></html>\n';
}
export function handoff(context, out, kind, size) {
  const id = context.harness.id;
  if (id === 'codex' && kind === 'fragment') return {type: 'contentReference', value: 'visualize' + JSON.stringify({path: out}) + ''};
  if (id === 'claude-inline') return {type: 'show_widget', file: out, bytes: size, instruction: 'Read this file and pass its full contents unchanged as show_widget widget_code.'};
  if (['browser-local', 'claude-code'].includes(id)) return {type: 'serve', command: 'node "' + path.join(ROOT, 'scripts/serve.mjs') + '" "' + out + '" --port 0'};
  return {type: 'file', path: out};
}
export function render(spec, out, mode = 'auto', viewportWidth, viewportHeight, {context = defaultContext()} = {}) {
  validate(spec); out = path.resolve(out);
  requireValue(context.config.views.enabled.includes(spec.view), 'View ' + JSON.stringify(spec.view) + ' is disabled by configuration (views.enabled)');
  const requested = mode !== 'auto' ? mode : spec.presentation || 'auto';
  const decision = placement(spec, viewportWidth, viewportHeight, context);
  if (requested !== 'auto') Object.assign(decision, {mode: requested, reason: 'Explicit presentation override'});
  const limit = context.config.placement.maxSpecBytes;
  if (requested === 'auto' && decision.mode === 'inline' && limit && bytes(jsonForHtml(spec)) > limit)
    Object.assign(decision, {mode: 'standalone', reason: 'Spec exceeds ' + limit + ' bytes, the inline size limit for this harness'});
  const info = manifest();
  if (decision.mode === 'standalone' && ['codex', 'claude-inline'].includes(context.harness.id)) context = context.switch('browser-local');
  spec.resolvedPresentation = decision;
  spec.stateKey = createHash('sha256').update(info.draftVersion + ':' + spec.viewId + ':' + spec.view).digest('hex').slice(0, 24);
  const appearance = spec.appearance || context.appearance;
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const snapshot = out.slice(0, out.length - path.extname(out).length) + '.spec.json';
  fs.writeFileSync(snapshot, JSON.stringify(spec, null, 2) + '\n');
  const data = jsonForHtml(spec);
  const result = {harness: context.harness.id, theme: context.theme.name, view: spec.view, rendererHash: info.sha256,
    specBytes: bytes(data), rendererBytes: info.bytes, delivery: 'embed', spec: snapshot, placement: decision};
  let kind = decision.mode === 'inline' && ['codex', 'claude-inline'].includes(context.harness.id) ? 'fragment' : 'document';
  let body = fragment(spec, context, appearance, info);
  const sizeLimit = context.config.placement.maxInlineBytes;
  if (decision.mode === 'inline' && bytes(body) >= sizeLimit) {
    requireValue(requested === 'auto', 'Inline UI exceeds ' + sizeLimit + ' bytes; reduce the dataset or use standalone');
    Object.assign(decision, {mode: 'standalone', reason: 'Payload exceeds the inline file-size limit'});
    if (['codex', 'claude-inline'].includes(context.harness.id)) {
      context = context.switch('browser-local'); Object.assign(result, {harness: 'browser-local', delivery: 'embed'});
    }
    kind = 'document'; body = fragment(spec, context, appearance, info);
  }
  const output = wrap(body, kind, spec, context, appearance);
  fs.writeFileSync(out, output);
  Object.assign(result, {path: out, format: decision.mode, output: kind, handoff: handoff(context, out, kind, bytes(output))});
  if (result.handoff.type === 'contentReference') result.contentReference = result.handoff.value;
  return result;
}
export function main() {
  const strings = ['spec', 'patch', 'out', 'format', 'harness', 'theme', 'appearance', 'viewport-width', 'viewport-height', 'theme-css'];
  const options = Object.fromEntries(strings.map(key => [key, {type: 'string'}]));
  const {values: args} = config.parseCli({...options, 'print-config': {type: 'boolean'}, catalog: {type: 'boolean'}});
  if (args.help) { console.log('Usage: node render.mjs --spec <spec.json> --out <view.html> [--harness <id>] [--format auto|inline|standalone]\nOptions: --patch --theme --appearance light|dark|system|host --viewport-width --viewport-height --print-config --theme-css --catalog'); return; }
  if (args.catalog) {
    console.log(JSON.stringify({schemaVersion: 1, views: VIEWS, harnesses: config.harnessIds(), contract: path.join(ROOT, 'references/renderer-contract.md'),
      schemas: path.join(ROOT, 'config/schema'), examples: path.join(ROOT, 'assets/examples')})); return;
  }
  requireValue(!args.format || ['auto', 'inline', 'standalone'].includes(args.format), 'Unknown format: ' + args.format);
  requireValue(!args.appearance || ['light', 'dark', 'system', 'host'].includes(args.appearance), 'Unknown appearance: ' + args.appearance);
  const context = config.resolve({harness: args.harness, theme: args.theme, appearance: args.appearance});
  if (args['print-config'] || args['theme-css']) {
    if (args['theme-css']) fs.writeFileSync(args['theme-css'], config.cssVariables(context.theme, context.appearance));
    if (args['print-config']) console.log(JSON.stringify({harness: context.harness.id, harnessReason: context.harnessReason, theme: context.theme.name,
      themeSource: context.themeSource, appearance: context.appearance, layers: context.layers, sources: context.sources, config: context.config}, null, 2));
    return;
  }
  requireValue(args.spec && args.out, '--spec and --out are required');
  const source = path.resolve(args.spec), spec = validate(resolveData(load(source), source));
  if (args.patch) applyPatch(spec, load(args.patch));
  const dimension = key => { if (args[key] === undefined) return undefined; const number = Number(args[key]); requireValue(Number.isInteger(number), key + ' must be an integer'); return number; };
  console.log(JSON.stringify(render(spec, args.out, args.format || 'auto', dimension('viewport-width'), dimension('viewport-height'), {context})));
}
if (config.isMain(import.meta.url)) config.runCli(main);
