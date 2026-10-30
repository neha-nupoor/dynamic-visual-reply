# Renderer contract

Use Python's standard library to hydrate the prebuilt bundle. Do not read or paste the bundled JavaScript into normal model turns.

## Commands and delivery

```sh
python3 <skill-dir>/scripts/render.py --spec <input.json> --out <view.html> --harness codex
python3 <skill-dir>/scripts/render.py --spec <previous.spec.json> --patch <changes.json> --out <view.html> --harness codex
python3 <skill-dir>/scripts/render.py --print-config --harness codex
python3 <skill-dir>/scripts/render.py --theme-css <theme.css>
python3 <skill-dir>/scripts/doctor.py --harness claude-inline --check-url
```

The result JSON reports output `path`, resolved `spec` snapshot, `format`, `placement`, `harness`, `theme`, bundle/spec byte counts, and `handoff`. Byte counts are not model token counts.

Codex inline embeds the Oat/Preact bundle and returns the existing `contentReference`. The optional Claude inline route references the identical bundle, including all CSS, by a version-pinned URL and returns a small loader for `show_widget`. Claude accepts inline HTML/JavaScript; the loader avoids passing the prebuilt bundle through model context. A public URL is a prerequisite for this particular loader, not for using the skill: choose `browser-local` whenever the widget tool or a verified matching URL is unavailable. Larger views in either host use `serve.py` and save feedback locally. Cursor, Windsurf, Gemini CLI, and other terminal/IDE agents use the same `browser-local` fallback; Claude Code uses `claude-code`; `static` produces an offline HTML file with copy/export. Claude Code's desktop markers do not establish that `show_widget` exists, so auto-detection uses the local browser. Host routing is fixed; no configurable backend graph is used.

Other flags: `--format auto|inline|standalone`, `--theme`, `--appearance light|dark|system|host`, `--renderer-url`, `--viewport-width`, `--viewport-height`, and `--catalog`.

## Specs and datasets

```json
{"schemaVersion":1,"viewId":"review-42","view":"table","title":"Review candidates","columns":[{"key":"name","label":"Name"}],"rows":[{"id":"a","name":"Candidate A"}]}
```

Keep `viewId` stable for compatible task/dataset updates; use a new ID for unrelated content. Optional fields: `revision` (default 1), `context:{goal,next}`, `feedbackPrompt`, `appearance`, `presentation`. Record/column/field/option/node IDs are unique, nonempty strings. Content is text rather than HTML; source links accept HTTP(S) only.

| View | Fields and behavior |
| --- | --- |
| Table | `columns:[{key,label,type?,editable?}]`, `rows:[{id,...}]`; type is `text` or `number`. Optional `filterKey` and `pageSize` (1–100, default 20). Search, sorting, column visibility, paging, selection, row instructions, reviewed flags, cell editing, shared instructions, and undo. Select visible acts on the current page; select all matches spans pages. |
| Cards | `rows:[{id,title,summary,details?,source?,recommended?,actionLabel?}]`; selection, expandable details, instructions, reviewed state. |
| Kanban | `rows:[{id,title,stage}]`, optional unique `stages` (1–8 labels; default To review / In progress / Done). Stage selectors edit drafts; no drag-and-drop or external task mutation. |
| Form | `fields:[{id,label,type?,value?,help?,options?}]`; text, textarea, number, checkbox, select, multiselect. Select values are option IDs; options use `{id,label}`. Multiselect options add `selected` and editable labels. |
| Flow | `nodes:[{id,title,detail?}]`; static overview, manual step buttons, current detail and feedback. Legacy motion flags are ignored. |

For record views, use `dataFile` instead of `rows` to load JSON (array or `{rows:[...]}`), CSV, or TSV. Relative paths resolve against the input spec. CSV/TSV require an `id` column; numeric table columns are converted to numbers.

Each render writes `<output-stem>.spec.json`. Patches support `upsert` (merge rows by ID), `remove` (IDs), `title`, `context`, `revision`, `fields`, and `nodes`. Revision increments unless supplied.

## Settings and themes

Settings merge: shipped defaults → small built-in host defaults → user config → project config → flags. The spec can override appearance. User config is `$VISUAL_RESPONSE_CONFIG`, otherwise `$XDG_CONFIG_HOME/visual-response/config.json` or `~/.config/visual-response/config.json`. Project config is `.visual-response.json`, searched up to the repository root. `--print-config` shows the effective values and their sources.

Settings cover theme/fallback, appearance, harness, enabled views, placement, feedback prompts/message format, copy, and an optional pinned Claude renderer URL. `feedback.messageFormat` is `json`, `compact`, or `summary` (a readable line followed by JSON). `copy` can override selected labels/status messages. Claude's default button is **Add to chat**, with a status asking the user to press Enter.

The default `base-web` preset (a historical name) supplies the approved spacious neutral appearance: monochrome actions, a soft light background, visible borders, square card surfaces, 2 px controls, and labels above filled fields. It now styles actual Oat/native controls; see [its reference notes](../themes/base-web/reference.md). The compact `neutral` fallback uses the same palette and corner treatment. Both appearances support brief 150–200 ms hover/focus/selection transitions and reduced-motion settings.

A theme pack has `theme.json` or `assets/theme.json`, validated by `config/schema/theme.schema.json`. Packs can be supplied as a path, inline theme object, or name. Names are looked up in the bundled themes, sibling skills, `$VISUAL_RESPONSE_THEME_PATH`, and the common installed skill directories. Missing optional tokens inherit neutral values. Old motion tokens are ignored. The split accent roles `accentFill`, `onAccentFill`, `accentBorder`, and `onSelected` are preserved. CSS variables use the `--vr-` prefix.

`appearance: host` reads available Claude CSS variables, with theme fallbacks. `system` follows the host's `data-theme`/`data-mode` or OS preference. Explicit light/dark settings stay fixed.

Automatic placement estimates width/height from theme sizes. Default eligibility limits: 3 table rows/3 data columns, 2 cards, 3 form control units (textarea counts as 2), 4 flow nodes, 6 board cards. A view must also fit the screen budget; pagination does not make a large dataset inline. `presentation` overrides the estimate. These are estimates rather than measured host dimensions.

## Feedback and drafts

The schemaVersion 1 feedback envelope retains `viewId`, view, revision, selected/reviewed IDs, item instructions/edits, form answers/options, general comment, and `source:{harness,theme,rendererVersion}`. Selected items and items with edits/comments are submitted across all pages. Preview, editable generated message, copy, text selection, export, and undo stay available.

The bundle includes three thin adapters. The renderer selects one by the page's `config.adapter`:

| Adapter | Feedback | Drafts |
| --- | --- | --- |
| Codex | `window.openai.sendFollowUpMessage({prompt,title})` | `setWidgetState`, `widgetState`, `openai:set_globals`; localStorage without a host bridge |
| Claude inline | `sendPrompt(message)` fills the message box; user sends | localStorage when allowed |
| Local browser | POST to `serve.py` `/api/feedback` | localStorage |

Without a bridge, copy/export remains available. Codex snapshots above approximately 15 KB produce a warning instead of silently truncating. Restored drafts must match the key and cannot overwrite newer local edits. The key uses `draftVersion` + viewId + view, so appearance and bundle changes preserve drafts.

## Maintenance

`config/schema/spec.schema.json` defines input rules; `render.validate` uses it directly and adds cross-record constraints. The standard-library schema reader handles the keywords used by the shipped schemas; extend its tests when adding keywords. There is no second scalar/shape validator.

```sh
cd <skill-dir>/assets/renderer
npm ci --ignore-scripts --no-audit --no-fund
npm run build
python3 ../../scripts/test_renderer.py
node --test ../../scripts/test_adapters.mjs
```

The manifest pins bundle version, SHA-256, SRI, bytes, adapters, and draftVersion. Rebuild after renderer/default changes. Bump draftVersion only for incompatible saved drafts. For the optional Claude URL loader, publish the matching reviewed commit as `v<version>` and verify it with `doctor.py --harness claude-inline --check-url`; the default jsDelivr URL uses that tag. During PR review, use a matching commit-pinned URL. The local browser path embeds the bundle and needs no public URL or release tag. Do not overwrite an old release tag. Keep third-party notices with the bundle. Mocked tests do not prove live host APIs; verify actual submission separately when available.

Oat CSS is namespaced and scoped to the widget before being embedded in the bundle, preserving host palette variables. The renderer uses Preact directly; Oat JavaScript, MUI, Emotion, ReactDOM, and animation engines are not included. Native labels, selects, checkboxes, text inputs, and textareas retain their browser semantics. Host color changes are sampled after style updates and do not discard drafts.

### Migration from 1.3

Remove `output` and obsolete `delivery.mode`, `delivery.npmPackage`, `delivery.repositoryPath`, and `delivery.tagPrefix` keys. Use a supported host instead of `claude-artifact`, `module`, or a custom harness profile. The config schema rejects removed settings; it does not silently drop them or edit user files. Artifact database persistence, module wrapper output, and public-repository export tooling are removed. Legacy motion flags are accepted but ignored. Spec schemaVersion 1, feedback schemaVersion 1, and draftVersion 1.0.0 remain compatible.
