# Response design verification — November 3, 2026

This records the original routing commit `756dc30`. For the current combination
with PR #11, table-header repair and live examples, see
[PR integration and examples](pr11-integration-and-examples.md).

Response-design selects the response format before drafting. Shared views use a
saved route, and `render.mjs --route` enforces its view/mode. Agents may instead
choose custom-visual and design a layout through supported host UI tools when
existing views cannot express the needed interaction. Meaningful visual benefit
can trigger a visual before an answer reaches the old density thresholds.
Explicit text requests retain priority.

## Instruction budget

Measured with tiktoken 0.9.0 / o200k_base against main commit `8da82a8`.

| Loaded text | Tokens |
| --- | ---: |
| Previous visual skill entrypoint | 2,420 |
| New response-design entrypoint | 586 |
| Compacted visual skill entrypoint | 1,261 |
| Both new entrypoints | 1,847 |
| Persistent entry rule | 41 |
| Optional routing help | 428 |
| Optional custom-layout reference | 347 |
| Previous Codex entrypoint + host guide | 3,068 |
| Both new entrypoints + same Codex guide | 2,495 |
| Same new path when route help is also read | 2,923 |

The combined core is 24% fewer tokens (40% fewer words: 1,028 versus 1,708), while
adding the router and custom/proactive path. The 41-token persistent pointer is
additional. Loading the full router costs 586 tokens, not 41. Once loaded,
instructions can remain in later context. References and help count whenever
read; moving text into a reference alone is not a saving. The custom path also
incurs generated UI code/content and host delivery costs. These text counts do
not measure reasoning, tool envelopes, generated facts/specs, total consumption,
or billing. The earlier conversational token ranges were estimates; these are
actual counts for this tokenizer.

Reproduce:

```sh
uv run --with tiktoken==0.9.0 python tests/measure_instructions.py
```

Token counting is optional developer tooling; normal use remains Node-only with
no package installation. Full measurements: [token-counts.json](verification/response-design/token-counts.json).

## Checks and limits

| Check | Result | What it establishes |
| --- | --- | --- |
| Existing renderer/adapter + routing tests | 87 passed | Existing contracts, all routing boundaries/overrides, custom/proactive routes, profile/mode checks, payload fallback |
| Shared-profile rendering | 50 combinations within Node suite | Five views × two modes × five adapter IDs keep data/order, runtime bytes, theme and state keys |
| Browser layout + interactions | 100 passed | Those 50 combinations at 680px and 390px match content geometry/text; simulated review submission and paging work |
| Existing read-only browser checks | Passed | No draft/save/submission calls, local browsing, zero/false/unknown values and review restoration |
| Visual inspection | Passed | Desktop review cards and mobile read-only form remain readable |
| Codex policy comprehension | 24/24 passed | Natural-language cases and paraphrases produce expected routes, including custom UI and explicit text overrides |
| Claude Code policy comprehension | Unavailable | Installed CLI is signed out; no model request succeeded |
| Skill manifests and doctor | Both new/compacted manifests valid; doctor passed | Local package/config/theme integrity, not live host APIs |

The Codex check supplies the skill and engine contract to an isolated CLI session;
it tests comprehension after loading, not automatic skill discovery. It performs
no UI work and grants no tools. Native Claude inline/Code submission and other
hosts' model behavior were not verified. Cursor/Gemini/Windsurf/Copilot can use the
browser route when supported; their native agents were not exercised in this run. Browser fixtures deliberately use host doubles. Custom views
are intentionally free-form and are not claimed to match shared-profile geometry;
their actual layout/interaction must be checked when authored.

Evidence: [Codex](verification/response-design/codex-policy.json),
[Claude availability](verification/response-design/claude-policy.json),
[browser results](verification/response-design/browser-checks.json).
Commands and the host entry rule are in the
[setup guide](../skills/response-design/references/setup.md).
The [coverage map](response-design-preservation.md) accounts for the previous
entrypoint's requirements. The checked-in runtime/CSS/adapters are unchanged.

## Local rollout

Both skills were installed in the shared local skill tree, with Claude/Cursor
discovery links. Codex and Claude persistent instructions point to response-design.
The installed ADHD skill now delegates format selection, including custom visuals,
without changing language/clarification behavior. Its portable patch is
[adhd-response-design.patch](adhd-response-design.patch). Other hosts can use the
setup guide's short entry rule; global activation there was not claimed or tested.
Local files were backed up before replacement. User theme/configuration and the
existing renderer bundle were preserved by this rollout. A concurrent card-layout
change subsequently updated the installed renderer. It was retained, and a separate
installed-copy smoke check verified our routing hook and custom route still work.
The instruction counts, geometry tests and unchanged-runtime claim above refer to
this PR's source, not the concurrent renderer work.
