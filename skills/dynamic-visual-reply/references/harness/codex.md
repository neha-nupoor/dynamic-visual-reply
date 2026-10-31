# Codex / ChatGPT widget host

Adapter: `scripts/adapters/codex.js`. The existing inline rendering and feedback bridge are preserved; standalone views use the local browser.

## Availability

Use Codex inline when the current session documents the `visualize` content-reference output contract, including through an available visualize skill. Read that contract; do not require a dedicated widget tool. The app name or `CODEX_HOME` alone is insufficient. A Codex terminal without that output contract uses the browser route. Claude Code also uses the browser route; it is distinct from the Claude inline widget host.

## Render and hand off

```sh
node <skill-dir>/scripts/render.mjs --spec <spec.json> --out <view.html> --harness codex
```

- **Inline** (`handoff.type: "contentReference"`): the output embeds the full bundle, so it works offline. Put the returned `contentReference` verbatim on its own line in your final response, preserving its delimiter glyphs (`visualize{"path":"/absolute/path/view.html"}`). Plain `visualize{...}` text does not render a widget. Do not paste the HTML or wrap the reference in a Markdown link or code fence.
- **Standalone** (`handoff.type: "serve"`): run the returned `command` (it starts `serve.mjs` on loopback), open the printed URL in a browser panel, and keep the server alive while the user reviews.

For an explicit inline request, pass `--format inline`; automatic placement otherwise sends more than two cards or tall content to a browser. The override still enforces the inline payload limit. Save the fragment to the session's writable visualization directory, or its task-owned `work/` directory. Keep small demos compact; do not silently substitute browser placement for an explicit inline request.

## Feedback

- When available, inline **Send to chat** calls `window.openai.sendFollowUpMessage`, which starts your next turn with the JSON feedback envelope. Drafts persist through `setWidgetState` (best effort, about 15 KB) and are restored on `openai:set_globals`.
- Standalone **Submit answers** (forms) or **Submit instructions** writes `<view>.feedback.json` next to the page. The receipt asks the user to return to chat. It does not start a turn; read the file when the user asks you to continue. The server reports the path to the agent; the widget keeps filesystem details out of the user flow.
- Without `window.openai.sendFollowUpMessage` (including a partial host bridge), the page offers Prepare message, Copy and Export JSON. This does not prevent inline display. A failed submission reveals the same fallback. Do not claim feedback was received until it arrives in chat; generated fragments and mocked adapter tests cannot prove live host delivery.

## Setup

Codex reads this skill from the shared skill tree (`npx skills add … --agent codex`). If a theme pack ships an `AGENTS.md` instruction block that makes it your default, it lives in that pack.
