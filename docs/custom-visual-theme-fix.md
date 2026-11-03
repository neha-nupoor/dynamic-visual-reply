# Adaptive colors for custom visual replies

The custom routing explorer forced color-scheme:light while its outer surface was
transparent. On a dark host, dark text therefore painted directly on the dark
conversation background. The earlier white-background preview did not catch it.

The same conversation fragment now uses the portable
[adaptive palette](../skills/response-design/assets/adaptive-colors.css): inherit
the host's active scheme and pair every text, surface, divider, selection, focus
and control color with light-dark(). Text elements receive the scoped foreground
explicitly so host element styles cannot leave them on the wrong palette. The
outer surface remains transparent. CSS handles theme changes without another
model call or a theme-detection script.

Verification covers 8 combinations: 736/320px, explicitly light/dark hosts with
the opposite OS preference, and automatic host schemes with light/dark OS
preferences. Each checks 16 text elements against their actual opaque backdrop,
no horizontal page overflow, inherited scheme and a working request selector.
Minimum measured contrast is 5.68:1 (light) and 5.86:1 (dark). Both previews were
visually inspected. The existing 90 Node tests still pass.

The custom explorer is a demonstration UI, not another skill or harness. It lets
the user inspect five saved routing examples; changing the dropdown runs local
JavaScript and starts no model request. It does not classify arbitrary new text.

The earlier 9,664-token comparison counted fresh instruction text: 586 router,
347 custom guide, 7,178 general visualization workflow, and 1,553 personal design
guide/tokens. The shared path's 2,561 was 586 router + 1,327 renderer guide + 648
host guide. These are file sizes, not measured per-example consumption or billing,
and not a fixed cost for each custom UI. Retained instructions can remain model
input even when the agent does not reread them. The large visualization guide
covers many formats beyond this small example.

The router entrypoint remains 586 tokens. Only the conditional custom guide and
optional palette example grew. Original and current explorer-source measurements
are recorded separately in
[text counts](verification/response-design/custom-theme-text-counts.json).
Browser evidence is in
[theme checks](verification/response-design/custom-theme-checks.json).

Reproduce by wrapping the conversation fragment with the visualize preview helper,
opening that preview in Playwright and running
`tests/custom_visual_theme_browser_checks.js`. Inline conversation source remains
in the task's visualization folder; no website or Library artifact is published.
