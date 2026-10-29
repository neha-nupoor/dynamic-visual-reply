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

Codex inline embeds the bundle and returns the existing `contentReference`. Claude inline references the same version-pinned bundle by URL and returns a small loader for `show_widget`. Larger views in either host use `serve.py` and save feedback locally. Terminal agents use `browser-local` or `claude-code`; `static` produces an offline HTML file with copy/export. Host routing is fixed; no configurable backend graph is used.

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

Settings cover theme/fallback, appearance, harness, enabled views, placement, feedback prompts/message format, copy, and the pinned Claude renderer URL. `feedback.messageFormat` is `json`, `compact`, or `summary` (a readable line followed by JSON). `copy` can override selected labels/status messages. Claude's default button is **Add to chat**, with a status asking the user to press Enter.

The opt-in `--theme base-web` preset uses monochrome actions, square card surfaces, 8 px controls, and labels above filled fields; see [its reference notes](../themes/base-web/reference.md).

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

The manifest pins bundle version, SHA-256, SRI, bytes, adapters, and draftVersion. Rebuild after renderer/default changes. Bump draftVersion only for incompatible saved drafts. Before releasing, tag the matching commit `v<version>`; Claude's default jsDelivr URL uses that tag. A draft PR build has no published tag yet: use a temporary matching test URL for browser verification, and do not overwrite an old release tag. Keep third-party notices with the bundle. Mocked tests do not prove live host APIs; verify actual submission separately when available.
