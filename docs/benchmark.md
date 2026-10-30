# Widget generation benchmark

A dedicated Codex session authored the five committed [demo specs](examples/) and invoked the existing renderer. It generated JSON data and file references; it did not regenerate or read the renderer implementation.

The measured run used **GPT-6 Astra, high reasoning**, on **October 30, 2026**. The first display attempt exposed a content-reference formatting bug. Later turns verified real native feedback and prepared the recording. The figures include those turns.

| Measure | Recorded value |
| --- | ---: |
| Widget specs authored | 5 |
| Output tokens in the spec-authoring turn, including reasoning | **988** |
| Additional output tokens to correct inline presentation | 351 |
| Authoring + display correction, input and output | 355,967 |
| Full session model output tokens | **2,967** |
| Full session model input tokens | 1,113,678 |
| Input tokens served from cache (included above) | 1,059,200 |
| Uncached input tokens | 54,478 |
| Reasoning output tokens (included in output above) | 177 |
| Full session input + output tokens | **1,116,645** |
| Model API calls | 17 |
| Shared renderer during initial authoring | 82,012 bytes |
| Current renderer after the native text-color fix | 82,111 bytes |

The small generated output is the useful result: five specs from 988 output tokens, with the existing renderer supplying controls, appearance, drafts, and feedback. **988 is not the total token cost.** Harness instructions, skill reads, tool definitions, and repeated context account for the input shown above. The first two turns used 1,339 output tokens; the remaining five turns used 1,628. The initial turn took 30.838 seconds; the presentation correction took another 8.839 seconds, excluding time between turns.

## What the widgets provide

The table lets a user select items, attach instructions to stable IDs, and prepare one structured feedback message. Forms collect several answers together; cards, boards, and flows reuse the same feedback mechanism.

The [native Codex recording](media/codex-inline-demo.gif) shows per-step note entry and the **Send to chat** button. Real submitted flow feedback reached the demo agent with instructions for all three stable IDs. The clip ends before the final receipt; receipt verification used the saved feedback and the agent's next turn. Claude was checked with browser bridge doubles, not a native Claude session.

This is a capability demonstration, not a measured usability improvement. No user study, completion-time comparison, error-rate comparison, or controlled prose/handwritten-HTML token baseline was performed. No percentage savings is claimed.

## Reproduce

The [measurement JSON](benchmark.json) contains aggregate usage and spec hashes. Generate local previews with `node benchmarks/render-demo.mjs /tmp/dynamic-visual-reply-preview`; its simulated bridge is explicitly labeled and is not native Codex submission evidence.

To measure a new dedicated Codex demo session, use the five inputs in `docs/examples/`, then run:

```sh
node benchmarks/measure.mjs \
  --session-log /path/to/your/rollout.jsonl \
  --out /tmp/widget-benchmark.json
```

The script sums per-response `token_usage_record` entries, checks each turn against cumulative usage, and exports counters, model metadata, public spec sizes/hashes, and the current renderer build. It does not export prompts or conversation contents. Additional follow-up turns appear separately in the JSON. The renderer build at export can differ from the one used for the initial authoring; the native recording exposed a small CSS fix during this session.

Cached tokens are included in input counts, and reasoning tokens are included in output counts; do not add them a second time. See [OpenAI’s token usage definitions](https://developers.openai.com/api/docs/guides/agents-api/observability).

These figures cover the recorded demo session only. They exclude developing the skill, the Node migration, media capture, and this document. Different prompts, harness instructions, models, caching, and tool loops change the result. Claude’s string-based inline delivery includes the full bundle, unlike Codex’s file references, so this result must not be generalized to Claude.
