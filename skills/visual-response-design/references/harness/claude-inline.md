# Claude app inline widget (`show_widget`)

Profile: `harnesses/claude-inline.json` · adapter: `harnesses/claude-inline.js` · standalone views switch to `claude-artifact`.

Use this in the Claude desktop or web app when a widget tool such as `show_widget` is available. `doctor.py` detects the desktop app from `CLAUDECODE` and `CLAUDE_CODE_DESKTOP_APP_VERSION`; elsewhere pass `--harness claude-inline`.

## Why it differs

`show_widget` takes the widget's code as text you write. It cannot load a file from disk, so the 800 KB bundle is never pasted. The page loads it from `delivery.rendererUrl` (a published, version-pinned copy, checked with SRI). You only write the small loader the script produces: the spec, the theme, and a few lines of adapter. That is usually 1–4 KB.

## One-time setup

When this skill comes from a public GitHub repository whose `config/defaults.json` sets `delivery.repository`, nothing is needed. The renderer loads from jsDelivr at the release tag (`v` + bundle version), for example `https://cdn.jsdelivr.net/gh/<owner>/<repo>@v1.1.0/skills/visual-response-design/assets/renderer/dist/renderer.js`.

Otherwise, set a published renderer URL in user config (`~/.config/visual-response/config.json`):

```json
{"delivery": {"rendererUrl": "https://cdn.jsdelivr.net/npm/<package>@<version>/dist/renderer.js"}}
```

The widget sandbox allows scripts from cdnjs, esm.sh, jsDelivr and unpkg. Run `scripts/doctor.py --check-url` to confirm the URL serves exactly this build.

## Render and hand off

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness claude-inline
```

- **Inline** (`handoff.type: "show_widget"`): read the output file and pass its full contents, unchanged, as `widget_code`. Follow your host's own widget rules, such as reading its guide before the first widget. Put any explanation in your message text, not in the widget.
- **Standalone** (`handoff.type: "artifact"`): the script already switched to the artifact profile. Follow [claude-artifact.md](claude-artifact.md).
- **Standalone without an artifact-loadable URL** (`handoff.type: "serve"`): artifacts only accept npm-hosted scripts, so with only a GitHub release configured the script falls back to `browser-local`. Follow [browser-local.md](browser-local.md).

Specs above `placement.maxSpecBytes` (24 KB by default) go standalone automatically, because every inline byte is model output.

## Feedback

**Send to chat** calls the widget's global `sendPrompt()` with the JSON feedback envelope, which arrives as the user's next message. Acknowledge the values you actually received. Drafts are kept in the widget's local storage only when the sandbox allows it.

## Appearance

The theme's own appearance applies. A `system` theme switches between its light and dark palettes with the Claude host (it reads the host's `data-mode`/`data-theme`, then the OS setting); a `light` theme stays light even on a dark host. To use the Claude host's own colors instead of the theme's, set `"appearance": "host"`. The page then reads the host CSS variables listed in the profile's `hostPalette` at runtime, and falls back to the theme for any that are missing.
