# Agent-designed visual replies

Use this path when a combined dashboard, linked diagram, interactive explanation,
simulation, timeline, or other useful composition does not fit the five shared
views, or the user explicitly requests a custom layout. A chart alone can use the
normal visualization workflow. Existing views remain defaults for repeated tasks.

Use the session's supported visualization/artifact/UI workflow and actual display
contract. Inline HTML requires documented support, not merely a host/model name.
If only commands and a browser are available, use a local browser artifact. If no
usable display route exists, provide the full answer in Markdown. A custom route
is a deliberate design choice, not a second renderer improvised after a failed
standard render. Do not pass it as a fixed profile to dynamic-visual-reply.

Apply the user's configured design system or preserve a supplied product style.
Use clear hierarchy, readable text, labeled native controls, keyboard focus,
responsive layout, source links, and explicit empty/error states. Prefer simple
controls and details over an overloaded canvas. Verify the rendered view and its
main interaction on the actual surface where available.

Keep repeated task structure stable: reuse an existing custom artifact or template
and update its data instead of redesigning it each time. A useful new layout can
become a reusable template later; no new template is required on every reply.

Read-only views should not request approvals. Review controls need a real feedback
route or a clearly labeled copy/export fallback; UI changes remain drafts until
authorized and applied. Confirm only received feedback. Keep a short answer and
recommendation in chat so the content remains usable without opening the view.
Do not claim native submission from a screenshot or simulated bridge.
