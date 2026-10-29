#!/usr/bin/env python3
"""Hydrate the shipped renderer from JSON for the configured harness; Python standard library only."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import sys

import visual_config
from visual_config import ROOT, load, require

VIEWS = ('table', 'cards', 'form', 'kanban', 'flow')
BUNDLE = ROOT / 'assets/renderer/dist/renderer.js'
MANIFEST = ROOT / 'assets/renderer/dist/manifest.json'

def identifiers(items, field, kind):
    seen = set()
    require(isinstance(items, list), f'{kind} must be an array')
    for item in items:
        require(isinstance(item, dict), f'Each {kind} item must be an object')
        value = item.get(field)
        require(isinstance(value, str) and value.strip(),
                f'{kind}.{field} must be a nonempty string')
        require(value not in seen, f'Duplicate {kind} identifier: {value}')
        seen.add(value)
    return seen

def validate(spec):
    # The schema owns input shape and scalar rules; Python only checks relationships across records.
    visual_config.check_schema(spec, 'spec', 'Spec')
    if spec['view'] in ('table', 'cards', 'kanban') and 'rows' in spec:
        identifiers(spec['rows'], 'id', 'rows')
    if spec['view'] == 'table':
        identifiers(spec['columns'], 'key', 'columns')
    if spec['view'] == 'kanban':
        stages = spec.get('stages', ['To review', 'In progress', 'Done'])
        for row in spec.get('rows', []):
            require(row.get('stage', stages[0]) in stages, f'Invalid stage in row {row["id"]}')
    if spec['view'] == 'form':
        identifiers(spec['fields'], 'id', 'fields')
        for field in spec['fields']:
            if field.get('type') in ('select', 'multiselect'):
                option_ids = identifiers(field['options'], 'id', 'options')
                if field['type'] == 'select':
                    require(field.get('value', '') in option_ids or field.get('value', '') == '',
                            'Selected value must be an option ID')
    if spec['view'] == 'flow':
        identifiers(spec['nodes'], 'id', 'nodes')
    return spec


def resolve_data(spec, source):
    if 'dataFile' not in spec:
        return spec
    require(spec.get('view') in ('table', 'cards', 'kanban'), 'dataFile is supported for record views')
    require('rows' not in spec, 'Use rows or dataFile, not both')
    path = Path(spec.pop('dataFile'))
    path = path if path.is_absolute() else source.parent / path
    if path.suffix.lower() in ('.csv', '.tsv'):
        with path.open(encoding='utf-8-sig', newline='') as stream:
            rows = list(csv.DictReader(stream, delimiter='\t' if path.suffix.lower() == '.tsv' else ','))
        for row in rows:
            for col in spec.get('columns', []):
                if col.get('type') == 'number' and row.get(col['key'], '') != '':
                    try:
                        row[col['key']] = float(row[col['key']])
                    except ValueError:
                        raise ValueError(f'Non-numeric value in {col["key"]}') from None
    else:
        data = load(path)
        rows = data if isinstance(data, list) else data.get('rows') if isinstance(data, dict) else None
    spec['rows'] = rows
    return spec

def apply_patch(spec, patch):
    require(isinstance(patch, dict), 'Patch must be an object')
    require(set(patch) <= {'upsert', 'remove', 'title', 'context', 'revision', 'fields', 'nodes'}, 'Unknown patch operation')
    if 'upsert' in patch or 'remove' in patch:
        require(spec['view'] in ('table', 'cards', 'kanban'), 'Row patches require a record view')
        updates = patch.get('upsert', [])
        identifiers(updates, 'id', 'upsert')
        removed = patch.get('remove', [])
        require(isinstance(removed, list) and all(isinstance(v, str) for v in removed), 'remove must contain IDs')
        rows = {row['id']: row for row in spec['rows'] if row['id'] not in removed}
        for update in updates:
            rows[update['id']] = {**rows.get(update['id'], {}), **update}
        spec['rows'] = list(rows.values())
    for key in ('title', 'context', 'revision', 'fields', 'nodes'):
        if key in patch:
            spec[key] = patch[key]
    if 'revision' not in patch:
        spec['revision'] = spec.get('revision', 1) + 1
    return validate(spec)

def json_for_html(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')

_default_context = None
def default_context():
    """Reproducible context for programmatic use: shipped defaults and the Codex profile, no user files."""
    global _default_context
    if _default_context is None:
        _default_context = visual_config.resolve(isolated=True)
    return _default_context

def placement(spec, width=None, height=None, *, config=None, theme=None):
    """Conservative first-render estimate from theme tokens, not a measurement of the host's free space."""
    context = default_context()
    config, theme = config or context.config, theme or context.theme
    settings = config['placement']
    width = width or settings['viewport']['width']
    height = height or settings['viewport']['height']
    require(width >= 320 and height >= 240, 'Viewport must be at least 320 × 240')
    budget = min(settings['heightBudget']['maxPx'], int(height * settings['heightBudget']['fraction']))
    limits = settings['inlineLimits']
    type_, layout, control, unit = theme['type'], theme['layout'], theme['control'], theme['spacingUnit']
    cell_y, cell_x = theme['table']['cellPadding']
    pad = layout['inlinePadding']
    inner = width - 2 * pad - 8
    char = type_['small'] * .5
    body_line, small_line = type_['body'] * type_['lineHeight'], type_['small'] * type_['lineHeight']
    title_line = type_['inlineTitle'] * type_['titleLineHeight']
    chars_per_line = max(20, int(inner / char))
    context_lines = sum(math.ceil(len(spec.get('context', {}).get(k, '')) / chars_per_line) for k in ('goal', 'next'))
    title_lines = max(1, math.ceil(len(spec.get('title', '')) / max(20, int((inner - 90) / (type_['inlineTitle'] * .42)))))
    action_row = control['minHeight'] + 2 * unit
    # Padding, title, primary action, collapsed feedback summary, status line, then wrapped extras.
    base = 2 * pad + title_line + 2 * unit + action_row + control['minHeight'] + small_line + context_lines * small_line + (title_lines - 1) * title_line
    feedback_block = control['inputHeight'] + control['minHeight']
    view = spec['view']
    estimated_width = 320
    reason = 'Small view fits the estimated inline budget'
    limit = limits.get(view)
    if view == 'table':
        rows, cols = spec.get('rows', []), spec['columns']
        column_widths = [max(90, min(180, len(c['label']) * char + 28)) for c in cols]
        estimated_width = control['minHeight'] + 2 * cell_x + 190 + sum(column_widths)
        header = control['inputHeight'] + 2 * unit + control['minHeight'] + unit + small_line + 2 * cell_y
        row_heights = []
        for row in rows:
            lines = max([1] + [math.ceil(len(str(row.get(c['key'], ''))) / max(10, int(w / char))) for c, w in zip(cols, column_widths)])
            row_heights.append(max(feedback_block + 2 * cell_y, lines * small_line + 2 * cell_y))
        estimated_height = base + header + sum(row_heights)
        allowed = bool(limit) and len(rows) <= limit['rows'] and len(cols) <= limit['columns']
        if not allowed:
            reason = f'Table exceeds {limit["rows"]} rows or {limit["columns"]} data columns' if limit else 'Tables are standalone for this harness'
    elif view == 'cards':
        rows = spec.get('rows', [])
        across = max(1, min(2, int(inner // (layout['cardMinWidth'] + 15))))
        card_width = max(layout['cardMinWidth'], inner / across - 2 * unit)
        card_heights = [2 * layout['surfacePadding'] + body_line + feedback_block + control['minHeight'] + 4 * unit
                        + body_line * math.ceil((len(r.get('title', '')) + len(r.get('summary', ''))) / max(20, int(card_width / char))) for r in rows]
        estimated_height = base + sum(max(card_heights[i:i + across], default=0) for i in range(0, len(rows), across))
        estimated_width = layout['cardMinWidth'] + 40
        allowed = bool(limit) and len(rows) <= limit['items']
        if not allowed:
            reason = f'Cards exceed {limit["items"]} items' if limit else 'Cards are standalone for this harness'
    elif view == 'form':
        fields = spec.get('fields', [])
        units = sum(len(f.get('options', [])) if f.get('type') == 'multiselect' else 2 if f.get('type') == 'textarea' else 1 for f in fields)
        estimated_height = base + units * (control['inputHeight'] + small_line + unit)
        allowed = bool(limit) and units <= limit['units']
        if not allowed:
            reason = f'Form exceeds {limit["units"]} compact control units; textareas count as 2' if limit else 'Forms are standalone for this harness'
    elif view == 'flow':
        nodes = spec['nodes']
        across = max(1, int(inner // layout['flowMinWidth']))
        detail_lines = max([1] + [math.ceil(len(n.get('detail', '')) / max(25, int(inner / char))) for n in nodes])
        node_height = 4 * unit + 2 * body_line + unit
        estimated_height = base + math.ceil(len(nodes) / across) * node_height + control['minHeight'] + 3 * unit + detail_lines * body_line + feedback_block
        allowed = bool(limit) and len(nodes) <= limit['nodes']
        if not allowed:
            reason = f'A flow larger than {limit["nodes"]} nodes uses the side panel' if limit else 'Flows are standalone for this harness'
    else:
        rows = spec.get('rows', [])
        stages = spec.get('stages', ['To review', 'In progress', 'Done'])
        counts = [sum(1 for r in rows if r.get('stage', stages[0]) == s) for s in stages]
        across = max(1, int(inner // (layout['cardMinWidth'] + 12)))
        card = 2 * layout['surfacePadding'] + body_line + control['inputHeight'] + feedback_block
        # Stage columns wrap onto further rows when the width can't fit them side by side.
        estimated_height = base + sum(body_line + 3 * unit + max(counts[i:i + across]) * card for i in range(0, len(counts), across))
        allowed = bool(limit) and len(rows) <= limit.get('items', 0)
        if not allowed:
            reason = 'Kanban uses the side panel'
    if allowed and estimated_width > inner:
        allowed = False
        reason = 'Estimated content width would require horizontal scrolling'
    if allowed and estimated_height > budget:
        allowed = False
        reason = 'Estimated view height exceeds the inline screen budget'
    return {'mode': 'inline' if allowed else 'standalone', 'reason': reason,
            'estimatedHeightPx': round(estimated_height), 'estimatedWidthPx': round(estimated_width),
            'heightBudgetPx': budget, 'viewportWidthPx': width, 'viewportHeightPx': height}

def manifest():
    data = load(MANIFEST)
    require(hashlib.sha256(BUNDLE.read_bytes()).hexdigest() == data['sha256'], 'Renderer bundle differs from its manifest; rebuild before use')
    return data

def runtime_config(context, appearance):
    """Only what differs from the defaults compiled into the bundle, to keep pages small."""
    defaults = load(ROOT / 'config/defaults.json')
    config = {'harness': context.harness['id'], 'appearance': appearance}
    if context.harness.get('adapter'):
        config['adapter'] = Path(context.harness['adapter']).stem
    copy = visual_config.diff(context.config.get('copy', {}), defaults['copy'])
    feedback = visual_config.diff(context.config.get('feedback', {}), defaults['feedback'])
    if copy:
        config['copy'] = copy
    if feedback:
        config['feedback'] = feedback
    if appearance == 'host' and context.harness['id'] == 'claude-inline':
        config['hostPalette'] = visual_config.HOST_PALETTE
    return config

def page_theme(context):
    return visual_config.diff(context.theme, load(ROOT / 'themes/neutral/theme.json'))

def fragment(spec, context, appearance, info, delivery):
    parts = ['<div data-visual-response-root></div>',
             '<script type="application/json" data-visual-response-config>' + json_for_html(runtime_config(context, appearance)) + '</script>',
             '<script type="application/json" data-visual-response-theme>' + json_for_html(page_theme(context)) + '</script>',
             '<script type="application/json" data-visual-response-spec>' + json_for_html(spec) + '</script>']
    if context.harness['id'] == 'claude-inline':
        url = visual_config.renderer_url(delivery, info['version'])
        require(url, 'No renderer URL: set delivery.rendererUrl, or delivery.repository for a public GitHub release; run scripts/doctor.py for details.')
        integrity = info.get('sri') if delivery.get('integrity') == 'manifest' else delivery.get('integrity')
        attributes = f' integrity="{integrity}" crossorigin="anonymous"' if integrity else ''
        parts.append(f'<script src="{url}"{attributes}></script>')
    else:
        bundle = BUNDLE.read_text(encoding='utf-8')
        require('</script' not in bundle.lower(), 'Bundle contains an unsafe closing script tag')
        parts.append('<script data-visual-response-runtime>\n' + bundle + '\n</script>')
    return '\n'.join(parts) + '\n'

def page_style(context, appearance):
    theme, width = context.theme, context.theme['layout']['maxWidth']
    light, dark = theme['light']['canvas'], theme['dark']['canvas']
    gutter = 'padding-block:16px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))'
    if appearance in ('system', 'host'):
        return (f':root{{--vr-page:{light}}}@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--vr-page:{dark};color-scheme:dark}}}}'
                f':root[data-theme="dark"]{{--vr-page:{dark};color-scheme:dark}}body{{margin:0;{gutter};font-family:system-ui;background:var(--vr-page)}}'
                f'[data-visual-response-root]{{max-width:{width}px;margin:auto}}')
    canvas = theme[appearance]['canvas']
    return (f':root{{color-scheme:{appearance}}}body{{margin:0;{gutter};font-family:system-ui;background:{canvas}}}'
            f'[data-visual-response-root]{{max-width:{width}px;margin:auto}}')

def wrap(body, kind, spec, context, appearance):
    if kind == 'fragment':
        return body
    style = page_style(context, appearance)
    return ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Visual response</title><style>{style}</style></head><body>\n{body}</body></html>\n')

def handoff(context, out, kind, size):
    identifier = context.harness['id']
    if identifier == 'codex' and kind == 'fragment':
        return {'type': 'contentReference', 'value': 'visualize' + json.dumps({'path': str(out)}, ensure_ascii=False)}
    if identifier == 'claude-inline':
        return {'type': 'show_widget', 'file': str(out), 'bytes': size,
                'instruction': 'Read this file and pass its full contents unchanged as show_widget widget_code.'}
    if identifier in ('browser-local', 'claude-code'):
        return {'type': 'serve', 'command': f'python3 "{ROOT / "scripts/serve.py"}" "{out}" --port 0'}
    return {'type': 'file', 'path': str(out)}


def render(spec, out, mode='auto', viewport_width=None, viewport_height=None, *, context=None):
    validate(spec)
    context = context or default_context()
    enabled = context.config['views']['enabled']
    require(spec['view'] in enabled, f'View {spec["view"]!r} is disabled by configuration (views.enabled)')
    requested = mode if mode != 'auto' else spec.get('presentation', 'auto')
    decision = placement(spec, viewport_width, viewport_height, config=context.config, theme=context.theme)
    if requested != 'auto':
        decision.update(mode=requested, reason='Explicit presentation override')
    limit = context.config['placement'].get('maxSpecBytes')
    if requested == 'auto' and decision['mode'] == 'inline' and limit and len(json_for_html(spec).encode()) > limit:
        decision.update(mode='standalone', reason=f'Spec exceeds {limit} bytes, the inline size limit for this harness')
    # Larger Codex and Claude inline views use the existing local browser feedback loop.
    info = manifest()
    if decision['mode'] == 'standalone' and context.harness['id'] in ('codex', 'claude-inline'):
        context = context.switch('browser-local')
    spec['resolvedPresentation'] = decision
    # Draft keys follow draftVersion so cosmetic or harness changes never discard saved drafts.
    spec['stateKey'] = hashlib.sha256((info.get('draftVersion', info['version']) + ':' + spec['viewId'] + ':' + spec['view']).encode()).hexdigest()[:24]
    appearance = spec.get('appearance') or context.appearance
    delivery = context.config['delivery']
    delivery_mode = 'url' if context.harness['id'] == 'claude-inline' else 'embed'
    out.parent.mkdir(parents=True, exist_ok=True)
    snapshot = out.with_suffix('.spec.json')
    snapshot.write_text(json.dumps(spec, ensure_ascii=False, allow_nan=False, indent=2) + '\n', encoding='utf-8')
    data = json_for_html(spec)
    result = {'harness': context.harness['id'], 'theme': context.theme['name'], 'view': spec['view'],
              'rendererVersion': info['version'], 'specBytes': len(data.encode()), 'rendererBytes': info['bytes'],
              'delivery': delivery_mode, 'spec': str(snapshot), 'placement': decision}
    kind = 'fragment' if decision['mode'] == 'inline' and context.harness['id'] in ('codex', 'claude-inline') else 'document'
    body = fragment(spec, context, appearance, info, delivery)
    size_limit = context.config['placement']['maxInlineBytes']
    if decision['mode'] == 'inline' and len(body.encode()) >= size_limit:
        require(requested == 'auto', f'Inline UI exceeds {size_limit} bytes; reduce the dataset or use standalone')
        decision.update(mode='standalone', reason='Payload exceeds the inline file-size limit')
        if context.harness['id'] in ('codex', 'claude-inline'):
            context = context.switch('browser-local')
            delivery = context.config['delivery']
            result.update(harness='browser-local', delivery='embed')
        kind = 'document'
        body = fragment(spec, context, appearance, info, delivery)
    output = wrap(body, kind, spec, context, appearance)
    out.write_text(output, encoding='utf-8')
    result.update(path=str(out), format=decision['mode'], output=kind, handoff=handoff(context, out, kind, len(output.encode())))
    if result['handoff']['type'] == 'contentReference':
        result['contentReference'] = result['handoff']['value']
    print(json.dumps(result, ensure_ascii=False))
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', type=Path, help='JSON specification; dataFile paths resolve relative to this file')
    parser.add_argument('--patch', type=Path, help='Apply row upserts/removals or metadata updates to --spec')
    parser.add_argument('--out', type=Path, help='Output HTML path')
    parser.add_argument('--format', choices=('auto', 'inline', 'standalone'), default='auto')
    parser.add_argument('--harness', help='Supported host (default: config, then environment suggestion)')
    parser.add_argument('--theme', help='Theme pack name, theme.json path, or pack folder')
    parser.add_argument('--appearance', choices=('light', 'dark', 'system', 'host'))
    parser.add_argument('--renderer-url', help='Published renderer.js URL for url delivery')
    parser.add_argument('--viewport-width', type=int, help='Expected inline width in pixels')
    parser.add_argument('--viewport-height', type=int, help='Expected viewport height; inline uses the configured fraction, capped')
    parser.add_argument('--print-config', action='store_true', help='Print the merged configuration with the layer each value came from')
    parser.add_argument('--theme-css', type=Path, help='Write the resolved theme as CSS custom properties for hand-written views')
    parser.add_argument('--catalog', action='store_true', help='Print available views, harnesses and examples without loading source')
    args = parser.parse_args()
    if args.catalog:
        print(json.dumps({'schemaVersion': 1, 'views': list(VIEWS), 'harnesses': visual_config.harness_ids(),
                          'contract': str(ROOT / 'references/renderer-contract.md'), 'schemas': str(ROOT / 'config/schema'),
                          'examples': str(ROOT / 'assets/examples')}))
        return
    cli = {'harness': args.harness, 'theme': args.theme, 'appearance': args.appearance}
    delivery = {'rendererUrl': args.renderer_url} if args.renderer_url else {}
    if delivery:
        cli['delivery'] = delivery
    try:
        context = visual_config.resolve(cli)
        if args.print_config or args.theme_css:
            if args.theme_css:
                args.theme_css.write_text(visual_config.css_variables(context.theme, context.appearance), encoding='utf-8')
            if args.print_config:
                print(json.dumps({'harness': context.harness['id'], 'harnessReason': context.harness_reason,
                                  'theme': context.theme['name'], 'themeSource': context.theme_source,
                                  'appearance': context.appearance, 'layers': context.layers,
                                  'sources': context.sources, 'config': context.config}, ensure_ascii=False, indent=2))
            return
        parser.error('--spec and --out are required') if not args.spec or not args.out else None
        source = args.spec.resolve()
        spec = validate(resolve_data(load(source), source))
        if args.patch:
            spec = apply_patch(spec, load(args.patch))
        render(spec, args.out.resolve(), args.format, args.viewport_width, args.viewport_height, context=context)
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        sys.exit(2)

if __name__ == '__main__':
    main()
