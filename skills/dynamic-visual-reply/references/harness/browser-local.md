# Local browser panel (`serve.py`)

Harnesses: `browser-local` (any agent that can run Python and open a browser) and `claude-code` (Claude Code in a terminal, detected from `CLAUDECODE`). Adapter: `scripts/adapters/browser.js`.

Use this route for Claude without its widget tool, or when inline payload limits make it unsuitable, and for Cursor, Windsurf, Gemini CLI, or any other agent that can run Python and open a browser. Every view is a standalone page with the same bundle embedded; no native integration or public URL is required. It works offline. Appearance defaults to `system`; a standalone browser page follows OS preference unless host light/dark markers are exposed. Explicit user/project appearance choices and requested overrides take priority.

## Render and serve

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness browser-local
```

Run the returned `handoff.command`. It starts `serve.py` on `127.0.0.1` with a free port and prints `{url, feedback}`. Open the URL with your browser or panel tool, or give it to the user. Keep the server running while they review, and stop it when done.

## Feedback

**Submit instructions** posts to `serve.py`, which atomically writes `<view>.feedback.json`. Saving does not start an agent turn. When the user asks you to continue, read that file and acknowledge what it contains. Opened as a plain `file://` page, the view falls back to Prepare message, Copy and Export JSON.
