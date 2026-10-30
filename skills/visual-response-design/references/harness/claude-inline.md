# Claude inline widget (optional URL loader)

Claude's widget tool accepts HTML fragments with inline JavaScript. It does not inherently require a public renderer URL. This skill's `claude-inline` implementation uses a small external-script loader so the agent does not read or pass the entire shared bundle through model context. The URL is required by that loader, not by the skill or by every Claude surface.

Use this route only when the actual `show_widget` tool is available and a matching bundle URL is verified:

```sh
python3 <skill-dir>/scripts/doctor.py --harness claude-inline --check-url
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness claude-inline
```

The loader's default URL comes from `delivery.repository` and the bundle's release tag. Override `delivery.rendererUrl` or pass `--renderer-url` for a matching published commit while reviewing an unreleased PR. The URL must be reachable and byte-identical to the local bundle; never use an older bundle with the current manifest's SRI. External scripts must also be permitted by the widget's current sandbox; follow its guide. These file/URL checks do not verify live host execution.

For `handoff.type: show_widget`, read the small output file and pass its contents unchanged as `widget_code`. Do not paste the renderer bundle into the tool call. For `handoff.type: serve`, follow [browser-local.md](browser-local.md).

## Without a URL or widget tool

Use the same renderer in the [local browser](browser-local.md); no public URL, release tag, or additional integration is needed:

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness browser-local
```

Claude Code (including its desktop Code tab) auto-detects as `claude-code` and uses this browser path. Larger views use it too. Only select `claude-inline` when both prerequisites above are available; it is not a general Claude requirement.

**Add to chat** fills the user's message box through `sendPrompt`; the user presses Enter. The message contains a readable summary and JSON feedback. Saving drafts uses localStorage only when the sandbox permits it. Acknowledge the feedback actually received.

The configured theme applies. System appearance follows host data-theme/data-mode or OS preference. Explicit light/dark stays fixed; host appearance can use Claude's CSS colors with theme fallbacks. The bundle includes all Oat CSS, so the loader makes no separate stylesheet request.
