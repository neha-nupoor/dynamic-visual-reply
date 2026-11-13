# Local browser panel (`serve.mjs`)

Harnesses: `browser-local` (Codex views too large for inline) and `claude-code` (Claude Code in a terminal or the desktop app's Code tab, detected from `CLAUDECODE`). Adapter: `scripts/adapters/browser.js`.

Use this route for Claude Code and for Codex views too large for inline. Every view is a standalone page with the same bundle embedded; no native integration or public URL is required. It works offline. Appearance defaults to `system`; a standalone browser page follows OS preference unless host light/dark markers are exposed. Explicit user/project appearance choices and requested overrides take priority.

## Render and serve

```sh
node <skill-dir>/scripts/render.mjs --spec <spec.json> --out <view.html> --harness <claude-code|browser-local>
```

Run the returned `handoff.command`. It starts `serve.mjs` on `127.0.0.1` with a free port and prints `{url, feedback}`. Open the URL with your browser or panel tool, or give it to the user. Keep the server running while they review, and stop it when done.

## Feedback

**Submit instructions** posts to `serve.mjs`, which atomically writes `<view>.feedback.json`. Saving does not start an agent turn. When the user asks you to continue, read that file and acknowledge what it contains. Opened as a plain `file://` page, the view falls back to Prepare message, Copy and Export JSON.

## Wake on submit

If the host notifies you when a background command exits (Claude Code `run_in_background`, or the equivalent in other agents), append `--once` to `handoff.command` and run it in the background. After the first saved submission it prints `{"event":"submitted","feedback":"<path>"}` and exits 0; that exit wakes you, so read the feedback file and continue without waiting for the user. Optional `--timeout <seconds>` exits 3 with `{"event":"timeout",...}` if nothing arrives. Without such notification, use the flow above.

## Claude Code

- Route with `inline:false`: read-only reports stay in Markdown; per-item reviews open this page.
- Always run `handoff.command` with `--once` in the background (`run_in_background`); the exit wakes you with the feedback path. Add `--timeout` if the user may walk away.
- Open the printed URL in the desktop app's browser pane when one exists; in a terminal, give the user the URL.
- Optional install: `/plugin marketplace add neha-nupoor/dynamic-visual-reply`, then `/plugin install dynamic-visual-reply@dynamic-visual-reply`.

Headless runs (`claude -p`): use `--once` or `--timeout`, or a background server keeps the run open.
