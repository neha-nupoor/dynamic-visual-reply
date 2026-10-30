# reply-ui

An installable agent skill for reviewing several items and sending one batch of feedback tied to stable IDs. It provides tables, cards, forms, boards, and manual flows through one prebuilt Oat/Preact renderer. Keep simple answers and overall feedback in chat; use a view when separate items need separate responses, or when the user explicitly requests one.

## Requirements

- Python 3.9+ to render and serve views, plus a browser or browser panel.
- An agent that can read skill files and run local commands. A chat-only host without those capabilities cannot run this skill by installation alone.
- For the skills CLI installer: Git and Node.js 22.20+. Normal rendering needs no Node.js, npm packages, build step, API key, or separately installed service. A manual installation is available below.

## 1. Install the skill

Run from the project where you want to use it:

```sh
npx skills add neha-nupoor/reply-ui --skill visual-response-design
```

Select your agent when prompted. For an unattended installation, specify its installer ID:

```sh
npx skills add neha-nupoor/reply-ui --skill visual-response-design --agent codex --yes
```

Replace `codex` with an ID from the table below. Add `--global` to install for all projects instead of only the current project. Multiple IDs can follow `--agent`. Start a new agent session or reload its skill discovery after installing.

The installer ID and rendering harness are different: `cursor` is an installer ID, while Cursor renders through `browser-local`.

| Agent | Installer ID | Project skill parent | Global skill parent | Rendering harness |
| --- | --- | --- | --- | --- |
| Codex | `codex` | `.agents/skills/` | `~/.agents/skills/` | `codex` when an inline widget tool exists; otherwise `browser-local` |
| Claude Code | `claude-code` | `.claude/skills/` | `~/.claude/skills/` | `claude-code` |
| Cursor | `cursor` | `.agents/skills/` | `~/.cursor/skills/` | `browser-local` |
| Windsurf | `windsurf` | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` | `browser-local` |
| Gemini CLI | `gemini-cli` | `.agents/skills/` | `~/.gemini/skills/` | `browser-local` |
| GitHub Copilot | `github-copilot` | `.agents/skills/` | `~/.copilot/skills/` | `browser-local` |

Each parent contains a `visual-response-design` directory. The CLI can share the underlying files or install copies. Inspect the actual location with `npx skills list --agent <installer-id>`; add `--global` for a global install. CLI options and directories are documented in the [installer reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md) and [supported-agent list](https://github.com/vercel-labs/skills/blob/main/docs/agents.md).

### Manual installation / another agent

If Node.js is unavailable, clone the repository:

```sh
git clone https://github.com/neha-nupoor/reply-ui.git
```

Copy the **entire** `reply-ui/skills/visual-response-design` directory into your harness's skill directory, preserving `scripts/`, `config/`, `themes/`, `references/`, `harnesses/`, and `assets/`. Follow that harness's skill-discovery rules. If it has no skills loader, ask the agent to read the cloned `skills/visual-response-design/SKILL.md` explicitly and use the local-browser workflow below. Copying only `SKILL.md` is insufficient.

## 2. Verify setup and render a first view

Set `reply_skill_dir` to the installed directory containing `SKILL.md`. For example, after the project-local Codex/Cursor installation above:

```sh
reply_skill_dir="$PWD/.agents/skills/visual-response-design"
python3 "$reply_skill_dir/scripts/doctor.py" --harness browser-local
python3 "$reply_skill_dir/scripts/render.py" --catalog
```

For a manual clone, use `reply_skill_dir="$PWD/reply-ui/skills/visual-response-design"`. For another installation, use its actual path from the table or CLI listing. On Windows, use the equivalent path/variable syntax in your shell and `py -3` if `python3` is unavailable.

Render the bundled sample form with the universal browser fallback:

```sh
reply_preview_dir="$PWD/reply-ui-preview"
mkdir -p "$reply_preview_dir"
python3 "$reply_skill_dir/scripts/render.py" --spec "$reply_skill_dir/assets/examples/form.json" --out "$reply_preview_dir/form.html" --harness browser-local
python3 "$reply_skill_dir/scripts/serve.py" "$reply_preview_dir/form.html" --port 0
```

The server prints a local `url` and a `feedback` file path. Open that URL in the harness's browser panel or system browser. Keep the server running while the user reviews; stop it when finished. No public URL is needed, and the renderer works offline after installation.

Click **Submit answers** or **Submit instructions**, then return to the agent and ask it to continue. The agent reads the printed `.feedback.json` file; a browser submission does not itself start an agent turn. Selections and edits remain drafts until the agent applies them.

`doctor.py` checks files, configuration, hashes, and contrast. It does not prove a native widget or chat bridge exists. A server-rendered first view and saved feedback verify the local path; test any native bridge in its real host separately.

## 3. Use it in your harness

Ask the agent, for example:

> Use the visual-response-design skill to show these five proposals as a review table. Let me select proposals and add a separate instruction to each, then submit one batch. Use the local-browser fallback if inline rendering is unavailable.

The agent reads the installed `SKILL.md`, writes a small JSON spec, runs `scripts/render.py`, and follows the returned `handoff`. It should not read the bundled JavaScript into model context or regenerate the UI implementation.

- **Codex with an inline widget tool:** use `--harness codex`. Display the returned `contentReference` for an inline view; for `handoff.type: serve`, run the returned command and open the local URL. Native **Send to chat** uses the existing bridge. Codex CLI or a host without that inline tool uses `browser-local`.
- **Claude Code:** use `--harness claude-code`. Both the terminal and desktop Code tab use the same local-browser workflow. The desktop Browser pane can display the local server. Environment detection suggests this route, but an explicit flag avoids ambiguity.
- **Cursor, Windsurf, Gemini CLI, Copilot, and other agents:** use `--harness browser-local` and follow the returned server command. No custom native integration is needed. When choosing a harness, check actual available tools rather than the model's name.
- **No local server available:** render with `--harness static`. Open the returned HTML file and use **Prepare message**, **Copy feedback**, or **Export JSON** to return feedback manually.

### Optional Claude inline widget route

Use `--harness claude-inline` only when the actual `show_widget` tool is available **and** its matching bundle URL is verified. Claude accepts HTML fragments with inline JavaScript. This skill's optional URL loader keeps the tool payload small instead of passing the whole prebuilt renderer through model context.

Run `python3 "$reply_skill_dir/scripts/doctor.py" --harness claude-inline --check-url` before choosing this route. Then render with `--harness claude-inline` and pass the small output file to `show_widget` as instructed by its returned handoff and current host guide. **Add to chat** fills the message box; the user presses Enter.

The default loader URL uses the renderer's release tag. An unreleased build can instead use an identical published commit via `delivery.rendererUrl` / `--renderer-url`, with matching integrity. If the URL is unavailable, mismatched, or blocked by the host, use `browser-local`. A release tag, CDN, and public renderer URL are optional for using the skill. See the [Claude guide](skills/visual-response-design/references/harness/claude-inline.md).

## Appearance and settings

Appearance follows the harness by default: Claude inline uses available host colors and light/dark mode; other surfaces follow exposed host light/dark markers, otherwise OS preference. Explicit choices win in this order:

`spec → command-line flag → project config → user config → harness default`

A null config appearance resets to the harness default. Do not add appearance flags just to force automatic behavior. To request a fixed mode for one render, pass `--appearance light` or `--appearance dark`.

User settings live in `~/.config/visual-response/config.json` (or `$VISUAL_RESPONSE_CONFIG`); project settings live in `.visual-response.json`. For example, add `"appearance": "dark"` to an existing config, or create a new config with:

```json
{"appearance":"dark"}
```

Preserve other existing settings. The configured theme pack remains supported. Both palettes use the same renderer, with 2 px control/badge corners, square content surfaces, visible borders, and brief CSS transitions that honor reduced motion. To inspect effective settings, run:

```sh
python3 "$reply_skill_dir/scripts/render.py" --print-config --harness browser-local
```

## Troubleshooting and updates

- **Skill is not discovered:** inspect `npx skills list --agent <installer-id>` (with `--global` for a global installation), verify the full skill directory exists, and start a new session/reload discovery. A custom skills directory may differ from the CLI defaults above.
- **Unknown harness error:** use a rendering harness from this README, not an installer ID such as `cursor` or `gemini-cli`.
- **Feedback is not reaching the agent:** open the server's HTTP URL, submit deliberately, then ask the agent to read the printed feedback file. A plain `file://` page uses copy/export instead of the server endpoint.
- **Claude loader URL fails:** switch to `browser-local`; do not disable integrity checking or substitute an older bundle.
- **Update:** use `npx skills update visual-response-design` for a project install, or add `--global` for a global install. Manual copies need the skill directory refreshed from an updated clone.

See [SKILL.md](skills/visual-response-design/SKILL.md) for invocation rules and the [renderer contract](skills/visual-response-design/references/renderer-contract.md) for specs, datasets, patches, settings, and supported behavior.

## Build and release

1. In `skills/visual-response-design/assets/renderer`, run `npm ci --ignore-scripts` and `npm run build`.
2. Run `python3 skills/visual-response-design/scripts/test_renderer.py` and `node --test skills/visual-response-design/scripts/test_adapters.mjs`.
3. For browser regression checks, run `python3 tests/browser_fixtures.py <output-directory>` and serve that directory on loopback. The fixtures exercise the built renderer with local Codex/Claude bridge doubles; the Claude fixture deliberately blocks inline JavaScript and checks SRI. That conservative test policy is not a claim about Claude's actual sandbox. No real chat message is sent by these fixtures.
4. If distributing the optional Claude URL loader, publish the matching reviewed `v<version>` tag and run `doctor.py --harness claude-inline --check-url` before handing it off. During PR review, use `--renderer-url` pointing to the identical bundle at a published commit. The local browser path needs no release tag or CDN URL. Do not overwrite an old tag or claim that bridge doubles prove live host submission.

## Migrating to 1.4

Theme-pack `appearance` remains accepted for compatibility but no longer selects the mode of rendered views. Harness appearance is now the fallback. To preserve a personal pack's fixed light/dark preference, move it to top-level settings: for example, set `"appearance": "dark"` in `~/.config/visual-response/config.json` or the project's `.visual-response.json`. Explicit spec/flag/config choices still take priority over the harness default.

Remove `output` and obsolete `delivery.mode`, `delivery.npmPackage`, `delivery.repositoryPath`, and `delivery.tagPrefix` settings. Artifact database output, module wrappers, custom harness profiles, and public export tooling have been removed. Replace `claude-artifact`, `module`, or custom harness names with a supported host from the table above. Invalid old settings produce a schema error; user configuration is never silently rewritten. Legacy motion flags are ignored. Feedback schemaVersion 1 and draftVersion 1.0.0 are preserved.

MIT. Bundled dependencies are Oat CSS and Preact; third-party notices are included with the renderer. Oat's optional JavaScript is not loaded. Normal rendering needs Python 3.9+ and no npm installation.
