# Claude inline widget

Use this route only when the current session actually exposes a widget tool such as `show_widget` that accepts inline HTML and JavaScript. Inspect its current instructions and payload limits first. A Claude model or app name alone does not establish that the tool exists.

```sh
python3 <skill-dir>/scripts/doctor.py --harness claude-inline
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness claude-inline
```

The generated fragment embeds the identical Oat/Preact renderer and CSS used by Codex and the local browser. No external script, CDN, public URL, or delivery configuration is used. Local manifest hashes verify the bundle before rendering. File checks do not prove execution in the native host.

For `handoff.type: show_widget`, read the generated output file and pass its complete contents unchanged as `widget_code`, following the tool's current instructions. The shared bundle is about 82 KB before spec data; this string-based handoff consumes model context. Do not rewrite, truncate, or regenerate it. If the tool cannot accommodate or run it, use the local browser when interaction remains useful; otherwise provide the intended content in ordinary Markdown. For `handoff.type: serve`, follow [browser-local.md](browser-local.md).

Claude Code (including its desktop Code tab) auto-detects as `claude-code` and uses the browser path. Larger views use it too. When no widget tool is available, do not attempt an inline call. If rendering fails or no suitable browser is available, answer in normal Markdown instead of creating a second HTML fallback.

**Add to chat** fills the user's message box through `sendPrompt`; the user presses Enter. The message contains a readable summary and JSON feedback. Saving drafts uses localStorage only when the sandbox permits it. Acknowledge the feedback actually received. If the host lacks the submission bridge, use the widget's copy/export controls or the browser route.

The configured theme applies. Appearance defaults to `host`, using Claude's available CSS colors and light/dark markers with theme/OS fallbacks. Explicit appearance choices from the spec, flags, project, or user configuration take priority; omit extra flags when following the default. Explicit light/dark stays fixed. All Oat CSS is included in the bundle.
