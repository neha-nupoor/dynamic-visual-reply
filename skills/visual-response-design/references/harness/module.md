# Data-only output for wrappers

Profile: `harnesses/module.json`. Use it when another program builds the page: an MCP server that returns a UI resource, an IDE panel, or a custom chat host.

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.json> --harness module
```

The output is JSON: `{schemaVersion, spec, theme, config, renderer: {version, path, sha256, sri, url}}`. `spec` already contains `stateKey` and `resolvedPresentation`.

## Building the page

The renderer reads its inputs from the document, so emit these, in this order:

```html
<div data-visual-response-root></div>
<script type="application/json" data-visual-response-config>{config}</script>
<script type="application/json" data-visual-response-theme>{theme}</script>
<script type="application/json" data-visual-response-spec>{spec}</script>
<script>window.visualResponseHost = { /* your adapter */ };</script>
<script src="{renderer.url}" integrity="{renderer.sri}" crossorigin="anonymous"></script>
```

Escape `<`, `>` and `&` in the JSON blocks, as `render.py`'s `json_for_html` does. If the host can't load a URL, inline the bundle at `renderer.path` instead.

The adapter must follow the host interface in [renderer-contract.md](../renderer-contract.md#harness-adapters). For an MCP UI resource, map `submit` to the host's message or intent call, and `saveDraft`/`loadDraft` to its state API if it has one. Once the adapter is stable, add it as a harness profile so agents can use it directly.
