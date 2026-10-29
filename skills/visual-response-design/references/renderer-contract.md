# Renderer input and handoff

Normal rendering uses prebuilt assets and Python's standard library. Execute the script; do not read or paste the renderer source into ordinary model turns. Paths below are relative to the skill folder; quote paths containing spaces.

## Commands

```sh
python3 <skill-dir>/scripts/doctor.py [--harness <id>] [--check-url]
python3 <skill-dir>/scripts/render.py --catalog
python3 <skill-dir>/scripts/render.py --spec <input.json> --out <view.html> [--harness <id>] [--theme <pack>]
python3 <skill-dir>/scripts/render.py --spec <input.json> --out <view.html> --format inline|standalone
python3 <skill-dir>/scripts/render.py --print-config [--harness <id>]
python3 <skill-dir>/scripts/render.py --theme-css <theme.css>
python3 <skill-dir>/scripts/serve.py <view.html> --port 0
```

The renderer prints one JSON line:
- `path`, `spec`, `view`, `harness` and `theme`
- `rendererVersion`, `specBytes`, `rendererBytes` and `delivery`
- `format` (inline or standalone) and `output` (`fragment`, `document` or `artifact-page`)
- `placement` and `handoff`

`handoff.type` is `contentReference`, `show_widget`, `artifact`, `serve`, `file` or `module`, and it carries everything the agent needs for the next step. Codex inline output also keeps the top-level `contentReference` key for compatibility. UI code is copied or referenced deterministically and is never printed.

Other flags: `--appearance`, `--delivery embed|url|module`, `--renderer-url`, `--viewport-width` and `--viewport-height`. Each overrides configuration for one call.

## Configuration

Layers merge in this order, later winning, and each is validated against `config/schema/config.schema.json`:

1. `config/defaults.json`: shipped defaults, including all English copy.
2. `harnesses/<id>.json` → `config`: the harness profile.
3. User config: `$VISUAL_RESPONSE_CONFIG`, else `$XDG_CONFIG_HOME/visual-response/config.json`, else `~/.config/visual-response/config.json`.
4. Project config: `.visual-response.json`, found by walking up from the working directory to the repository root.
5. Command-line flags.
6. The spec's own `appearance` (the only configuration a spec may override).

`--print-config` shows the merged result and the layer each value came from. Keys:

| Key | Meaning |
| --- | --- |
| `theme`, `themeFallback` | Theme pack name, a `theme.json` or pack folder path, or an inline theme object. The fallback is used when the pack isn't found. |
| `appearance` | `light`, `dark`, `system`, `host`, or `null` (use the theme's own) |
| `harness` | Profile id or `auto` (environment detection) |
| `views.enabled`, `views.motion` | Views the agent may render; whether motion flows are allowed |
| `placement.*` | Viewport, height budget, per-view `inlineLimits` (`false` = never inline), `maxInlineBytes`, `maxSpecBytes` |
| `delivery.mode`, `delivery.rendererUrl`, `delivery.integrity` | `embed` pastes the bundle. `url` loads `rendererUrl` with SRI (`"manifest"` computes it from the local bundle). `module` writes JSON only. |
| `output.inline`, `output.standalone` | `fragment`, `document` (full HTML), or `artifact-page` (Claude artifact format) |
| `feedback.defaultPrompt`, `feedback.formPrompt` | The request sent with the feedback envelope |
| `feedback.messageFormat` | What Send to chat posts as the user's message. `json` (default) is the pretty-printed envelope. `compact` is the same JSON on one line. `summary` is the request, a readable line such as `Selected: Side panel · 1 with instructions`, then `Feedback JSON:` with the one-line envelope. Hosts show this text in the chat as the user's message. |
| `copy.*` | Every user-facing string. Partial objects merge over the defaults; `{name}` placeholders are filled at runtime. |

Pages only carry the parts of the theme and copy that differ from what the bundle already contains, so a URL-loaded inline view stays a few KB.

## Theme packs

A theme pack is a folder with `theme.json` (or `assets/theme.json`), validated by `config/schema/theme.schema.json`, plus optional design rules for UI built outside the renderer. Packs are found by name in this order:
- `$VISUAL_RESPONSE_THEME_PATH`
- this skill's `themes/`
- sibling skills
- `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills` and `~/.cursor/skills`

Keys added after theme v2 (`type.meta`, `type.titleCompact`, `type.titleLineHeight`, `type.titleTracking`, `radius.chip`, `layout.contentPaddingCompact`, `control.inputHeight`, `control.paddingX`, `control.paddingY`, `control.inputPadding`, `table.cellPadding`, `motion.*`) fall back to the neutral theme's values. Every pack must pass the contrast checks in `scripts/test_renderer.py`. The renderer exposes the active palette as `--vr-*` CSS variables on its root element. `--theme-css` writes the same variables for hand-written views.

### Automatic placement

`--format auto` is the default. The result includes `placement` with the chosen mode, reason, estimated dimensions, budget, and viewport. The agent should follow the returned `format` and `handoff`, rather than always opening a panel.

| Component | Default inline ceiling |
| --- | --- |
| Table | 3 total rows and 3 data columns, excluding built-in selection/feedback columns |
| Cards | 2 cards |
| Form | 3 compact control units; textarea counts as 2, each editable multi-select option as 1 |
| Static flow | 4 nodes |
| Kanban | 6 cards, if the stage columns fit the width |
| Motion flow | Same as a static flow |

Ceilings come from `placement.inlineLimits` (`false` makes a view always standalone). The agent may override any decision with `presentation`. Estimated heights are computed from the active theme's sizes (title, line height, control and input heights, padding, cell padding), so changing a theme changes the estimate without code edits. Counts are eligibility limits, not a guarantee; width, text wrapping and height can still push a view standalone. Small datasets are not made inline merely by paginating a larger dataset. Inline feedback actions and extra controls begin collapsed to reduce height; row instructions remain accessible.

The default viewport is 736 × 900 px, with a height budget of `min(640, 0.75 × viewportHeight)`. A harness profile may change both (for example `claude-inline` uses 680 px). When placement picks a mode the harness handles elsewhere, `standaloneHarness`/`inlineHarness` in the profile switches the profile before output. Codex standalone becomes `browser-local`; Claude inline standalone becomes `claude-artifact`.

## Common spec

```json
{"schemaVersion":1,"viewId":"review-42","view":"table","title":"Review candidates","context":{"goal":"Choose candidates","next":"Select rows and add feedback"},"columns":[{"key":"name","label":"Name"}],"rows":[{"id":"a","name":"Candidate A"}]}
```

`viewId` identifies the task/dataset for draft restoration. Keep it stable across compatible updates; change it for unrelated content. `revision` defaults to 1. `context.goal` and `context.next` are optional text. `feedbackPrompt` is the instruction accompanying submitted feedback. `appearance` optionally overrides configuration for this view.

Record, field, and option IDs must be unique nonempty strings. UI content is text, never interpreted as HTML or JavaScript. Card links accept HTTP(S) only. `config/schema/spec.schema.json` describes the same contract for non-Python callers. ID uniqueness can't be expressed in JSON Schema, so `render.py` checks it separately.

### Table

`columns:[{key,label,type?,editable?}]`, where type is `text` or `number`. Values come from `rows`. Optional `filterKey` creates a categorical filter; `pageSize` is 1–100, default 20.

Coded features: search, column visibility, numeric-aware sort, pagination, select/deselect current page, select all matches for paginated results, selected counts, row instructions, reviewed flags, editable configured cells, shared instructions, and local undo. Filtering and sorting retain drafts and selection. "Visible" means the current page. Selected records outside the page stay selected.

### Cards

Rows use `id`, `title`, `summary`, optional `details`, `source`, `recommended`, and `actionLabel`. Selection, expandable details, instructions, reviewed flags, and CTAs are coded. Recommendations must be grounded in the task.

### Kanban

Rows use `id`, `title`, and `stage`. Optional `stages` is a unique list of 1–8 labels; defaults to `To review`, `In progress`, `Done`. Stage selectors move items locally with undo. Drag-and-drop is not implemented. Moving a draft does not update Linear or other services.

### Form

Fields use `id`, `label`, `type`, `value`, optional `help`. Types: `text`, `textarea`, `number`, `checkbox`, `select`, `multiselect`.

`select` uses `options:[{id,label}]` and an option ID as the value. `multiselect` uses `options:[{id,label,selected}]`; users can edit each label and select multiple options. Textareas and a general instruction field support comments. A primary submit button below the answer fields stays visible when feedback is collapsed and submits all current answers without a feedback comment. Its label follows the harness: **Send to chat**, a save label, or **Prepare message**. See `assets/examples/form.json`.

### Flow and Remotion

Sequential `nodes:[{id,title,detail}]` are shown in a static flow with stage buttons, selected detail, and associated feedback. An arbitrary graph layout is not implemented.

Use `motion:true` only for appropriate complex explanations. The bundled Remotion composition supports 2–4 short node titles, maximum 28 characters. Stage length, frame rate and canvas size come from the theme's `motion` tokens (default 3 seconds at 30 fps on 720 × 290). It starts paused with stage seeking, Play/Pause, Replay, speed, and timeline. Reduced-motion preferences prevent continuous mark movement. This is an interactive composition, not an exported MP4. A new composition needs a deliberate renderer change.

## Datasets and updates

For table/cards/Kanban, use `dataFile:"path/to/data.json"` instead of `rows`. JSON can be an array or `{rows:[...]}`. CSV/TSV use headers and require `id`; numeric table columns are parsed as numbers. Relative paths resolve against the spec file. Stable IDs are required.

Rendering writes `<output-stem>.spec.json`, the resolved spec. Update it with a small patch:

```json
{"upsert":[{"id":"a","status":"Reviewed"}],"remove":["b"]}
```

```sh
python3 <skill-dir>/scripts/render.py --spec <previous.spec.json> --patch <changes.json> --out <view.html>
```

Patch operations: `upsert` (merge by ID), `remove`, `title`, `context`, `revision`, `fields`, `nodes`. Patching increments revision unless supplied. Renderer/data byte counts are not measured model token counts.

## Feedback and host boundaries

Every view exposes a primary submit action outside collapsible feedback. The feedback envelope (`config/schema/feedback.schema.json`) contains:
- `schemaVersion`, `viewId`, `view` and `revision`
- selected and reviewed IDs
- item instructions and edits, plus form fields and options
- a general comment
- `source: {harness, theme, rendererVersion}`

Selected items and items with edits or comments are included. Users can preview or edit the message, copy or select its text, or export JSON.

### Harness adapters

The renderer never checks for host globals itself. Adapters register themselves in `window.visualResponseHosts[<adapter id>]`. The bundle includes `codex`, `claude-inline`, `claude-artifact` and `browser-local` (listed in `manifest.json` `adapters`), and picks one by the page config's `adapter`, because some hosts (such as Claude's inline widget) don't run a page's inline scripts. `render.py` injects only adapters that aren't in the bundle. A page or wrapper may set `window.visualResponseHost` to override. Each adapter has this shape:

```ts
window.visualResponseHost = {
  id: string,
  capabilities: { submit: 'message' | 'save' | 'none', persist: boolean, restore: boolean },
  submit?(m: { message: string, feedback: Envelope, title: string }): Promise<{ receipt?: string, detail?: string }>,
  saveDraft?(key: string, draft: Draft, context: { viewId, view, modelContent }): void | { warning: string } | Promise<…>,
  loadDraft?(key: string): Draft | null | Promise<Draft | null>,
  onExternalDraft?(fn: (draft: Draft) => void): () => void,
};
```

- `capabilities.submit` chooses the button label. `message` starts a chat turn, `save` stores feedback for the agent to read later, and `none` shows the editable message with copy and export.
- `submit` must reject on failure. The page then keeps the edits and reveals the copy fallback.
- `receipt` names a `copy.status.*` key to show. `detail` fills `copy.status.savedTo`.
- `saveDraft` may return `{warning: 'draftTooLarge'}` (or another `copy.status` key) to warn the user.
- Drafts restored through `loadDraft` or `onExternalDraft` are applied only if their `key` matches and the user hasn't edited yet.
- `capabilities` may be a getter when a host's globals appear late.
- Without an adapter, a built-in `static` host keeps drafts in `localStorage` and offers copy and export.

| Adapter | Submit | Drafts |
| --- | --- | --- |
| `codex.js` | `window.openai.sendFollowUpMessage({prompt, title})` | `setWidgetState({modelContent, privateContent:{draft}})` up to 15 KB, restored from `widgetState` and `openai:set_globals`; `localStorage` without `window.openai` |
| `claude-inline.js` | global `sendPrompt(message)` | `localStorage` when the sandbox allows |
| `claude-artifact.js` | `db.collection('batches').add(...)` via `claude.use('db')` | each viewer's private `data/users/<id>/vr-<key>` document, plus `localStorage` |
| `browser-local.js` | `POST /api/feedback` to `serve.py` on loopback | `localStorage` |

Saving is not submission, and a clipboard copy doesn't prove the message was sent. Never claim a saved file or row has started an agent turn. Oversized host snapshots remain in memory, with an export prompt rather than silently dropping instructions.

## Rebuild only after code changes

`assets/renderer` contains source, pinned package metadata/lockfile, prebuilt bundle, manifest, and third-party notices. Normal use requires no package installation.

```sh
cd <skill-dir>/assets/renderer
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

The bundle compiles in the neutral theme and the default copy as fallbacks only; themes, copy and hosts arrive at runtime, so changing them never needs a rebuild. `manifest.json` records:
- `version`: the package version, used in published URLs
- `draftVersion`: the draft key prefix
- `sha256`: checked by `render.py`
- `sri`: used for URL delivery

Bump `draftVersion` in `build.mjs` only when saved drafts become incompatible; otherwise drafts survive upgrades. Keep redistributed notices with the bundle. To serve URL delivery, publish `dist/renderer.js` at a version-pinned URL and verify it with `doctor.py --check-url`.

Run `python3 <skill-dir>/scripts/test_renderer.py` and `node --test <skill-dir>/scripts/test_adapters.mjs`. They cover contract, schema agreement, configuration layering, harness detection, data integrity, script escaping, draft-key stability, adapter behavior, and identical-code reuse. Browser checks should additionally cover selection/deselection, drafts through sorting/paging, copy/submission, and the specific view changed.
