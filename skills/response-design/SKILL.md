---
name: response-design
description: Choose text, a document, a visualization, or a consistent visual-reply layout before drafting comparisons, reports, questions, or item reviews. Use when a reply presents 3+ comparable items, records, questions or steps, or a visual/interactive review is requested.
---

# Response Design

Choose the format before drafting; confirm it after gathering evidence. Clear
short prose stays in chat without tools. Keep the decision internal. Explicit
user formats win. Language and appearance remain with the user's style/design
rules.

Before writing long text, consider whether a visual would clarify relationships,
support exploration, or make decisions/actions easier. Prefer a useful visual when
it does; set `visualBenefit:true`. Length or decoration alone is insufficient.

For structured or borderline replies, locate the installed `dynamic-visual-reply`
skill (normally a sibling folder). Its shared engine owns routing, including
standalone renderer invocation. If unavailable, provide usable Markdown.

1. Write request/answer facts:

   ```json
   {"intent":"compare","items":4,"recordLike":true,"feedback":"per-item","singleReply":false}
   ```

   `intent`: explain, compare, questions, stages, steps, records. `feedback`: none,
   overall, per-item. `singleReply`: can one sentence cover the user's response?
   Optional: requested `format`/`view`, `visualReport`, `proseComments`, `tableRows`
   (planned row counts), `words`, `borderline`. Counts describe the planned answer;
   narrative length alone does not establish records. Charts/timelines use
   `format:"visualization"`; inline prose comments use `proseComments:true`.
   Mark uncertain reviews `borderline:true`; preserve unknowns. `inline`: false in
   Claude Code; true in the Codex app.
   When existing views cannot express the needed interaction, set `customLayout:true`
   and explain why in `customReason`. An explicit custom request uses `format:"custom"`.
2. Run `node <visual-skill>/scripts/route.mjs --facts <facts.json> --out <route.json>`.
   Read `--help` only for exact thresholds, formats, defaults or precedence.
3. Follow `target`. For `visual`, load `dynamic-visual-reply` and pass
   `--route <route.json>` to its renderer without deciding again. Other targets
   use the requested/document/visualization workflow, with Markdown fallback.
   `offerReview:true` means a one-line visual-view offer in chat. Keep the answer understandable
   without a view. Preserve field/column/stage/item order for compatible updates.

For `custom-visual`, agents may design their own layout. Read
[custom visuals](references/custom-visuals.md) only on that path. Standard profiles
are reusable defaults, not a restriction on the host's UI capabilities.

Setup or maintenance only: [integration guide](references/setup.md).
