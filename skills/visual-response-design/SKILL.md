---
name: visual-response-design
description: Render reusable visual UI when interaction materially helps with substantial datasets, grouped comparisons, structured reviews, batch input, or complex explanations. Selectively invoke tables, cards, forms, Kanban, or flows in Codex, Claude, or any agent harness; skip simple answers and ordinary conversation.
metadata:
  short-description: Reusable visual UI hydrated from data, for any harness
---

# Visual Response Design

## When to invoke

Use model judgment. Invoke when visual structure or direct manipulation materially improves understanding or enables batch input: many comparable records, meaningful alternatives, multi-field input, staged work, or complex technical relationships. An explicit request for a visual or interactive view is a trigger.

Keep simple answers, small lists, ordinary conversation, and brief status updates in normal chat. Do not build UI merely because the skill is available.

When invoked, show an overview first, expandable detail, visible context and next action, and compact controls. Use one coherent surface; avoid duplicating its full content in chat.

## Render from data

One prebuilt renderer serves every harness. You write only a JSON spec; the renderer, theme, wording and harness bridge come from configuration. Requires Python 3.9+. Paths are relative to this file. Do not read the bundled JavaScript into model context.

1. **Know your harness.** Run `python3 <skill-dir>/scripts/doctor.py` once per session (or pass `--harness <id>`). It reports the detected harness, theme, delivery mode, where feedback lands, and any setup problem. Then read only your harness's reference:

   | Harness | `--harness` | Read |
   | --- | --- | --- |
   | Codex / ChatGPT widget host | `codex` | [codex.md](references/harness/codex.md) |
   | Claude app with an inline widget tool (`show_widget`) | `claude-inline` | [claude-inline.md](references/harness/claude-inline.md) |
   | Claude Artifact page | `claude-artifact` | [claude-artifact.md](references/harness/claude-artifact.md) |
   | Claude Code in a terminal, or any agent with a browser | `claude-code`, `browser-local` | [browser-local.md](references/harness/browser-local.md) |
   | Wrapper that builds its own page (MCP UI server, custom host) | `module` | [module.md](references/harness/module.md) |
   | Anything else | `static` | [static.md](references/harness/static.md) |

2. **Write a spec.** Include `schemaVersion:1`, a stable `viewId`, `view`, and `title`. Use the table below; read [renderer-contract.md](references/renderer-contract.md) only for additional fields or updates. `config/schema/spec.schema.json` is the machine-readable contract.
3. **Render.** `python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <output.html> [--harness <id>]`. The default `--format auto` picks inline or standalone from the view type, data size and the theme's sizes, and may hand off to the harness's standalone profile. It prints one JSON line with `format`, `placement` and `handoff`.
4. **Follow `handoff`.** It says exactly what to do next for your harness: show a `contentReference`, pass a file to `show_widget`, publish an artifact, or start `serve.py`. Never improvise a different path.

Use task-owned output paths. Preserve `viewId` for compatible updates; use a new ID for a different task or dataset. The UI drafts changes; it does not modify authoritative task data.

| View | Required content | Choose for |
| --- | --- | --- |
| `table` | `columns:[{key,label}]`, `rows:[{id,...}]` | Comparable records, sorting, filtering, pagination, selection, row comments, batch instructions |
| `cards` | `rows:[{id,title,summary}]` | Grouped alternatives with editable feedback and selection |
| `form` | `fields:[{id,label,type,value}]` | Prefilled input and editable multi-answer choices |
| `kanban` | `rows:[{id,title,stage}]`, optional `stages` | Reviewing work across stages |
| `flow` | `nodes:[{id,title,detail}]` | Sequential explanations; static by default |

Working examples are in `assets/examples/`. Run `scripts/render.py --catalog` to list views, harnesses and examples without reading source. The runtime supplies selection/deselection, drafts, reviewed state, undo, feedback previews, host submission, and copy/export fallback for every view.

Inline candidates by default: at most 3 table rows and 3 data columns, 2 cards, 3 compact form control units, 4 flow nodes (static or motion), or a board of up to 6 cards, and they must fit the estimated width and height. Treat the result as advice: you decide where a view belongs for this conversation, especially for boards and animated flows, and say so with spec `presentation` or `--format inline`/`standalone`. Limits, viewport and height budget come from configuration and the harness profile.

## Design system and configuration

Appearance comes from a **theme pack** (`theme.json` plus design rules), not from the renderer. The default theme is the `theme` set in `config/defaults.json`; when that pack isn't installed, the bundled `neutral` theme is used. An existing project's design system or an explicitly supplied brand wins.

Configuration merges, later winning: `config/defaults.json` → harness profile (`harnesses/<id>.json`) → user config (`$VISUAL_RESPONSE_CONFIG` or `~/.config/visual-response/config.json`) → project config (`.visual-response.json` at the repo root) → command-line flags → a spec's `appearance`. Run `render.py --print-config` to see each value and the layer it came from. Use configuration, never renderer edits, to change theme, appearance, wording (`copy`), inline limits, enabled views, or delivery. For hand-written UI that must match the theme, `render.py --theme-css theme.css` writes it as CSS variables.

## Cost and feedback

Generate only content and configuration. Use `dataFile` for existing JSON/CSV/TSV datasets and `--patch` for later record updates. Client-side sorting, filtering, paging, selection, expansion, editing, and playback cost no model turn. Every view has **Send to chat** (or the harness's save label) below its main content, plus Preview batch, Copy feedback, Export JSON and Undo. Submit deliberate batch feedback.

Where feedback lands depends on the harness: a new chat turn (Codex, Claude inline), a saved batch you read when asked (Claude artifact, `serve.py`), or a message the user pastes (static). Saving does not start an agent turn. Acknowledge actual received values; distinguish prepared, submitted, received, and applied states.

Keep motion for complex concepts or flows where animation clarifies sequence or change. `flow` with `motion:true` uses the bundled Remotion Player, starting paused. Routine tables, cards, forms, and boards stay static and interactive.

The built-in flow is sequential; arbitrary graphs and new Remotion compositions require another capability. Use other visualization tools only when shipped views cannot express the task, and say so. New renderer code is for a missing capability or an explicit design change, not each response.

## Adding a harness

Add `harnesses/<id>.json` (validated by `config/schema/harness.schema.json`) and, if the host has a bridge, an adapter script that defines `window.visualResponseHost`. No renderer rebuild is needed. See the adapter interface in [renderer-contract.md](references/renderer-contract.md#harness-adapters), then add a case to `scripts/test_adapters.mjs`.

## Maintenance

For code changes, read [ui-behavior.md](references/ui-behavior.md) and the build section of [renderer-contract.md](references/renderer-contract.md). After changes run `python3 scripts/test_renderer.py` and `node --test scripts/test_adapters.mjs`. To release a standalone public copy, run `scripts/export_public.py --out <empty-dir> --repository <owner/name>`. It uses the neutral theme, points Claude inline at the repository's own jsDelivr release tag, and refuses to finish while private names remain. Preserve content, caveats, and citations; verify changed behavior proportionately. Automatic invocation stays enabled with the selective trigger above.
