# Report Blue: optional colors and CSS primitives

Use this kit when a user requests the spacious, blue-accent report style. It contains
no personal data, month layout, analytics, chart engine or additional JavaScript.
The generic renderer theme remains the default; Report Blue is opt-in.

## Existing shared views

Use the existing renderer with `--theme <skill-dir>/assets/report-kit/theme.json`.
Add `readOnly: true` for factual reports. Tables, cards, boards, flow views and
labeled form values use the same renderer; the theme changes only tokens.

## Basic components outside the renderer

`assets/report-kit/components.css` is an optional, `.dvr-report`-scoped stylesheet
for metric cards, status labels, outcome rows, legends and simple supplied-value
bars. Use semantic HTML as shown in `assets/report-kit/example.html`.

Generate the variables with the existing helper (no runtime build needed):

```sh
node <skill-dir>/scripts/render.mjs \
  --theme <skill-dir>/assets/report-kit/theme.json \
  --appearance system --theme-css <output-dir>/report-tokens.css
```

Copy `components.css` and `example.html` beside the exported tokens to preview.
Link tokens before components. For an inline visualization, inline those two small
CSS files with the desired semantic markup and follow the host's fragment contract;
do not add document tags. The stylesheet is not added to the shared JS bundle.

## Token roles

- Surfaces: white content, cool-neutral secondary surfaces, near-black text.
- Accent: `#365DE8` for actions/links; pale blue for selected content.
- Series: `--vr-series1` through `--vr-series4` retain the report's light blue-to-grey
  palette: `#365DE8`, `#778CD1`, `#AAB7DF`, `#D7DCE8`. The theme provides dark variants.
- Outcomes: success, warning and error text/fill pairs are for real status, not decoration.

Use stable series meanings within a chart. Keep labels and values on neutral
surfaces, not on the pale series fills. The pale tones are not guaranteed to meet
non-text contrast against every surface or adjacent tone: preserve direct labels,
spacing and accessible text alternatives; do not encode meaning by color alone.

`dvr-meter` only draws supplied proportions. Set each span's `--share` to a validated
0–100 value, and ensure stacked parts sum to at most 100. Include visible labels and
an accessible description. It does not calculate, validate, animate or fetch data.
Use a proper visualization workflow for axes, scales, interactions and more complex
charts. There are deliberately no timeline, calendar or monthly-report components.

Appearance follows the exported variables. `--appearance system` supports OS
appearance and explicit `data-theme="light|dark"` on the document root. Fixed light
or dark exports are also supported. No new settings or global theme changes are made.
