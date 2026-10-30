# Any host without a bridge

Use `static` when no native widget bridge is available. The renderer's built-in copy/export fallback is used.

```sh
node <skill-dir>/scripts/render.mjs --spec <spec.json> --out <view.html> --harness static
```

Give the user the returned `handoff.path`; it opens in any browser and works offline. Feedback can't reach you directly. The page offers **Prepare message** (an editable JSON message), **Copy feedback** and **Export JSON**, and the user pastes the message back into chat. Drafts are kept in the browser's local storage.
