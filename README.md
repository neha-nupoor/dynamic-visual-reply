# reply-ui

An agent skill that renders interactive UI in an AI agent's response: tables, cards, forms, Kanban
boards and flows, with batch feedback that goes back to the agent. One prebuilt renderer works in
Codex, Claude, and any harness that can run Python; the agent writes only a small JSON spec.

## Install

```bash
npx skills add neha-nupoor/reply-ui -g --agent codex claude-code cursor --skill visual-response-design -y
```

Then, inside the agent, run `python3 <skill-dir>/scripts/doctor.py` to see which harness was
detected and where feedback will land.

## Where it renders

| Harness | How it shows | How feedback returns |
| --- | --- | --- |
| Codex / ChatGPT widget host | Inline via `contentReference`; larger views in a local browser panel | `window.openai.sendFollowUpMessage`, or a saved file |
| Claude app (inline widget) | Inline; the renderer loads from this repository's release on jsDelivr | `sendPrompt()` starts the next turn |
| Claude artifact | A private artifact page (needs an npm-published renderer URL) | Saved to the artifact's database |
| Claude Code in a terminal, Cursor, other agents | A local browser page served by `serve.py` | A saved `.feedback.json` |
| Anything else | A static HTML file | Copy or export the message |

New harnesses need a profile JSON and a short adapter script, not a renderer rebuild. See
`skills/visual-response-design/SKILL.md`.

## Configure

Settings merge from `config/defaults.json`, the harness profile, `~/.config/visual-response/config.json`,
a project's `.visual-response.json`, then command-line flags. Themes are separate packs: put a
`theme.json` (see `config/schema/theme.schema.json`) in a folder and set `"theme"` to its name or path.

## Release

1. Build the renderer: `cd skills/visual-response-design/assets/renderer && npm ci --ignore-scripts && npm run build`.
2. Run `python3 skills/visual-response-design/scripts/test_renderer.py` and `node --test skills/visual-response-design/scripts/test_adapters.mjs`.
3. Commit, then tag the commit `v<version>` from `assets/renderer/dist/manifest.json` and push the tag.
   jsDelivr serves the bundle at that tag, and `doctor.py --check-url` confirms it matches.

## License

MIT. The bundled renderer includes React, MUI, Emotion and Remotion; their notices are in `skills/visual-response-design/assets/renderer/dist/THIRD_PARTY_NOTICES.txt`.
