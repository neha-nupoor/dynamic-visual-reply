"""Optional measurement only: uv run --with tiktoken==0.9.0 python tests/measure_instructions.py."""
import json
from pathlib import Path
import subprocess
import tiktoken

root = Path(__file__).resolve().parents[1]
encoding = tiktoken.get_encoding("o200k_base")
baseline = subprocess.check_output(
    ["git", "show", "8da82a8:skills/dynamic-visual-reply/SKILL.md"], cwd=root, text=True
)
router = (root / "skills/response-design/SKILL.md").read_text()
renderer = (root / "skills/dynamic-visual-reply/SKILL.md").read_text()
route_help = subprocess.check_output(
    ["node", str(root / "skills/dynamic-visual-reply/scripts/route.mjs"), "--help"], text=True
)
host = (root / "skills/dynamic-visual-reply/references/harness/codex.md").read_text()
entry = ("When a reply will present 3+ comparable items, records, questions or steps, or "
         "the user asks for a visual/interactive review, use response-design to choose the "
         "format. Pass `inline:true` in the Codex app and `inline:false` in the Codex terminal. "
         "Honor explicit user format requests.")
paths = {"old_entrypoint": baseline, "new_router": router, "new_renderer": renderer,
         "combined_entrypoints": router + renderer, "route_help": route_help, "entry_rule": entry,
         "old_codex_path": baseline + host, "new_codex_path": router + renderer + host,
         "new_codex_with_help": router + renderer + host + route_help,
         "custom_visual_reference": (root / "skills/response-design/references/custom-visuals.md").read_text()}
print(json.dumps({"tokenizer": "o200k_base", "tiktoken": "0.9.0", "baseline": "8da82a8",
                  "tokens": {key: len(encoding.encode(value)) for key, value in paths.items()},
                  "scope": "Text counts only; excludes reasoning, tool envelopes, specs and billing."}, indent=2))
