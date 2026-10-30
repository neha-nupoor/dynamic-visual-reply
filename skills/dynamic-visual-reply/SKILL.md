---
name: dynamic-visual-reply
description: Render interactive tables, cards, forms, boards, and flows when the user will likely respond to several separate items (approve, edit, choose, or instruct per item), so they can reply once with feedback tied to stable IDs instead of quoting or highlighting multiple places in chat. Keep one or two points, overall feedback, and prose in chat.
metadata:
  short-description: Shared UI for reviews and batch feedback
---

# Dynamic Visual Reply

## When to render

The purpose is per-item feedback. Render a view when you expect the user to respond to several separate places, so they reply once with instructions tied to stable IDs instead of quoting or highlighting each spot in chat. Do not render UI merely because the skill is available, or because a visual would look nicer than text.

Render only when all three hold:

1. There are three or more separate items, and the user will likely respond to each one differently.
2. Each item fits a record shape: a row, card, form field, board card, or step.
3. The user could not say what they want in one sentence.

Stay in chat when there are one or two points, when feedback will be overall ("make it shorter"), or when the content is prose that needs inline comments; use a document with comments for that instead. A comparison with nothing to respond to belongs in a markdown table. When the call is borderline, end the chat reply with a one-line offer, such as "Want a review view to mark these up?", instead of rendering. An explicit request for a view is always a trigger.

Never let the view replace the answer. The chat reply must stand on its own: summarize what the view contains and what you recommend, so the user can answer in text and ignore the view. Do not repeat the view's full content in chat.

Choose the view by the response you expect: `table` for many comparable records, `cards` for a few alternatives, `form` for several questions, `kanban` for moving items between stages. Use `flow` only when each step needs its own response; a plain explanation of a sequence stays in chat. Many items usually exceed the inline limits and open as a full browser page; that is expected, so do not shrink content to force inline.

## Render from a spec

One prebuilt Oat/Preact renderer serves every host, with native HTML controls and scoped CSS inside the same bundle. Write content as JSON; do not read the bundled JavaScript into model context. Normal use requires Python 3.9+ and no package installation. Paths below are relative to this skill.

1. Choose the available surface. Run `python3 <skill-dir>/scripts/doctor.py --harness <id>` once when setup is uncertain. Its checks cover files and settings, not a live host bridge. Read only the relevant host reference:

   | Surface | Harness | Reference |
   | --- | --- | --- |
   | Codex inline | `codex` | [codex.md](references/harness/codex.md) |
   | Claude widget tool with a verified matching bundle URL | `claude-inline` | [claude-inline.md](references/harness/claude-inline.md) |
   | Claude Code, Cursor, Windsurf, Gemini CLI, or another agent with a browser | `browser-local`, `claude-code` | [browser-local.md](references/harness/browser-local.md) |
   | HTML file without a bridge | `static` | [static.md](references/harness/static.md) |

2. Write a spec with `schemaVersion:1`, a stable `viewId`, `view`, and `title`:

   | View | Content |
   | --- | --- |
   | `table` | `columns:[{key,label}]`, `rows:[{id,...}]` |
   | `cards` | `rows:[{id,title,summary}]` |
   | `form` | `fields:[{id,label,type,value}]` |
   | `kanban` | `rows:[{id,title,stage}]`, optional `stages` |
   | `flow` | `nodes:[{id,title,detail}]`; manually selected steps |

3. Run `python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness <id>`. Follow the returned `handoff`: display the Codex `contentReference`, pass the small Claude loader to its widget tool, or run the local server command. Larger Codex/Claude views use the same local browser fallback. Use the browser fallback whenever a native widget tool or verified bundle URL is unavailable; a public URL is not required to use the skill. Other agents need no custom integration.

Examples are in `assets/examples/`; `--catalog` lists them. Read [renderer-contract.md](references/renderer-contract.md) for extra fields, existing datasets, patches, configuration, or maintenance. The schema defines valid input; Python adds cross-record checks such as unique IDs.

## Preserve the interaction

Every view supports deliberate batch feedback, a primary submit action, draft state, preview, copy/export fallback, and undo. Keep IDs stable across compatible updates. UI changes are drafts; they do not change authoritative task data. Acknowledge only feedback actually received. In Claude, **Add to chat** fills the message box and the user presses Enter. Local browser feedback is saved to a file for the agent to read when asked.

Placement considers content size, available width, and theme sizes. Use `presentation` or `--format inline|standalone` when the conversation needs a different placement. For large tables, pagination keeps the displayed page manageable; selection and instructions survive page changes. Use `dataFile` for an existing JSON/CSV/TSV dataset and `--patch` for small updates instead of regenerating data.

## Appearance and cost

By default, follow the harness appearance: Claude inline uses `host`; other surfaces use `system` (host light/dark markers when exposed, otherwise OS preference). Honor explicit appearance settings in the spec, flags, project, or user config before this fallback. Do not add appearance flags just to enforce the default; use them for a requested override. Both palettes use the same renderer. Use the configured theme pack; preserve an existing product's design system. User settings live at `~/.config/dynamic-visual-reply/config.json` (or `$DYNAMIC_VISUAL_REPLY_CONFIG`); project settings live in `.dynamic-visual-reply.json`. Theme, appearance, copy, and placement limits are settings. Host delivery is fixed in code, with thin adapters for feedback and drafts.

Generate only the spec and, when choosing Claude's optional URL loader, the small loader. Browser interactions cost no model turn. Flows stay static with manual steps. Keep CSS transitions brief and honor reduced motion; no animation engine is included.

For code changes, read [ui-behavior.md](references/ui-behavior.md), rebuild the bundle, run `scripts/test_renderer.py` and `node --test scripts/test_adapters.mjs`, and inspect the changed interactions in a browser. Do not claim live host submission is verified by mocked adapter tests.
