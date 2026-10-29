# Claude inline widget

Use `--harness claude-inline` when the host provides `show_widget`. The script emits a small loader referencing the shared bundle at a version-pinned URL with SRI; never paste the full bundle into chat.

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness claude-inline
```

For `handoff.type: show_widget`, read the output and pass its full contents unchanged as the widget tool's code. Follow that host's widget guide. For `handoff.type: serve`, the view is too large for inline; follow [browser-local.md](browser-local.md).

The default URL comes from `delivery.repository` and the bundle's release tag. Override `delivery.rendererUrl` for a different matching published build. `doctor.py --harness claude-inline --check-url` checks that the URL is reachable and byte-identical. New unreleased builds require a matching test URL until their tag is published.

**Add to chat** fills the user's message box through `sendPrompt`; the user presses Enter. The message contains a readable summary and JSON feedback. Saving drafts uses localStorage only when the sandbox permits it. Acknowledge the feedback actually received.

The configured theme applies. System appearance follows host data-theme/data-mode or OS preference. Explicit light/dark stays fixed; host appearance can use Claude's CSS colors with theme fallbacks.
