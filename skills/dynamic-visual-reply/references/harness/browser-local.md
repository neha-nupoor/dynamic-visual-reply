# Local browser page (`serve.mjs`)

Harness: `browser-local`. Adapter: `scripts/adapters/browser.js`.

This is the Codex fallback. Use it for views too large for inline (the renderer switches automatically and reports `result.switched`) and in a Codex terminal, which cannot show inline widgets. Every view is a standalone page with the same bundle embedded; no native integration or public URL is required. It works offline. Appearance defaults to `system`, following OS preference; explicit user/project appearance choices and requested overrides take priority.

## Render and serve

```sh
node <skill-dir>/scripts/render.mjs --spec <spec.json> --out <view.html> --harness browser-local
```

Run the returned `handoff.command`. It starts `serve.mjs` on `127.0.0.1` with a free port and prints `{url, feedback}`. Give the user the URL, or open it in a browser panel if the session has one. Keep the server running while they review, and stop it when done.

## Feedback

**Submit instructions** posts to `serve.mjs`, which atomically writes `<view>.feedback.json`. Saving does not start an agent turn. When the user asks you to continue, read that file and acknowledge what it contains. Opened as a plain `file://` page, the view falls back to Prepare message, Copy and Export JSON.

## Wake on submit

If the session notifies you when a background command exits, append `--once` to `handoff.command` and run it in the background. After the first saved submission it prints `{"event":"submitted","feedback":"<path>"}` and exits 0; that exit wakes you, so read the feedback file and continue without waiting for the user. Optional `--timeout <seconds>` exits 3 with `{"event":"timeout",...}` if nothing arrives. In headless runs (`codex exec`), use `--once` or `--timeout`, or a running server keeps the run open. Without such notification, use the flow above.
