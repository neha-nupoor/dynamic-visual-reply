---
name: dynamic-visual-reply
description: Render the visual plan selected by response-design as tables, cards, forms, boards, or flows. Also handle direct requests for interactive reviews or read-only reports through the same routing policy.
metadata:
  short-description: Shared UI for reviews and read-only reports
---

# Dynamic Visual Reply

## Route once

Use the decision from `response-design`. For a direct request without a decision,
use that installed skill first; if unavailable, run `scripts/route.mjs --help` and
supply the described facts to the same engine. Authoring an already selected spec
or applying existing feedback does not require another routing decision. Preserve
explicit user choices. Read-only reports display facts; review mode collects drafts.

## Render

Author JSON specs; Node.js 22.20+ assembles the prebuilt Oat/Preact bundle with
native controls and scoped CSS. No package installation or public URL is needed.
Paths are relative to this skill. Keep the bundle unchanged during use.

1. Check actual tools and documented output contracts. A model/app name or
   environment variable is insufficient. Display and chat submission are separate
   capabilities. Read only the selected host guide:

   | Surface | Harness | Guide |
   | --- | --- | --- |
   | Documented visualize content-reference contract; no dedicated tool needed | `codex` | [Codex](references/harness/codex.md) |
   | Actual HTML/JavaScript widget tool and adequate payload limit | `claude-inline` | [Claude inline](references/harness/claude-inline.md) |
   | Commands and browser; includes Cursor, Windsurf, Gemini CLI, Copilot | `browser-local`, `claude-code` | [Browser](references/harness/browser-local.md) |
   | Offline HTML with copy/export | `static` | [Static](references/harness/static.md) |

   Without inline support, use an available browser when useful, otherwise Markdown.
   For uncertain setup, run `node scripts/doctor.mjs --harness <id>` once; it checks
   files/settings, not a live bridge. Claude Code differs from Claude inline.
2. Write `schemaVersion:1`, stable `viewId`, selected `view`, and `title`:

   | View | Data |
   | --- | --- |
   | table | `columns:[{key,label}]`, `rows:[{id,...}]` |
   | cards | `rows:[{id,title,summary}]` |
   | form | `fields:[{id,label,type,value}]` |
   | kanban | `rows:[{id,title,stage}]`, optional `stages` |
   | flow | `nodes:[{id,title,detail}]`; static, manual steps |

   Set `readOnly:true` for reports; omission/false retains review behavior.
   Read-only forms show labeled values. Keep IDs and peer structures stable.
   Front-load distinguishing words; use short, state-accurate actions and consistent
   terms. Preserve exceptions/evidence and comparable detail without invented facts
   or forced equal lengths.
3. Run `node scripts/render.mjs --spec <spec.json> --route <route.json> --out <view.html> --harness <id>`.
   The route enforces view/mode and prefers Codex inline for dense answers.
   Spec-only calls remain supported. For requested inline, use `--format inline`
   when supported; payload limits remain. Follow the handoff: emit the complete
   Codex `contentReference` on its own final-response line, pass the complete Claude
   fragment unchanged to its widget tool, or run the server command. Large views
   use the same browser renderer; never shorten content to force inline. Claude's
   full HTML handoff consumes context; use the browser when cost/limits require.

## Delivery and state

Keep the answer understandable in chat: summarize the contents and recommendation
without duplicating the full view. If rendering fails, provide all intended content
in Markdown; do not build another HTML renderer. Surrounding chat and captions use
Markdown; HTML belongs inside the widget.

Review supports batch submission, drafts, preview, copy/export and undo. UI edits
remain drafts; selection/instructions survive paging. Acknowledge only received
feedback. Claude Add to chat fills the composer; users press Enter. Browser
submission saves a file, read when the user resumes, without starting a turn.
Read-only loads/subscribes/saves no drafts or feedback; sorting, filtering, paging,
columns, details and flow navigation are local browsing only.

## Conditional details

- Existing JSON/CSV/TSV datasets, patches, extra fields, configuration or placement:
  [renderer contract](references/renderer-contract.md). Prefer `dataFile` and
  `--patch` over regenerating data. `--catalog` lists examples in `assets/examples/`.
- Appearance: preserve the configured theme/product design. Explicit spec/flag/
  project/user choices precede defaults (`host` for Claude inline, `system`
  elsewhere, OS fallback). Omit redundant appearance flags. Settings:
  `~/.config/dynamic-visual-reply/config.json` or `$DYNAMIC_VISUAL_REPLY_CONFIG`,
  and project `.dynamic-visual-reply.json`. Delivery stays in code.
- Requested Report Blue styling: [Report Blue kit](references/report-kit.md),
  CSS-only palettes, metrics, statuses, rows, legends and bars; no chart/timeline
  view or report engine is added. Use the visualization workflow for charts.
- Code changes: read [UI behavior](references/ui-behavior.md) and the renderer
  contract's maintenance section. Rebuild changed renderer/defaults, run
  `node --test scripts/test_renderer.mjs scripts/test_adapters.mjs`, and inspect
  changed interactions in a browser. Keep flows manual, CSS transitions brief and
  reduced-motion support intact. Mocked adapters do not prove live host delivery.

Writing guidance adapted from [Five Principles](https://fsdatalab.github.io/blog/agent-text-at-scale/).
