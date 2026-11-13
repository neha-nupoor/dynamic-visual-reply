# Claude inline widget

Use this route only when the current session actually exposes a widget tool such as `show_widget` that accepts inline HTML and JavaScript. Inspect its current instructions and payload limits first. A Claude model or app name alone does not establish that the tool exists.

```sh
node <skill-dir>/scripts/render.mjs --spec <spec.json> --out <view.html> --harness claude-inline
```

For `handoff.type: show_widget`, read the output file (about 2–5 KB) and pass its complete contents unchanged as `widget_code`. The fragment holds the spec plus a script tag that loads the identical renderer bundle from jsDelivr (`@renderer-<hash12>`, an immutable tag) with the manifest's SRI hash, so the browser refuses any bytes that differ from the local bundle. The widget sandbox allows `cdn.jsdelivr.net`. If the bundle cannot load, the fragment lists the items and asks the user to request the browser view; then use the [browser route](browser-local.md).

`node <skill-dir>/scripts/doctor.mjs --harness claude-inline --check-url` confirms the URL serves the matching bundle. Offline or unpublished: set `"rendererSource": {"mode": "embed"}` in settings to inline the full ~85 KB bundle instead; that passes it through model context.

If `result.switched` is present, the view was too large for inline and was prepared for the browser; say so, or re-render with `--format inline` when the user wants it inline. For `handoff.type: serve`, follow [browser-local.md](browser-local.md).

Claude Code (including its desktop Code tab) auto-detects as `claude-code` and uses the browser path. When no widget tool is available, do not attempt an inline call. If rendering fails or no suitable browser is available, answer in normal Markdown instead of creating a second HTML fallback.

**Add to chat** fills the user's message box through `sendPrompt`; the user presses Enter. The message contains a readable summary and JSON feedback. Saving drafts uses localStorage only when the sandbox permits it. Acknowledge the feedback actually received. If the host lacks the submission bridge, use the widget's copy/export controls or the browser route.

Appearance defaults to `host`, using Claude's CSS colors with theme/OS fallbacks. Explicit spec, flag, project or user settings take priority (an `appearance` in `~/.config/dynamic-visual-reply/config.json` overrides `host`).
