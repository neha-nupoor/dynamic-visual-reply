# Local browser panel (`serve.py`)

Harnesses: `browser-local` (any agent that can run Python and open a browser) and `claude-code` (Claude Code in a terminal, detected from `CLAUDECODE`). Adapter: `harnesses/browser-local.js`.

A terminal can't draw UI inside the conversation, so every view is a standalone page with the bundle embedded. It works offline.

## Render and serve

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness browser-local
```

Run the returned `handoff.command`. It starts `serve.py` on `127.0.0.1` with a free port and prints `{url, feedback}`. Open the URL with your browser or panel tool, or give it to the user. Keep the server running while they review, and stop it when done.

## Feedback

**Submit instructions** posts to `serve.py`, which atomically writes `<view>.feedback.json`. Saving does not start an agent turn. When the user asks you to continue, read that file and acknowledge what it contains. Opened as a plain `file://` page, the view falls back to Prepare message, Copy and Export JSON.
