# Dynamic Visual Reply

**Review several items. Reply once.**

When your agent proposes ten things — titles, fixes, tasks, options — you usually answer in ten messages, or one long paragraph full of "for #3… for #7…". Dynamic Visual Reply lets the agent show them as a table, cards, form, board or step flow. You select, edit and comment on each item, then send one batch of structured feedback that keeps every item ID attached.

![Reviewing steps and sending one batch of feedback in Codex](docs/media/codex-inline-demo.gif)

- **Small for the model.** The agent writes a ~100–200 token JSON spec; a prebuilt renderer (Preact + [Oat](https://github.com/knadh/oat), ~85 KB) draws the UI. No API keys, no telemetry, no build step.
- **Works across agents.** Inline in the Codex app; a local browser tab with a loopback server in Claude Code, Cursor and other CLIs.
- **Stays out of the way.** It only activates for 3+ comparable items or when you ask for a visual review. Short answers stay in chat.

## Install

**Claude Code** (plugin):

```text
/plugin marketplace add neha-nupoor/dynamic-visual-reply
/plugin install dynamic-visual-reply@dynamic-visual-reply
```

**Codex, Cursor, Claude Code, Windsurf, Gemini CLI, Copilot** ([skills CLI](https://github.com/vercel-labs/skills)):

```sh
npx skills add neha-nupoor/dynamic-visual-reply --skill response-design --skill dynamic-visual-reply
```

Then add one rule to your agent's instructions (`AGENTS.md`, `CLAUDE.md`, or a Cursor rule with `alwaysApply: true`):

> When a reply will present 3+ comparable items, records, questions or steps, or the user asks for a visual/interactive review, use response-design to choose the format. Pass `inline:false` in Claude Code, Cursor and terminal CLIs; `inline:true` in the Codex app. Honor explicit user format requests.

Requires Node.js 22.20+ where the agent runs commands. See the [setup guide](skills/response-design/references/setup.md) for per-host details.

## Try it

> Here are 8 candidate blog titles: … I want to give feedback on each one. Show them so I can review them.

## Where it runs

| Host | Display | Feedback returns by | Verified |
| --- | --- | --- | --- |
| Codex app | Inline widget (file reference, bundle never enters model context) | **Send to chat** starts the next turn | Live |
| Claude Code (desktop or terminal) | Local browser tab via a loopback server | Submit; with `serve.mjs --once` in the background the agent wakes automatically | Live |
| Cursor | Local browser tab | Submit; with `serve.mjs --once` the agent wakes automatically | Live in the `cursor-agent` CLI; IDE agent chat untested |
| Anything else | Offline HTML | Copy or export JSON into chat | Fixtures |

Large views (more than ~4 cards, 8 table rows, or ~1,100 px tall) open in the browser instead of inline, and the renderer says so (`switched`).

## Views

| View | Useful for |
| --- | --- |
| Table | Compare records, select a batch, and edit individual values |
| Cards | Review alternatives and add an instruction to each |
| Form | Answer several questions in one submission |
| Board | Move items between stages and explain changes |
| Flow | Review a sequence and respond to individual steps |

Selections and edits stay drafts until you submit them. Submitting sends instructions to the agent; it does not directly change your tasks or source data.

## Read-only reports

For a visual report that needs no response, set `"readOnly": true`. The same
components show the supplied facts without selection, editing, comments or feedback
controls. Sorting, filtering, paging, source links, details and flow navigation
remain available. Saved review drafts are not loaded, and browsing does not save
drafts or call the host's submission API. Forms display labeled values.
See the [read-only example](skills/dynamic-visual-reply/assets/examples/read-only-cards.json).

Read-only mode also supports explicitly requested visual summaries and status
boards. It also applies proactively to dense structured answers: two tables with
at least 10 total data rows, one table with at least 15 rows, or a response of at
least 500 words containing six comparable items. The agent uses a compact inline
view where the host supports it, with a short answer in chat. These are skill
authoring rules; explicit format requests take priority. Long prose stays in chat.
It does not add chart or timeline view types; keep those in their existing
visualization workflow rather than replacing them with review controls.

## Component gallery

These screenshots show all five views using fictional release tasks. They use the shared renderer in a local preview with a labeled simulated chat bridge.

### Table

Select records and attach an instruction to each one.

![Table with per-record feedback](docs/media/table-light.png)

### Cards

Compare alternatives and respond to each card.

![Cards with feedback controls](docs/media/cards-light.png)

### Form

Collect several answers before submitting one message.

![Form in light mode](docs/media/form-light.png)

### Board

Review items by stage and prepare changes as a draft.

![Board with stage controls](docs/media/kanban-light.png)

### Flow

Review one step at a time and give feedback on individual steps.

![Flow with step controls](docs/media/flow-light.png)

Both themes use the same controls and layout:

![Form in dark mode](docs/media/form-dark.png)


## Try a sample locally

Set `reply_skill_dir` to your installed skill directory—the folder containing `SKILL.md`. For example, a project-local Codex installation commonly uses `.agents/skills/dynamic-visual-reply`. Find the actual path with `npx skills list --agent codex`, or use the directory you copied manually.

```sh
reply_skill_dir="$PWD/.agents/skills/dynamic-visual-reply"
reply_preview_dir="$PWD/dynamic-visual-reply-preview"
mkdir -p "$reply_preview_dir"

node "$reply_skill_dir/scripts/doctor.mjs" --harness browser-local
node "$reply_skill_dir/scripts/render.mjs" \
  --spec "$reply_skill_dir/assets/examples/form.json" \
  --out "$reply_preview_dir/form.html" \
  --harness browser-local
node "$reply_skill_dir/scripts/serve.mjs" "$reply_preview_dir/form.html" --port 0
```

Open the local URL printed by the server. Keep it running while reviewing, submit your answers, then ask the agent to read the printed feedback file. Stop the server when finished. On Windows, use the equivalent paths and variables for your shell.

`doctor.mjs` checks local files, configuration, bundle hashes, and theme contrast. It cannot establish that an inline host tool or submission bridge exists.


## Appearance

Desktop views use compact spacing: 14 px body text, 32 px controls, and an 18 px inline title. Free-text form answers start compact and can be resized vertically with the bottom-right handle. Touch controls retain larger targets. Codex and the browser page share this preset; native host density is not detected automatically. Existing theme settings can override the sizes.

Appearance follows the host where supported, with OS preference as a fallback. Explicit choices take priority:

`spec → command-line flag → project settings → user settings → harness default`

To choose a fixed appearance, add this to your project's `.dynamic-visual-reply.json` or your user settings at `~/.config/dynamic-visual-reply/config.json`:

```json
{"appearance":"dark"}
```

Use `"light"` for light mode, or `null` to restore the harness default. Preserve any other settings already in the file. A single generic theme supplies both palettes; custom theme packs and wording overrides are supported. See the [theme guide](skills/dynamic-visual-reply/references/theme.md) and [renderer contract](skills/dynamic-visual-reply/references/renderer-contract.md).


## Troubleshooting

- **Skill is not discovered:** check its installation path and restart the agent session. Verify the complete skill folder was installed.
- **Node is missing:** install Node.js 22.20+ where the agent executes commands. The prebuilt renderer needs no npm install.
- **Widget does not appear:** check the host's documented rendering contract, required tools, and payload limits. Codex does not need a separate widget tool when its content-reference contract is available. Use the browser route when available, or continue in normal chat.
- **Browser feedback does not arrive:** use the server's HTTP URL rather than opening the file directly. Submit, then ask the agent to read the feedback file; local submission does not wake the agent.
- **Settings fail after updating:** older installations may contain an obsolete `delivery` object or use the former `visual-response-design` skill name. See [migration guidance](skills/dynamic-visual-reply/references/renderer-contract.md#migrating-older-installations). Disable the old skill after checking the new installation to avoid duplicate discovery.


## For contributors

The skill entrypoint is [SKILL.md](skills/dynamic-visual-reply/SKILL.md). Supporting files follow the standard skill layout:

```text
skills/dynamic-visual-reply/
├── SKILL.md
├── agents/openai.yaml       # Optional OpenAI display metadata
├── scripts/                 # Render, serve, checks, and host adapters
├── config/                  # Defaults, one generic theme, and schemas
├── references/              # Detailed contracts and host guides
└── assets/                  # JSON examples and the shared renderer
```

Normal users do not need to build the renderer. For implementation changes, follow the [renderer contract](skills/dynamic-visual-reply/references/renderer-contract.md#maintenance) and [UI behavior guide](skills/dynamic-visual-reply/references/ui-behavior.md).

Git commits identify skill revisions; bundle hashes identify renderer bytes. Dependency pins and compatibility markers are retained. There is no routine skill version bump or tag-publishing workflow.


More: [token and size benchmarks, Report Blue kit, previews](docs/details.md).

## License

MIT. Bundled Oat and Preact notices are included with the renderer.
