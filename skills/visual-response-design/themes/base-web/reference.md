# Base Web reference preset (preview)

This is a preset for the existing shared renderer, not the Base Web component library. It adds no runtime dependency. Keep existing personal/product themes unless this preset is selected with `--theme base-web`.

Reference checked October 29, 2026 against the live Base Web 18.2.0 form examples and current upstream source:

- [Form Control](https://baseweb.design/components/form-control/): labels above fields, 14 px / 500 weight, captions below; labels retain primary text contrast.
- [Border tokens](https://github.com/uber/baseweb/blob/main/src/themes/shared/borders.ts): input/button corners 8 px, square card surfaces. The renderer retains its system font rather than bundling a brand font.
- [Primitive colors](https://github.com/uber/baseweb/blob/main/src/tokens/color-primitive-tokens.ts): white/black light surfaces and actions; dark #161616 canvas, #292929 fields, #DEDEDE text, #C4C4C4 supporting text.
- [Input styles](https://github.com/uber/baseweb/blob/main/src/input/styled-components.ts): filled fields, 2 px boundary, distinct focus state. The live dark example showed a #6C6C6C idle input boundary; this preset follows that visible example.

This reference updates the component treatment beyond a palette swap. The collection layout, state, feedback contract and host adapters remain the shared renderer's implementation. Selected surface tint and semantic outcome colors are renderer choices; this is not a claim of pixel-identical Base Web coverage.
