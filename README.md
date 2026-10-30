# reply-ui

An agent skill with one prebuilt Oat/Preact renderer for interactive tables, cards, forms, boards, and static flows in agent responses. The agent supplies a small JSON spec; the same renderer, CSS, feedback envelope, and draft format serve every host.

```sh
npx skills add neha-nupoor/reply-ui -g --agent codex claude-code cursor --skill visual-response-design -y
```

| Host | Display | Feedback |
| --- | --- | --- |
| Codex widget host | Inline contentReference; larger views in a local browser | Existing chat bridge or saved feedback file |
| Claude widget host, when available | Optional URL loader referencing the same bundle; otherwise local browser | Add to message box, then press Enter; or saved feedback file |
| Claude Code, Cursor, Windsurf, Gemini CLI, and larger views | Local browser served by serve.py | Saved .feedback.json |
| Hosts without a local server | Offline HTML file | Copy/export into chat |

Run `python3 <skill-dir>/scripts/doctor.py --harness codex` to check files/settings. This does not verify a live host bridge. Render with `scripts/render.py --spec <spec.json> --out <view.html> --harness <id>` and follow the result.

Appearance follows the harness by default: Claude inline uses its host colors and light/dark mode; other surfaces follow host light/dark markers when exposed, otherwise the OS. Explicit appearance settings take priority, in this order: spec → command-line flag → project config → user config → harness default. A null config value resets to the harness default. The approved neutral preset uses 2 px controls, square surfaces, labels above fields, visible boundaries, and brief CSS interaction transitions that honor reduced-motion settings. Native HTML controls use Oat CSS; Preact handles state. CSS is scoped and bundled inside the single JavaScript file, so both hosts load the same complete UI. No CSS or JavaScript CDN is needed for Codex or local browser rendering.

Install and use this as a skill; normal rendering needs no separately installed service. Settings cover theme, appearance, copy, and placement. User settings live in `~/.config/visual-response/config.json`; project settings in `.visual-response.json`. Existing explicit theme overrides remain supported. Claude Code, including its desktop Code tab, defaults to the local browser; choose `claude-inline` only when the host provides the widget tool and a matching renderer URL has been verified. Claude accepts inline HTML/JavaScript; this skill uses a URL loader to avoid passing the entire prebuilt bundle through model context. A public URL is optional for using the skill: the browser fallback embeds the same bundle and works offline.

## Build and release

1. In `skills/visual-response-design/assets/renderer`, run `npm ci --ignore-scripts` and `npm run build`.
2. Run `python3 skills/visual-response-design/scripts/test_renderer.py` and `node --test skills/visual-response-design/scripts/test_adapters.mjs`.
3. For browser regression checks, run `python3 tests/browser_fixtures.py <output-directory>` and serve that directory on loopback. The fixtures exercise the built renderer with local Codex/Claude bridge doubles; the Claude fixture deliberately blocks inline JavaScript and checks SRI. That conservative test policy is not a claim about Claude's actual sandbox. No real chat message is sent by these fixtures.
4. If distributing the optional Claude URL loader, publish the matching reviewed `v<version>` tag and run `doctor.py --harness claude-inline --check-url` before handing it off. During PR review, use `--renderer-url` pointing to the identical bundle at a published commit. The local browser path needs no release tag or CDN URL. Do not overwrite an old tag or claim that bridge doubles prove live host submission.

## Migrating to 1.4

Remove `output` and obsolete `delivery.mode`, `delivery.npmPackage`, `delivery.repositoryPath`, and `delivery.tagPrefix` settings. Artifact database output, module wrappers, custom harness profiles, and public export tooling have been removed. Replace `claude-artifact`, `module`, or custom harness names with a supported host from the table above. Invalid old settings produce a schema error; user configuration is never silently rewritten. Legacy motion flags are ignored. Feedback schemaVersion 1 and draftVersion 1.0.0 are preserved.

MIT. Bundled dependencies are Oat CSS and Preact; third-party notices are included with the renderer. Oat's optional JavaScript is not loaded. Normal rendering needs Python 3.9+ and no npm installation.
