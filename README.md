# reply-ui

One prebuilt renderer for interactive tables, cards, forms, boards, and static flows in agent responses. The agent supplies a small JSON spec; the same renderer and theme work across hosts.

```sh
npx skills add neha-nupoor/reply-ui -g --agent codex claude-code cursor --skill visual-response-design -y
```

| Host | Display | Feedback |
| --- | --- | --- |
| Codex widget host | Inline contentReference; larger views in a local browser | Existing chat bridge or saved feedback file |
| Claude widget host | Inline loader referencing the same bundle | Add to message box, then press Enter |
| Terminal agents / larger views | Local browser served by serve.py | Saved .feedback.json |
| Other hosts | Offline HTML file | Copy/export into chat |

Run `python3 <skill-dir>/scripts/doctor.py --harness codex` to check files/settings. This does not verify a live host bridge. Render with `scripts/render.py --spec <spec.json> --out <view.html> --harness <id>` and follow the result.

Light and dark appearances share the same renderer. Light is the default; pass `--appearance dark` or `--appearance system`. Settings cover theme, appearance, copy, and placement. User settings live in `~/.config/visual-response/config.json`; project settings in `.visual-response.json`. Host delivery stays fixed and uses thin feedback/draft adapters.

## Build and release

1. In `skills/visual-response-design/assets/renderer`, run `npm ci --ignore-scripts` and `npm run build`.
2. Run `python3 skills/visual-response-design/scripts/test_renderer.py` and `node --test skills/visual-response-design/scripts/test_adapters.mjs`.
3. Tag the matching commit `v<version>` after review. Claude loads that version from jsDelivr; `doctor.py --harness claude-inline --check-url` verifies it. Unreleased PR builds require a matching test URL.

MIT. Bundled dependencies are React, MUI, and Emotion; notices are included with the renderer. Normal rendering needs Python 3.9+ and no npm installation.
