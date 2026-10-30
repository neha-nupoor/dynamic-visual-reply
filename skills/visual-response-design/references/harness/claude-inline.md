# Claude inline widget

Use `--harness claude-inline` when the host provides `show_widget`. The script emits a small loader referencing the shared bundle at a version-pinned URL with SRI; never paste the full bundle into chat.

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness claude-inline
```

For `handoff.type: show_widget`, read the output and pass its full contents unchanged as the widget tool's code. Follow that host's widget guide. For `handoff.type: serve`, the view is too large for inline; follow [browser-local.md](browser-local.md).

The default URL comes from `delivery.repository` and the bundle's release tag. Run `doctor.py --harness claude-inline --check-url` before handing off a release loader: the URL must be reachable and byte-identical. Override `delivery.rendererUrl` or pass `--renderer-url` for a matching published commit while reviewing an unreleased PR. Never use an older bundle with the current manifest's SRI. Until a matching URL is published, use the local browser instead of handing off a broken loader.

Claude Code (including its desktop Code tab) auto-detects as `claude-code` and uses the local browser. Choose `claude-inline` explicitly when the actual `show_widget` tool is available. The bundle includes all Oat CSS, so no separate stylesheet request or inline bootstrap script is needed.

**Add to chat** fills the user's message box through `sendPrompt`; the user presses Enter. The message contains a readable summary and JSON feedback. Saving drafts uses localStorage only when the sandbox permits it. Acknowledge the feedback actually received.

The configured theme applies. System appearance follows host data-theme/data-mode or OS preference. Explicit light/dark stays fixed; host appearance can use Claude's CSS colors with theme fallbacks.
