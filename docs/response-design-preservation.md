# Compaction coverage

The unchanged-runtime statement below covers routing commit `756dc30`. The
subsequent PR #11 integration and header fix are documented separately in
[PR integration and examples](pr11-integration-and-examples.md).

Baseline: main commit `8da82a8`, 1,708 words in the old visual skill entrypoint.
Runtime bundle, CSS, adapter implementations, schemas, configuration defaults,
examples, draft keys and feedback formats are unchanged.

| Existing behavior | Authoritative location after compaction | Verification |
| --- | --- | --- |
| Explicit formats override automatic UI | route.mjs format precedence, including other requested formats | text/Markdown/document/other overrides in routing cases |
| Explicit supported views bypass thresholds | route.mjs explicit view branch | explicit one-item view cases |
| Review needs 3+ supported records, separate feedback, no single-sentence reply | route.mjs review predicate | below/at threshold, overall/single-reply/missing-shape cases |
| Read-only requested reports | route.mjs report branch; unchanged renderer readOnly mode | supported/unsupported report cases; browser read-only checks |
| Density: 15 table rows; 2+ tables totaling 10; 500 words and 6 records | route.mjs LIMITS and density predicate | below/at each boundary and narrative exclusion |
| Borderline offer; small comparisons and overall feedback stay in chat | route.mjs ordinary-answer branch | borderline/small/overall cases |
| Prose comments use documents; charts/timelines use visualization workflow | router entrypoint; route.mjs explicit formats/proseComments | document/chart cases and paired live prompts |
| Table/cards/form/kanban/flow choices | route.mjs fixed profiles; explicit view preserved | all views across five adapter IDs; layout geometry checks |
| Standalone rendering installation | engine ships with renderer; renderer entrypoint fallback | packaged helper with no npm install; direct spec API suite |
| Standalone chat summary, Markdown failure fallback, no second renderer | compact renderer Delivery section | instruction coverage review; actual host failure remains host-specific |
| Distinguishing labels, stable peer structures, terms, exceptions and evidence | compact renderer spec-writing step; original attribution retained | instruction coverage review |
| Real display capability check; inline distinct from submit; documented Codex content reference | compact renderer host table and existing host guides | adapter/placement/handoff suite; native submit not inferred |
| Direct spec, datasets, patches, unique IDs, schema checks | unchanged APIs; compact entrypoint's conditional contract pointer | existing data/schema/patch/CLI tests |
| Dense Codex and requested inline; payload fallback; no shrinking data | route preference and existing renderer payload guards; host guides | route CLI placement/oversize checks and existing placement tests |
| Stable IDs, drafts, preview/copy/export/undo, pagination, truthful feedback receipt | compact renderer Delivery section; unchanged components/host guides | existing adapter/browser tests; 100 new layout/interaction checks |
| Read-only never restores/saves/submits drafts; browsing stays local; form preserves false/zero | compact renderer Delivery section and existing UI behavior guide | existing read-only browser checks and native adapter spies |
| Theme precedence, host/system defaults, optional Report Blue, original product theme | compact renderer conditional details; unchanged theme/config code | existing appearance/Report Blue/theme tests |
| Node built-ins, prebuilt Oat/Preact, Claude HTML context cost, manual flows/reduced motion | compact renderer common steps, host guides and UI behavior guide | unchanged bundle hash; existing packaging tests; instruction review |
| Maintenance rebuild, appropriate checks, browser verification, no native claim from mocks | compact renderer maintenance pointer | this change's verification report |

One former qualitative choice is now explicit for reproducibility: "a few"
alternatives means up to four cards; five or more use a table. Explicit view
requests still win. The user's follow-up also enables meaningful proactive visuals below density
thresholds and agent-designed custom layouts when the five shared views cannot
express the needed interaction. These are explicit extensions, tested separately
from preservation of the previous thresholds. Explicit text still wins.
No functionality was removed to reach the instruction budget.
Behavioral equivalence of model interpretation is bounded by the reported evals,
not guaranteed by document length or unchanged runtime bytes.
