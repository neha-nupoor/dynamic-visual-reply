#!/usr/bin/env node
/** Shared response policy. Ships here so renderer-only installations still route. */
import fs from 'node:fs';
import {load, object, requireValue, isMain, parseCli, runCli} from './visual-config.mjs';

export const VIEWS = ['table', 'cards', 'form', 'kanban', 'flow'];
export const LIMITS = Object.freeze({reviewItems: 3, smallAlternatives: 4, tableRows: 15, multiTableRows: 10, words: 500, comparableItems: 6});
const enums = {format: ['auto', 'text', 'markdown', 'document', 'visualization', 'visual', 'custom', 'other'],
  intent: ['explain', 'compare', 'questions', 'stages', 'steps', 'records'],
  feedback: ['none', 'overall', 'per-item'], view: [...VIEWS, 'custom']};
const booleans = ['recordLike', 'singleReply', 'visualReport', 'proseComments', 'borderline', 'visualBenefit', 'customLayout', 'inline'];
const counts = ['items', 'words'];

export function validateFacts(facts) {
  requireValue(object(facts), 'Facts must be an object');
  const allowed = [...Object.keys(enums), ...booleans, ...counts, 'tableRows', 'customReason'];
  for (const [key, value] of Object.entries(facts)) {
    requireValue(allowed.includes(key), 'Unknown routing fact: ' + key);
    if (enums[key]) requireValue(enums[key].includes(value), 'Invalid ' + key);
    if (booleans.includes(key)) requireValue(typeof value === 'boolean', key + ' must be boolean');
    if (counts.includes(key)) requireValue(Number.isSafeInteger(value) && value >= 0, key + ' must be a nonnegative integer');
    if (key === 'tableRows') requireValue(Array.isArray(value) && value.every(n => Number.isSafeInteger(n) && n >= 0), 'tableRows must contain nonnegative integers');
    if (key === 'customReason') requireValue(typeof value === 'string' && value.trim(), 'customReason must explain the layout need');
  }
  if (facts.customLayout) requireValue(typeof facts.customReason === 'string' && facts.customReason.trim(), 'Automatic custom layout needs customReason');
  return facts;
}

export function route(facts) {
  validateFacts(facts);
  const f = {format: 'auto', intent: 'explain', feedback: 'none', items: 0, words: 0, tableRows: [], ...facts};
  const chat = (reason, offerReview = false) => ({target: 'markdown', reason, ...(offerReview ? {offerReview: true} : {})});
  if (f.format === 'other') return {target: 'requested-format', reason: 'requested-format'};
  if (['text', 'markdown', 'document', 'visualization'].includes(f.format))
    return f.format === 'text' || f.format === 'markdown' ? chat('requested-format') : {target: f.format, reason: 'requested-format'};
  const custom = () => ({target: 'custom-visual', readOnly: f.feedback !== 'per-item', reason: f.customReason || 'requested-custom'});
  if (f.format === 'custom' || f.view === 'custom') return custom();
  const explicit = f.format === 'visual' || !!f.view;
  if (!explicit && f.proseComments) return {target: 'document', reason: 'inline-comments'};
  const dense = f.recordLike === true && (f.tableRows.some(n => n >= LIMITS.tableRows)
    || (f.tableRows.length >= 2 && f.tableRows.reduce((a, b) => a + b, 0) >= LIMITS.multiTableRows)
    || (f.words >= LIMITS.words && f.items >= LIMITS.comparableItems));
  const review = f.recordLike === true && f.items >= LIMITS.reviewItems && f.feedback === 'per-item' && f.singleReply === false;
  const proactive = f.visualBenefit === true;
  if (!explicit && !f.visualReport && !dense && !proactive && (!review || f.borderline)) return chat('ordinary-answer', !!f.borderline && f.feedback === 'per-item');
  const readOnly = f.feedback !== 'per-item';
  // Automatic read-only views need an inline host; elsewhere Markdown plus a one-line offer beats opening a browser.
  if (f.inline === false && !explicit && !f.visualReport && !review && readOnly) return chat('no-inline-host', true);
  if (f.customLayout && !f.view) return custom();
  if (!explicit && proactive && f.recordLike !== true) return {target: 'visualization', reason: 'visual-benefit'};
  if (!explicit && f.recordLike !== true) return chat('unsupported-shape');
  const view = f.view || (f.intent === 'questions' ? 'form' : f.intent === 'stages' ? 'kanban'
    : f.intent === 'steps' && !readOnly ? 'flow'
    : f.intent === 'compare' && f.items > 0 && f.items <= LIMITS.smallAlternatives ? 'cards' : 'table');
  return {target: 'visual', view, profile: view + '-v1', readOnly,
    preferInline: dense, reason: explicit ? 'requested-view' : f.visualReport ? 'requested-report' : review ? 'item-feedback' : dense ? 'density' : 'visual-benefit'};
}

export function applyRoute(spec, decision) {
  requireValue(object(decision) && decision.target === 'visual', 'Only a visual route can be rendered');
  requireValue(VIEWS.includes(decision.view) && decision.profile === decision.view + '-v1', 'Invalid layout profile');
  requireValue(typeof decision.readOnly === 'boolean' && typeof decision.preferInline === 'boolean', 'Invalid route mode or placement');
  requireValue(spec.view === decision.view, 'Spec view differs from selected layout profile');
  requireValue(!Object.hasOwn(spec, 'readOnly') || spec.readOnly === decision.readOnly, 'Spec mode differs from selected route');
  return {...spec, readOnly: decision.readOnly};
}

export function help() {
  return `Usage: node route.mjs --facts <facts.json> [--out <route.json>]
Facts: intent=explain|compare|questions|stages|steps|records; items/words=nonnegative integers;
recordLike=records fit supported views; feedback=none|overall|per-item;
singleReply=one sentence can cover feedback; tableRows=planned row counts;
format=auto|text|markdown|document|visualization|visual|custom|other; view=table|cards|form|kanban|flow|custom;
visualReport=requested visual report; proseComments=inline prose comments; borderline=uncertain review.
visualBenefit=visual improves understanding/action; customLayout=existing views cannot express it;
inline=host shows widgets inline in chat (true: Codex app; false: Claude Code).
automatic customLayout requires a nonempty customReason. Explicit custom requests need no justification.
Missing facts default to explain/none/auto, zero counts, and no affirmative shape/feedback evidence.
Precedence: explicit format > requested view > prose comments > requested supported report > review/density > Markdown.
Use format=other for any other explicit format (JSON, CSV, code, etc.); follow that request.
Explicit views bypass automatic thresholds. Any selected visual retains per-item feedback; otherwise it is read-only.
Review: >=${LIMITS.reviewItems} records, per-item feedback, and singleReply=false. Overall feedback stays in chat unless report/density applies.
Density (recordLike=true): one table >=${LIMITS.tableRows} rows, >=2 tables totaling >=${LIMITS.multiTableRows} rows,
or >=${LIMITS.words} words with >=${LIMITS.comparableItems} comparable items. Narrative length alone does not qualify.
Borderline review stays in chat with an offer; definite density still applies.
inline=false: automatic read-only routes (density, visualBenefit) become Markdown with offerReview;
review, explicit format/view and visualReport still route. Omitted inline keeps the default routes.
Meaningful visualBenefit can proactively route shorter records or explanatory visuals.
Custom requests or justified customLayout route to custom-visual, outside the fixed renderer.
Profiles: questions=form-v1; stages=kanban-v1; reviewed steps=flow-v1;
compare with a known 1-${LIMITS.smallAlternatives} items=cards-v1; otherwise table-v1. Explicit view wins.
Host names do not affect routing. The renderer checks actual display capabilities and placement.
Counts are authoring estimates; do not draft a long answer just to measure them.`;
}

if (isMain(import.meta.url)) runCli(() => {
  const {values: args} = parseCli({facts: {type: 'string'}, out: {type: 'string'}});
  if (args.help) { console.log(help()); return; }
  requireValue(args.facts, '--facts is required');
  const result = route(load(args.facts));
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result) + '\n');
  console.log(JSON.stringify(result));
});
