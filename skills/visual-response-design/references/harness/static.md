# Any host without a bridge

Profile: `harnesses/static.json`, the fallback when no harness is detected. There's no adapter: the renderer's built-in host is used.

```sh
python3 <skill-dir>/scripts/render.py --spec <spec.json> --out <view.html> --harness static
```

Give the user the returned `handoff.path`; it opens in any browser and works offline. Feedback can't reach you directly. The page offers **Prepare message** (an editable JSON message), **Copy feedback** and **Export JSON**, and the user pastes the message back into chat. Drafts are kept in the browser's local storage.

If your harness can send messages or save data, add a profile and adapter for it instead. See "Adding a harness" in `SKILL.md`.
