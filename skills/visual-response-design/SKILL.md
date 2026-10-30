---
name: visual-response-design
description: Render interactive tables, cards, forms, boards, and sequential flows when visual structure or batch feedback materially helps. Use one shared renderer across Codex, Claude, and local browser views; keep simple answers in chat.
metadata:
  short-description: Shared UI for reviews and batch feedback
---

# Visual Response Design

Use UI when it helps compare records, review alternatives, collect multiple answers, or explain a sequence. Keep simple replies in normal chat.

## Render from a spec

One prebuilt Oat/Preact renderer serves every host, with native HTML controls and scoped CSS inside the same bundle. Write content as JSON; do not read the bundled JavaScript into model context. Normal use requires Python 3.9+ and no package installation. Paths below are relative to this skill.

1. Choose the available surface. Run `python3 <skill-dir>/scripts/doctor.py --harness <id>` once when setup is uncertain. Its checks cover files and settings, not a live host bridge. Read only the relevant host reference:

   | Surface | Harness | Reference |
   | --- | --- | --- |
   | Codex inline | `codex` | [codex.md](references/harness/codex.md) |
   | Claude widget tool | `claude-inline` | [claude-inline.md](references/harness/claude-inline.md) |
   | Browser panel or terminal agent | `browser-local`, `claude-code` | [browser-local.md](references/harness/browser-local.md) |
   | HTML file without a bridge | `static` | [static.md](references/harness/static.md) |

2. Write a spec with `schemaVersion:1`, a stable `viewId`, `view`, and `title`:

   | View | Content |
   | --- | --- |
   | `table` | `columns:[{key,label}]`, `rows:[{id,...}]` |
   | `cards` | `rows:[{id,title,summary}]` |
   | `form` | `fields:[{id,label,type,value}]` |
   | `kanban` | `rows:[{id,title,stage}]`, optional `stages` |
   | `flow` | `nodes:[{id,title,detail}]`; manually selected steps |

3. Run `python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness <id>`. Follow the returned `handoff`: display the Codex `contentReference`, pass the small Claude loader to its widget tool, or run the local server command. Larger Codex/Claude views use the same local browser fallback. Other agents can use that fallback without a custom integration.

Examples are in `assets/examples/`; `--catalog` lists them. Read [renderer-contract.md](references/renderer-contract.md) for extra fields, existing datasets, patches, configuration, or maintenance. The schema defines valid input; Python adds cross-record checks such as unique IDs.

## Preserve the interaction

Every view supports deliberate batch feedback, a primary submit action, draft state, preview, copy/export fallback, and undo. Keep IDs stable across compatible updates. UI changes are drafts; they do not change authoritative task data. Acknowledge only feedback actually received. In Claude, **Add to chat** fills the message box and the user presses Enter. Local browser feedback is saved to a file for the agent to read when asked.

Placement considers content size, available width, and theme sizes. Use `presentation` or `--format inline|standalone` when the conversation needs a different placement. For large tables, pagination keeps the displayed page manageable; selection and instructions survive page changes. Use `dataFile` for an existing JSON/CSV/TSV dataset and `--patch` for small updates instead of regenerating data.

## Appearance and cost

Light is the default. Use `--appearance dark` for dark mode or `--appearance system` to follow host/OS preference. Both palettes use the same renderer. Use the configured theme pack; preserve an existing product's design system. User settings live at `~/.config/visual-response/config.json` (or `$VISUAL_RESPONSE_CONFIG`); project settings live in `.visual-response.json`. Theme, appearance, copy, and placement limits are settings. Host delivery is fixed in code, with thin adapters for feedback and drafts.

Generate only the spec and, for Claude, the small loader. Browser interactions cost no model turn. Flows stay static with manual steps. Keep CSS transitions brief and honor reduced motion; no animation engine is included.

For code changes, read [ui-behavior.md](references/ui-behavior.md), rebuild the bundle, run `scripts/test_renderer.py` and `node --test scripts/test_adapters.mjs`, and inspect the changed interactions in a browser. Do not claim live host submission is verified by mocked adapter tests.
