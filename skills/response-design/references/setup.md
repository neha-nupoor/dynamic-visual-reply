# Setup and verification

Install both skills from this repository; include the entire folders:

```sh
npx skills add neha-nupoor/dynamic-visual-reply --skill response-design --skill dynamic-visual-reply
```

Use your installer's supported agent/global options. Resolve the installed visual
skill by name if an agent uses separate directories rather than sibling folders.
The routing executable ships with the visual skill so renderer-only installations
can use the identical policy. It has no runtime packages or model calls.

## Persistent entry rule

Add this short opt-in rule to the host's existing instructions:

> When a reply will present 3+ comparable items, records, questions or steps, or
> the user asks for a visual/interactive review, use response-design to choose the
> format. Pass `inline:false` in Claude Code, Cursor and terminal CLIs; `inline:true`
> in the Codex app and Claude widget hosts. Honor explicit user format requests.

Other replies skip the router entirely. `inline:false` keeps automatic read-only
views in Markdown with a one-line offer instead of opening a browser tab.

Codex: user/project `AGENTS.md`. Claude Code: user/project `CLAUDE.md`.
Cursor: User Rules or `.cursor/rules/response-design.mdc` with `alwaysApply: true`.
Windsurf: its global rules or an always-on workspace rule. Gemini CLI: `GEMINI.md`.
Copilot: `.github/copilot-instructions.md` where supported. Verify the rule is
loaded on the actual host; discovery of SKILL.md alone is not guaranteed activation.
Replace existing ADHD/design-system pointers that bypass routing with a pointer
to response-design. Preserve their language, clarification, and appearance rules.

## Policy and profiles

`dynamic-visual-reply/scripts/route.mjs` owns the precedence, thresholds and profile
mapping. Run `--help` for the compact input contract. Supply semantic facts from
the request and planned answer; host branding is not an input. This is deterministic
routing after classification, not a guarantee that different models classify prose
identically. Missing evidence stays conservative. Explicit text, document and
visualization requests win; requested visual views bypass automatic thresholds.

Profiles use the existing five view components, with IDs `<view>-v1`; no new renderer
or opinionated domain columns are introduced. The existing "few alternatives"
choice is now explicit: up to four use cards, otherwise a table. Preserve supplied
field/column/stage order for repeated tasks. Spec validation and `--route` reject a
different view/mode. Host adapters may change placement and submission wording,
not the chosen profile. Compare layouts at the same theme, width and appearance;
host/system appearance can intentionally differ. Existing spec-only rendering,
patches, datasets, all five views, and feedback/draft contracts stay supported.

## Custom and proactive replies

Before composing long text, assess whether a visual would materially clarify
relationships, support exploration or reduce decision effort. `visualBenefit:true`
allows proactive UI below the automatic density thresholds; narrative length
alone remains insufficient. Supported records use the shared layouts. Non-record
explanations can use the visualization workflow. Explicit text formats still win.

Agents may set `customLayout:true` with a concrete `customReason` when shared views
cannot express the needed interaction, or honor an explicit `format:"custom"`/
`view:"custom"` request. The resulting `custom-visual` target goes to the host's
supported UI/artifact workflow, not the fixed renderer. Load custom-visuals.md only
on this path. Reuse successful custom layouts on repeated tasks. Standard profile
checks enforce the chosen standard plan; they do not restrict other UI workflows.

## Verify without inflating normal replies

From the repository root:

```sh
node --test skills/dynamic-visual-reply/scripts/test_renderer.mjs skills/dynamic-visual-reply/scripts/test_adapters.mjs skills/dynamic-visual-reply/scripts/test_serve.mjs tests/test_response_design.mjs
node tests/response_design_browser_fixtures.mjs /tmp/response-design-fixtures
```

Serve the fixture directory on loopback and run `tests/response_design_browser_checks.js`
with the browser automation tool. It compares layout geometry and local browsing
across all adapter IDs at desktop/mobile widths in both modes. Host bridges are
simulated. Test native submission separately; browser fixtures cannot prove it.

Optional bounded language-to-facts checks use `tests/live_routing_eval.mjs` with
`--harness codex|claude-code --out <report.json>` and the installed authenticated
CLI. They isolate policy comprehension; they do not prove automatic discovery or
live UI submission. Unavailable hosts are untested, never inferred from adapters.
Do not run these paid/subscription checks on ordinary replies.

For token measurement, count both entrypoints and every reference loaded on that
path (including route help if read). Template assets and executed scripts do not
enter model context unless read. Claude inline's full generated HTML still does.
Loaded instructions may remain in later context. Keep counters/reports in tests,
not the user-facing reply, and recheck after changes.
