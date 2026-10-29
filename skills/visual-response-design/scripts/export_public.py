#!/usr/bin/env python3
"""Assemble a standalone public repository for this skill; standard library only.

The export contains only this skill with the neutral theme as its default and `delivery.repository`
set, so Claude inline widgets load the renderer from the repository's own release tag on jsDelivr.
It refuses to finish while personal or private strings remain. Nothing is pushed or published.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'node_modules', '__pycache__', '.DS_Store'}
TEXT = {'.md', '.json', '.py', '.mjs', '.js', '.jsx', '.yaml', '.txt', '.csv'}

README = """# Visual Response Design

An agent skill that renders interactive UI in an AI agent's response: tables, cards, forms, Kanban
boards and flows, with batch feedback that goes back to the agent. One prebuilt renderer works in
Codex, Claude, and any harness that can run Python; the agent writes only a small JSON spec.

## Install

```bash
npx skills add {repository} -g --agent codex claude-code cursor --skill visual-response-design -y
```

Then, inside the agent, run `python3 <skill-dir>/scripts/doctor.py` to see which harness was
detected and where feedback will land.

## Where it renders

| Harness | How it shows | How feedback returns |
| --- | --- | --- |
| Codex / ChatGPT widget host | Inline via `contentReference`; larger views in a local browser panel | `window.openai.sendFollowUpMessage`, or a saved file |
| Claude app (inline widget) | Inline; the renderer loads from this repository's release on jsDelivr | `sendPrompt()` starts the next turn |
| Claude artifact | A private artifact page (needs an npm-published renderer URL) | Saved to the artifact's database |
| Claude Code in a terminal, Cursor, other agents | A local browser page served by `serve.py` | A saved `.feedback.json` |
| Anything else | A static HTML file | Copy or export the message |

New harnesses need a profile JSON and a short adapter script, not a renderer rebuild. See
`skills/visual-response-design/SKILL.md`.

## Configure

Settings merge from `config/defaults.json`, the harness profile, `~/.config/visual-response/config.json`,
a project's `.visual-response.json`, then command-line flags. Themes are separate packs: put a
`theme.json` (see `config/schema/theme.schema.json`) in a folder and set `"theme"` to its name or path.

## Release

1. Build the renderer: `cd skills/visual-response-design/assets/renderer && npm ci --ignore-scripts && npm run build`.
2. Run `python3 skills/visual-response-design/scripts/test_renderer.py` and `node --test skills/visual-response-design/scripts/test_adapters.mjs`.
3. Commit, then tag the commit `v<version>` from `assets/renderer/dist/manifest.json` and push the tag.
   jsDelivr serves the bundle at that tag, and `doctor.py --check-url` confirms it matches.
"""

def scrub_check(folder, allowed):
    """Return (path, line) pairs that still mention private names."""
    pattern = re.compile(r'\bneha\b|nupoor|personal-agent-skill|personal-design-system', re.I)
    hits = []
    for path in folder.rglob('*'):
        if path.is_file() and path.suffix in TEXT and path.name not in ('renderer.js', Path(__file__).name):
            for number, line in enumerate(path.read_text(encoding='utf-8', errors='ignore').splitlines(), 1):
                cleaned = line.replace(allowed, '') if allowed else line
                if pattern.search(cleaned):
                    hits.append(f'{path.relative_to(folder)}:{number}: {line.strip()[:120]}')
    return hits

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True, help='Empty folder for the public repository')
    parser.add_argument('--repository', required=True, help='Public GitHub owner/name the export will be pushed to')
    parser.add_argument('--theme', default='neutral', help='Default theme for the public copy')
    parser.add_argument('--git', action='store_true', help='git init the export and make one local commit')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repository):
        parser.error('--repository must look like owner/name')
    out = args.out.resolve()
    if out.exists() and any(out.iterdir()):
        parser.error(f'{out} is not empty')
    target = out / 'skills' / ROOT.name
    shutil.copytree(ROOT, target, ignore=lambda _, names: [n for n in names if n in SKIP or n.endswith('.pyc')])
    defaults_path = target / 'config/defaults.json'
    defaults = json.loads(defaults_path.read_text(encoding='utf-8'))
    defaults['theme'] = args.theme
    defaults['delivery']['repository'] = args.repository
    defaults['delivery']['repositoryPath'] = f'skills/{ROOT.name}'
    defaults_path.write_text(json.dumps(defaults, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (out / 'README.md').write_text(README.replace('{repository}', args.repository), encoding='utf-8')
    (out / '.gitignore').write_text('node_modules/\n__pycache__/\n*.py[cod]\n.DS_Store\n', encoding='utf-8')
    hits = scrub_check(out, args.repository)
    if hits:
        print(json.dumps({'ok': False, 'out': str(out), 'privateMentions': hits}, indent=2))
        sys.exit(1)
    if args.git:
        subprocess.run(['git', 'init', '-q', '-b', 'main', str(out)], check=True)
        subprocess.run(['git', '-C', str(out), 'add', '-A'], check=True)
        subprocess.run(['git', '-C', str(out), 'commit', '-q', '-m', 'Initial public release of visual-response-design'], check=True)
    version = json.loads((target / 'assets/renderer/dist/manifest.json').read_text())['version']
    print(json.dumps({'ok': True, 'out': str(out), 'repository': args.repository, 'theme': args.theme,
                      'releaseTag': f'v{version}', 'license': 'not added; choose one before publishing'}, indent=2))

if __name__ == '__main__':
    main()
