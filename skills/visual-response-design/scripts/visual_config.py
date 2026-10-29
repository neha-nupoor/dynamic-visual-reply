"""Configuration, theme-pack and harness-profile resolution; Python standard library only."""
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / 'config'
SCHEMA_DIR = CONFIG_DIR / 'schema'
HARNESS_DIR = ROOT / 'harnesses'
THEME_DIR = ROOT / 'themes'
PROJECT_FILE = '.visual-response.json'
# Spec keys allowed to override configuration for a single view; anything else stays with the user or project.
SPEC_OVERRIDES = ('appearance',)


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


# ---------------------------------------------------------------- merging

def merge(base, override):
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override
    out = dict(base)
    for key, value in override.items():
        out[key] = merge(base[key], value) if isinstance(value, dict) and isinstance(base.get(key), dict) else value
    return out


def _leaves(value, prefix=''):
    if isinstance(value, dict) and value:
        for key, item in value.items():
            if key != '$schema':
                yield from _leaves(item, f'{prefix}.{key}' if prefix else key)
    else:
        yield prefix, value


def diff(value, base):
    """The parts of `value` that differ from `base`, for compact pages that ship `base` in the bundle."""
    if not isinstance(value, dict) or not isinstance(base, dict):
        return value
    out = {}
    for key, item in value.items():
        if key not in base:
            out[key] = item
        elif isinstance(item, dict) and isinstance(base[key], dict):
            nested = diff(item, base[key])
            if nested:
                out[key] = nested
        elif item != base[key]:
            out[key] = item
    return out


# ---------------------------------------------------------------- JSON Schema subset

def _resolve_ref(ref, root, base_dir):
    target, _, pointer = ref.partition('#')
    document = load(base_dir / target) if target else root
    node = document
    for part in [p for p in pointer.split('/') if p]:
        node = node[part]
    return node, (document if target else root)


def _type_ok(value, expected):
    checks = {'object': lambda v: isinstance(v, dict), 'array': lambda v: isinstance(v, list),
              'string': lambda v: isinstance(v, str), 'boolean': lambda v: isinstance(v, bool),
              'integer': lambda v: isinstance(v, int) and not isinstance(v, bool),
              'number': lambda v: isinstance(v, (int, float)) and not isinstance(v, bool), 'null': lambda v: v is None}
    return any(checks[t](value) for t in (expected if isinstance(expected, list) else [expected]))


def schema_errors(instance, schema, root=None, base_dir=SCHEMA_DIR, path='$'):
    """Validate the JSON Schema keywords the shipped schemas use; returns a list of messages."""
    root = schema if root is None else root
    if '$ref' in schema:
        target, target_root = _resolve_ref(schema['$ref'], root, base_dir)
        return schema_errors(instance, target, target_root, base_dir, path)
    errors = []
    sub = lambda s, i=instance, p=path: schema_errors(i, s, root, base_dir, p)
    if 'type' in schema and not _type_ok(instance, schema['type']):
        return [f'{path}: expected {schema["type"]}']
    if 'const' in schema and instance != schema['const']:
        errors.append(f'{path}: must equal {schema["const"]!r}')
    if 'enum' in schema and instance not in schema['enum']:
        errors.append(f'{path}: must be one of {schema["enum"]}')
    if 'not' in schema and not sub(schema['not']):
        errors.append(f'{path}: matches a forbidden value')
    for part in schema.get('allOf', []):
        errors += sub(part)
    if 'anyOf' in schema and all(sub(part) for part in schema['anyOf']):
        errors.append(f'{path}: matches none of the allowed shapes')
    if 'if' in schema:
        branch = schema.get('then') if not sub(schema['if']) else schema.get('else')
        if branch:
            errors += sub(branch)
    if isinstance(instance, str):
        if len(instance) < schema.get('minLength', 0):
            errors.append(f'{path}: too short')
        if 'maxLength' in schema and len(instance) > schema['maxLength']:
            errors.append(f'{path}: longer than {schema["maxLength"]}')
        if 'pattern' in schema and not re.search(schema['pattern'], instance):
            errors.append(f'{path}: does not match {schema["pattern"]}')
    if _type_ok(instance, 'number'):
        if 'minimum' in schema and instance < schema['minimum']:
            errors.append(f'{path}: below {schema["minimum"]}')
        if 'maximum' in schema and instance > schema['maximum']:
            errors.append(f'{path}: above {schema["maximum"]}')
        if 'exclusiveMinimum' in schema and instance <= schema['exclusiveMinimum']:
            errors.append(f'{path}: must exceed {schema["exclusiveMinimum"]}')
    if isinstance(instance, list):
        if len(instance) < schema.get('minItems', 0):
            errors.append(f'{path}: needs at least {schema["minItems"]} items')
        if 'maxItems' in schema and len(instance) > schema['maxItems']:
            errors.append(f'{path}: allows at most {schema["maxItems"]} items')
        if schema.get('uniqueItems') and len({json.dumps(i, sort_keys=True) for i in instance}) != len(instance):
            errors.append(f'{path}: items must be unique')
        if 'items' in schema:
            for index, item in enumerate(instance):
                errors += sub(schema['items'], item, f'{path}[{index}]')
    if isinstance(instance, dict):
        for name in schema.get('required', []):
            if name not in instance:
                errors.append(f'{path}: missing {name}')
        properties = schema.get('properties', {})
        for name, value in instance.items():
            if name in properties:
                errors += sub(properties[name], value, f'{path}.{name}')
            elif schema.get('additionalProperties') is False:
                errors.append(f'{path}: unknown key {name}')
            elif isinstance(schema.get('additionalProperties'), dict):
                errors += sub(schema['additionalProperties'], value, f'{path}.{name}')
    return errors


def check_schema(instance, name, label):
    errors = schema_errors(instance, load(SCHEMA_DIR / f'{name}.schema.json'))
    require(not errors, f'{label} is invalid: ' + '; '.join(errors[:5]))


# ---------------------------------------------------------------- themes

def skill_dirs(env=os.environ):
    home = Path(env.get('HOME', Path.home()))
    extra = [Path(p) for p in env.get('VISUAL_RESPONSE_THEME_PATH', '').split(os.pathsep) if p]
    return extra + [ROOT.parent, home / '.agents/skills', home / '.claude/skills', home / '.codex/skills', home / '.cursor/skills']


def _theme_file(folder):
    for candidate in (folder / 'theme.json', folder / 'assets/theme.json'):
        if candidate.is_file():
            return candidate
    return None


def find_theme(reference, env=os.environ, base_dir=None):
    """Return (theme, source) for a pack name, a path, or an inline object; None when not found."""
    if isinstance(reference, dict):
        return reference, 'inline'
    path = Path(reference).expanduser()
    if not path.is_absolute() and base_dir and ('/' in reference or reference.endswith('.json')):
        path = base_dir / path
    if path.suffix == '.json' and path.is_file():
        return load(path), str(path)
    if path.is_dir() and _theme_file(path):
        return load(_theme_file(path)), str(_theme_file(path))
    if re.fullmatch(r'[a-z0-9][a-z0-9-]*', reference):
        for folder in [THEME_DIR / reference] + [d / reference for d in skill_dirs(env)]:
            found = _theme_file(folder)
            if found:
                return load(found), str(found)
    return None


def complete_theme(theme):
    """Fill keys added after theme v2 from the neutral theme, so older packs keep working."""
    return merge(load(THEME_DIR / 'neutral/theme.json'), theme)


def luminance(color):
    rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    return sum(a * b for a, b in zip(linear, (.2126, .7152, .0722)))


def contrast(first, second):
    values = sorted((luminance(first), luminance(second)))
    return (values[1] + .05) / (values[0] + .05)


def contrast_problems(theme):
    problems = []
    for mode in ('light', 'dark'):
        palette = theme[mode]
        pairs = [(fg, bg, 4.5) for bg in ('canvas', 'surface', 'selected', 'hover') for fg in ('text', 'muted', 'accent')]
        pairs += [('onAccent', 'accent', 4.5), ('controlBorder', 'surface', 3), ('accent', 'surface', 3)]
        for fg, bg, minimum in pairs:
            ratio = contrast(palette[fg], palette[bg])
            if ratio < minimum:
                problems.append(f'{mode}: {fg} on {bg} is {ratio:.2f}:1, needs {minimum}:1')
    return problems


def css_variables(theme, appearance=None):
    """CSS custom properties for hand-written views that should match the renderer."""
    def block(palette):
        lines = [f'  --vr-{re.sub("[A-Z]", lambda m: "-" + m.group().lower(), role)}: {value};' for role, value in palette.items()]
        return '\n'.join(lines)
    shared = (f'  --vr-font: {theme["fontFamily"]};\n  --vr-radius-control: {theme["radius"]["control"]}px;\n'
              f'  --vr-radius-surface: {theme["radius"]["surface"]}px;\n  --vr-control-height: {theme["control"]["minHeight"]}px;')
    appearance = appearance or theme.get('appearance', 'light')
    first = 'dark' if appearance == 'dark' else 'light'
    css = f':root {{\n{shared}\n{block(theme[first])}\n}}\n'
    if appearance in ('system', 'host'):
        css += (f'@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{\n{block(theme["dark"])}\n}} }}\n'
                f':root[data-theme="dark"] {{\n{block(theme["dark"])}\n}}\n')
    return css


def renderer_url(delivery, version):
    """The configured URL, or the jsDelivr GitHub URL for this skill's release tag when only `repository` is set."""
    if delivery.get('rendererUrl'):
        return delivery['rendererUrl']
    if delivery.get('repository'):
        tag = delivery.get('tagPrefix', 'v') + version
        path = delivery.get('repositoryPath', 'skills/visual-response-design').strip('/')
        return f'https://cdn.jsdelivr.net/gh/{delivery["repository"]}@{tag}/{path}/assets/renderer/dist/renderer.js'
    return None


# ---------------------------------------------------------------- harnesses

def harness_ids():
    return sorted(p.stem for p in HARNESS_DIR.glob('*.json'))


def load_harness(identifier):
    path = HARNESS_DIR / f'{identifier}.json'
    require(path.is_file(), f'Unknown harness {identifier!r}; available: {", ".join(harness_ids())}')
    profile = load(path)
    check_schema(profile, 'harness', f'Harness profile {identifier}')
    require(profile['id'] == identifier, f'Harness profile {path.name} declares id {profile["id"]!r}')
    if profile.get('adapter'):
        require((HARNESS_DIR / profile['adapter']).is_file(), f'Harness {identifier} adapter {profile["adapter"]} is missing')
    return profile


def detect_harness(env=os.environ):
    """Pick the highest-priority profile whose detect rules match; `static` when none do."""
    matches = []
    for identifier in harness_ids():
        rules = load(HARNESS_DIR / f'{identifier}.json').get('detect')
        if not rules:
            continue
        env_ok = all(name in env and (value == '*' or env[name] == value) for name, value in rules.get('env', {}).items())
        any_ok = not rules.get('anyEnv') or any(name in env for name in rules['anyEnv'])
        if (rules.get('env') or rules.get('anyEnv')) and env_ok and any_ok:
            matches.append((rules.get('priority', 0), identifier, rules))
    if not matches:
        return 'static', 'No harness markers found in the environment'
    priority, identifier, rules = max(matches)
    markers = list(rules.get('env', {})) + [n for n in rules.get('anyEnv', []) if n in env]
    return identifier, f'Detected from environment ({", ".join(markers)})'


# ---------------------------------------------------------------- resolution

def user_config_path(env=os.environ):
    if env.get('VISUAL_RESPONSE_CONFIG'):
        return Path(env['VISUAL_RESPONSE_CONFIG']).expanduser()
    base = Path(env['XDG_CONFIG_HOME']) if env.get('XDG_CONFIG_HOME') else Path(env.get('HOME', Path.home())) / '.config'
    return base / 'visual-response/config.json'


def project_config_path(start):
    start = Path(start).resolve()
    for folder in [start, *start.parents]:
        candidate = folder / PROJECT_FILE
        if candidate.is_file():
            return candidate
        if (folder / '.git').exists():
            return None
    return None


@dataclass
class Context:
    config: dict
    theme: dict
    harness: dict
    harness_reason: str
    theme_source: str
    layers: list = field(default_factory=list)
    sources: dict = field(default_factory=dict)
    inputs: dict = field(default_factory=dict)

    def switch(self, harness):
        """The same inputs resolved for another harness profile."""
        return resolve(harness=harness, **self.inputs)

    @property
    def appearance(self):
        return self.config.get('appearance') or self.theme.get('appearance') or 'light'


def resolve(cli=None, *, harness=None, cwd=None, env=os.environ, isolated=False):
    """Merge defaults → harness profile → user → project → command-line options, then load the theme.

    `isolated` skips user/project files and environment detection, for tests and reproducible output.
    """
    cli = {k: v for k, v in (cli or {}).items() if v is not None}
    layers = [('defaults', str(CONFIG_DIR / 'defaults.json'), load(CONFIG_DIR / 'defaults.json'))]
    if not isolated:
        user_path = user_config_path(env)
        if user_path.is_file():
            layers.append(('user', str(user_path), load(user_path)))
        project_path = project_config_path(cwd or Path.cwd())
        if project_path:
            layers.append(('project', str(project_path), load(project_path)))
    if cli:
        layers.append(('command line', 'flags', cli))
    for name, source, data in layers:
        check_schema(data, 'config', f'{name.capitalize()} config ({source})')

    chosen = harness or cli.get('harness')
    if not chosen:
        for _, _, data in layers:
            chosen = data.get('harness', chosen)
    if chosen in (None, 'auto'):
        chosen, reason = ('codex', 'Isolated default') if isolated else detect_harness(env)
    else:
        reason = 'Requested explicitly' if (harness or cli.get('harness')) else 'Set in configuration'
    profile = load_harness(chosen)
    layers.insert(1, (f'harness:{chosen}', str(HARNESS_DIR / f'{chosen}.json'), profile.get('config', {})))

    config, sources = {}, {}
    for name, _, data in layers:
        config = merge(config, data)
        for leaf, _ in _leaves(data):
            sources[leaf] = name
    config.pop('$schema', None)

    base_dir = Path(next((s for n, s, _ in layers if n == 'project'), cwd or Path.cwd())).parent
    found = find_theme(config['theme'], env, base_dir) or find_theme(config.get('themeFallback') or 'neutral', env, base_dir)
    require(found, f'Theme {config["theme"]!r} was not found and the fallback is missing')
    theme, theme_source = found
    check_schema(theme, 'theme', f'Theme ({theme_source})')
    inputs = {'cli': cli, 'cwd': cwd, 'env': env, 'isolated': isolated}
    return Context(config, complete_theme(theme), profile, reason, theme_source, [(n, s) for n, s, _ in layers], sources, inputs)
