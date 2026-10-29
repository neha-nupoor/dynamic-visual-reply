# UI behavior and feedback contract

Read when building, changing, or reviewing components and feedback delivery. These requirements apply to reusable implementations.

### Tables and batch feedback

- Provide sorting, useful filters or search, multi-select, and a feedback textarea for each record. Include selection counts, **Select visible** and **Deselect visible**, and a shared instruction field for selected records.
- Add dashboard features when they help: stable headers and identifiers, sensible numeric alignment, column visibility or resizing, grouping, pagination for large datasets, and source/detail access. Avoid loading every possible control into small tables.
- Distinguish visible rows from all filtered records when selecting or applying an action. Preview the exact batch scope and include stable record IDs, selected values, and attached feedback in the submitted instruction.
- Preserve drafts, selection, and reviewed state through sorting and filtering. Key edits to stable IDs. Do not rebuild focused inputs on each keystroke or silently truncate instructions.

### Forms, choices, cards, and actions

- Every view (tables, cards, Kanban, flows, and forms) must have a primary **Send to chat** button directly below its main content, outside the collapsible feedback section. Submit the structured JSON instruction containing selected records, attached feedback, and current field values without requiring a general instruction or opening feedback. Keep **Send feedback** for optional commentary. Use truthful **Submit answers** or **Prepare message** labels when the host cannot start a chat turn; reveal the copy fallback on preparation/failure and keep submission status visible when feedback is collapsed. Labels come from `copy.*` and the harness adapter's `capabilities.submit`, never from checking host globals in the renderer.
- Prefill known values. Let the user select multiple answers where appropriate, edit each offered option, and add item-specific or general feedback. Avoid asking them to retype context already supplied.
- Attach comments to the information they concern. Use one deliberate batch submission for related feedback rather than sending every edit as a new turn.
- Surface medium- or high-confidence recommendations as editable CTAs with clear action verbs. Explain consequential uncertainty briefly; do not invent numerical confidence scores.
- Keep recommendation drafts distinct from executed actions. Show what an action will do and support undo for reversible local edits where practical. Preserve existing authorization boundaries for external actions.

### Technical visuals

- Use static flows with labeled steps and manually selected detail. Keep necessary evidence beside or beneath the visual.
- Keep interaction feedback to brief CSS transitions. Honor reduced-motion preferences and avoid autoplay, decorative animation, and animation engines.
- Keep colors and positions stable across updates. Pair color with labels or shapes.

## Feedback delivery and state

- A visible control needs a working path back to the agent. Use the selected surface's documented host bridge when available; do not assume an inline host API exists in a standalone side panel.
- Distinguish draft, submission requested, agent received, applied, and failed states. A state-save call does not start a turn or prove submission. A clipboard operation does not prove the message was sent.
- Show a batch preview. If direct submission is unavailable, provide an editable generated message, an explicit Copy message button, and manual text selection as a fallback. Confirm clipboard success only after it succeeds.
- Restore supported saved state and protect newer local edits from stale updates. Treat host state delivery and restoration as best effort unless the chosen storage guarantees persistence. Acknowledge the actual received values when replying.
- Verify selection and deselection, editable fields, preservation through sort/filter, and the submission or copy fallback proportionately. If host submission cannot be verified, state the limitation instead of presenting it as working.
