# Generic theme

The single bundled theme lives in `config/theme.json` and is named `generic`. Legacy `base-web` and `neutral` names resolve to this same file. It styles the shared Oat/Preact renderer with native controls and system fonts. Its approved treatment is monochrome actions, clear labels above controls, square content surfaces, and 2 px control/badge corners.

The original spacing, typography and dark palette were informed by Base Web 18.2.0 on October 29, 2026: [form controls](https://baseweb.design/components/form-control/), [border tokens](https://github.com/uber/baseweb/blob/main/src/themes/shared/borders.ts), and [input styles](https://github.com/uber/baseweb/blob/main/src/input/styled-components.ts). The library implementation is [Oat](https://oat.ink/); this preset does not load Uber's Base Web library.

Review adjustments requested by Neha:

- Light: #F2F3F5 panel on #E9EBEE canvas, #B8BEC6 panel/divider borders, and white inputs with #8A9099 boundaries.
- Dark: #161616 panel/canvas, #292929 inputs, #DEDEDE text, #C4C4C4 secondary text, and #6C6C6C input boundaries.
- Corners: 2 px on controls/badges, replacing the earlier 8 px reference; content surfaces remain square.
- Motion: CSS hover, focus, press, selection and disclosure transitions use 150–200 ms timing with reduced-motion support. No animation engine or Oat JavaScript is loaded.

Explicit custom theme packs still control their own colors, geometry and typography. The same generic values provide defaults for custom packs with missing optional tokens. Appearance follows the harness unless an explicit setting overrides it.
