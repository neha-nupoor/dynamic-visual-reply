# Oat appearance proof

An isolated, interactive appearance comparison using actual Oat 1.0.0 CSS, Preact 11.1.0, native HTML controls, and the existing Base Web reference palette. It shows forms, sortable/paged tables, selectable cards, a board with stage controls, and a static step-through flow in light and dark appearances. No MUI, Emotion, Oat JavaScript, or animation engine is loaded.

```sh
cd experiments/oat-poc
npm ci --ignore-scripts
npm run build
python3 -m http.server 56302 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:56302/oat-components-page.html`. `oat-light.html` and `oat-dark.html` are compact inline fragments; files ending in `-page.html` are standalone documents. Dependencies are bundled locally; previews need no CDN. `dist/sizes.json` records the measured JavaScript and CSS sizes, excluding the HTML wrapper.

This proof answers whether Oat can achieve the requested appearance with native controls. It does not replace the released renderer, change the spec contract, or claim feature parity. It reuses the Codex adapter for draft storage and chat submission when that bridge exists. Without it, the main action says **Preview instructions** and displays the prepared message; it sends nothing. Drafts are separate from the existing renderer. No native host submission has been end-to-end verified as part of this appearance proof.

The existing reference preset supplies monochrome colors, above-field labels, a cool gray light surface and stronger boundaries. This proof uses Neha's requested 2px control corners and square content surfaces. A small local stylesheet maps the palette and supplies layout/target sizing. Oat's upstream defaults are not Base Web components. The proof can be discarded after a visual decision; migrate and test the real renderer separately if approved.

Basic motion uses Oat's existing CSS transitions with 150ms/200ms durations and `cubic-bezier(.4,0,.2,1)`, matching MUI's shortest/shorter timing and common easing. Hover/focus colors, field focus rings, checkboxes, table rows, card/flow selection and the disclosure chevron transition briefly; buttons have a small press response. No animation JavaScript or first-render animation is added. `prefers-reduced-motion: reduce` disables transitions and the press transform.

Dependency licenses: MIT (Oat and Preact); notices are copied into `dist/THIRD_PARTY_NOTICES.txt` during the build.
