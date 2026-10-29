# Codex / ChatGPT widget host

Profile: `harnesses/codex.json` · adapter: `harnesses/codex.js` · standalone views switch to `browser-local`.

## Render and hand off

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness codex
```

- **Inline** (`handoff.type: "contentReference"`): the output embeds the full bundle, so it works offline. Put the returned `contentReference` in your final response. Do not paste the HTML.
- **Standalone** (`handoff.type: "serve"`): run the returned `command` (it starts `serve.py` on loopback), open the printed URL in a browser panel, and keep the server alive while the user reviews.

## Feedback

- Inline **Send to chat** calls `window.openai.sendFollowUpMessage`, which starts your next turn with the JSON feedback envelope. Drafts persist through `setWidgetState` (best effort, about 15 KB) and are restored on `openai:set_globals`.
- Standalone **Save feedback** writes `<view>.feedback.json` next to the page. It does not start a turn; read the file when the user asks you to continue.
- Without `window.openai` (for example a file opened directly), the page offers Prepare message, Copy and Export JSON.

## Setup

Codex reads this skill from the shared skill tree (`npx skills add … --agent codex`). If a theme pack ships an `AGENTS.md` instruction block that makes it your default, it lives in that pack.
