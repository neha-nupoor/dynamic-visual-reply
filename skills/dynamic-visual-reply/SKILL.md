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

Never let the view replace the answer. The chat reply must stand on its own: summarize what the view contains and what you recommend, so the user can answer in text and ignore the view. While a view works, do not repeat its full content in chat. If rendering is unavailable or fails, provide the intended content as an ordinary Markdown response so no information is stranded in the widget. Do not build a second HTML renderer as a fallback. Use Markdown for surrounding chat text and screenshot captions; do not wrap chat responses or images in raw HTML such as `<details>` or `<summary>`. Keep HTML inside the rendered widget file.

Choose the view by the response you expect: `table` for many comparable records, `cards` for a few alternatives, `form` for several questions, `kanban` for moving items between stages. Use `flow` only when each step needs its own response; a plain explanation of a sequence stays in chat. Many items usually exceed the inline limits and open as a full browser page; that is expected, so do not shrink content to force inline.

## Render from a spec

One prebuilt Oat/Preact renderer serves every host, with native HTML controls and scoped CSS inside the same bundle. Write content as JSON. Codex and browser handoffs use the generated file directly; Claude's string-based handoff is described below. Normal use requires Node.js 22.20+ and no package installation. Paths below are relative to this skill.

1. Inspect the current session's tools and documented output contracts before choosing a surface. Codex inline is available when session instructions document the `visualize` content-reference contract (for example through the installed visualize skill); it does not require a separate widget tool. Read that contract before using it. Other inline hosts require their actual widget tool and its current HTML/JavaScript support and payload limits. A model name, app name, or environment variable alone is not proof. Inline display and chat submission are separate capabilities; absent submission APIs do not prevent inline display. If inline rendering is unavailable, use the browser route when interaction is useful and local commands plus a browser are available; otherwise answer in normal Markdown. Run `node <skill-dir>/scripts/doctor.mjs --harness <id>` once when setup is uncertain. Its checks cover files and settings, not a live host bridge. Read only the relevant host reference:

   | Surface | Harness | Reference |
   | --- | --- | --- |
   | Codex inline | `codex` | [codex.md](references/harness/codex.md) |
   | Claude widget tool accepting inline HTML/JavaScript | `claude-inline` | [claude-inline.md](references/harness/claude-inline.md) |
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

3. Run `node <skill-dir>/scripts/render.mjs --spec <spec.json> --out <view.html> --harness <id>`. Every output embeds the same renderer and CSS; no public URL is needed. For an explicit inline request, use `--harness codex --format inline` when the Codex output contract is available; this overrides the automatic card-count/height thresholds while preserving the payload size check. Follow the returned `handoff`: emit the complete Codex `contentReference` unchanged on its own line in the final response, pass the complete generated Claude fragment unchanged to its widget tool, or run the local server command. Claude's string-based handoff includes the full bundle; use the browser route if the tool's payload limit cannot accommodate it. Larger Codex/Claude views use the same local browser. If rendering fails, return the intended answer in normal Markdown; other agents need no custom integration.

Examples are in `assets/examples/`; `--catalog` lists them. Read [renderer-contract.md](references/renderer-contract.md) for extra fields, existing datasets, patches, configuration, or maintenance. The schema defines valid input; the helper adds cross-record checks such as unique IDs.

## Preserve the interaction

Every view supports deliberate batch feedback, a primary submit action, draft state, preview, copy/export fallback, and undo. Keep IDs stable across compatible updates. UI changes are drafts; they do not change authoritative task data. Acknowledge only feedback actually received. In Claude, **Add to chat** fills the message box and the user presses Enter. Local browser feedback is saved to a file for the agent to read when asked.

Placement considers content size, available width, and theme sizes. Use `presentation` or `--format inline|standalone` when the conversation needs a different placement. For large tables, pagination keeps the displayed page manageable; selection and instructions survive page changes. Use `dataFile` for an existing JSON/CSV/TSV dataset and `--patch` for small updates instead of regenerating data.

## Appearance and cost

By default, follow the harness appearance: Claude inline uses `host`; other surfaces use `system` (host light/dark markers when exposed, otherwise OS preference). Honor explicit appearance settings in the spec, flags, project, or user config before this fallback. Do not add appearance flags just to enforce the default; use them for a requested override. Both palettes use the same renderer. Use the configured theme pack; preserve an existing product's design system. User settings live at `~/.config/dynamic-visual-reply/config.json` (or `$DYNAMIC_VISUAL_REPLY_CONFIG`); project settings live in `.dynamic-visual-reply.json`. Theme, appearance, copy, and placement limits are settings. Host delivery is fixed in code, with thin adapters for feedback and drafts.

Author only the spec; scripts assemble the prebuilt renderer. Do not regenerate or edit the bundle in a tool call. Claude's widget tool takes HTML as a string, so reading and passing its generated fragment uses model context; use a local browser when that cost or the tool limit makes inline delivery unsuitable. Browser interactions cost no model turn. Flows stay static with manual steps. Keep CSS transitions brief and honor reduced motion; no animation engine is included.

For code changes, read [ui-behavior.md](references/ui-behavior.md), rebuild the bundle, run `node --test scripts/test_renderer.mjs scripts/test_adapters.mjs`, and inspect the changed interactions in a browser. Do not claim live host submission is verified by mocked adapter tests.
