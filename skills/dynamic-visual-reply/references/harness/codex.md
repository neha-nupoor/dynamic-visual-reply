# Codex / ChatGPT widget host

Adapter: `scripts/adapters/codex.js`. The existing inline rendering and feedback bridge are preserved; standalone views use the local browser.

## Render and hand off

```sh
node <skill-dir>/scripts/render.mjs --spec <spec.json> --out <view.html> --harness codex
```

- **Inline** (`handoff.type: "contentReference"`): the output embeds the full bundle, so it works offline. Put the returned `contentReference` verbatim on its own line in your final response, preserving its delimiter glyphs (`visualize{"path":"/absolute/path/view.html"}`). Plain `visualize{...}` text does not render a widget. Do not paste the HTML or wrap the reference in a Markdown link or code fence.
- **Standalone** (`handoff.type: "serve"`): run the returned `command` (it starts `serve.mjs` on loopback), open the printed URL in a browser panel, and keep the server alive while the user reviews.

## Feedback

- Inline **Send to chat** calls `window.openai.sendFollowUpMessage`, which starts your next turn with the JSON feedback envelope. Drafts persist through `setWidgetState` (best effort, about 15 KB) and are restored on `openai:set_globals`.
- Standalone **Submit answers** (forms) or **Submit instructions** writes `<view>.feedback.json` next to the page. The receipt asks the user to return to chat. It does not start a turn; read the file when the user asks you to continue. The server reports the path to the agent; the widget keeps filesystem details out of the user flow.
- Without `window.openai` (for example a file opened directly), the page offers Prepare message, Copy and Export JSON.

## Setup

Codex reads this skill from the shared skill tree (`npx skills add … --agent codex`). If a theme pack ships an `AGENTS.md` instruction block that makes it your default, it lives in that pack.
