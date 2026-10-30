# Claude inline widget (optional URL loader)

Claude's widget tool accepts HTML fragments with inline JavaScript. It does not inherently require a public renderer URL. This skill's `claude-inline` implementation uses a small external-script loader so the agent does not read or pass the entire shared bundle through model context. The URL is required by that loader, not by the skill or by every Claude surface.

Use this route only when the actual `show_widget` tool is available and a matching bundle URL is verified:

```sh
python3 <skill-dir>/scripts/doctor.py --harness claude-inline --check-url
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness claude-inline
```

Configure `delivery.repository` and `delivery.commit` (the full 40-character SHA of a pushed Git commit containing the matching bundle). No commit is selected by default. For example, set these keys in the project's `.dynamic-visual-reply.json`, replacing the placeholder with the actual commit:

```json
{"delivery":{"repository":"neha-nupoor/dynamic-visual-reply","commit":"<full-40-character-commit-sha>"}}
```

Alternatively, set `delivery.rendererUrl` or pass `--renderer-url` for an immutable URL to the identical bundle. A URL override takes priority over repository/commit settings. The URL must be reachable and byte-identical to the local bundle; never use an older bundle with the current manifest's SRI. Run the doctor check above with the same configuration used for rendering. External scripts must also be permitted by the widget's current sandbox; follow its guide. These file/URL checks do not verify live host execution.

For `handoff.type: show_widget`, read the small output file and pass its contents unchanged as `widget_code`. Do not paste the renderer bundle into the tool call. For `handoff.type: serve`, follow [browser-local.md](browser-local.md).

## Read-only views without a URL

A spec with `"interactive": false` renders as finished HTML and CSS with no script, so it needs no renderer URL or pinned commit. Use it for content the user only reads. Interactive views also start with the same static view, which stays visible if the renderer URL fails to load.

## Without a URL or widget tool

Use the same renderer in the [local browser](browser-local.md); no public URL or additional integration is needed:

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness browser-local
```

Claude Code (including its desktop Code tab) auto-detects as `claude-code` and uses this browser path. Larger views use it too. Only select `claude-inline` when both prerequisites above are available; it is not a general Claude requirement.

**Add to chat** fills the user's message box through `sendPrompt`; the user presses Enter. The message contains a readable summary and JSON feedback. Saving drafts uses localStorage only when the sandbox permits it. Acknowledge the feedback actually received.

The configured theme applies, including its colors. Appearance defaults to `system`: the theme's light or dark palette follows Claude's light/dark markers, then the OS setting. Set `appearance: host` to use Claude's own CSS colors instead, with theme fallbacks for any it doesn't define. Explicit appearance choices from the spec, flags, project, or user configuration take priority; omit extra flags when following the default. Explicit light/dark stays fixed. The bundle includes all Oat CSS, so the loader makes no separate stylesheet request.
