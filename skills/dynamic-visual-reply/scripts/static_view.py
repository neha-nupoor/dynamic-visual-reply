"""Finished, read-only HTML and CSS for a view, written by render.py; no JavaScript.

The markup shows the same content the renderer starts with, styled from the theme. Interactive pages place it
directly before the renderer's mount point, and a CSS `:has` rule hides it once the renderer has drawn the app,
so a renderer that never loads still leaves a readable view. With `interactive: false` it is the whole page.
"""
from html import escape
import json
import re

import visual_config

ATTRIBUTE = 'data-dynamic-visual-reply-static'
ROOT_ATTRIBUTE = 'data-dynamic-visual-reply-root'
ROLES = ('surface', 'text', 'muted', 'divider', 'hover', 'selected', 'accent', 'accentBorder', 'onSelected')

# Interactive pages only: hide this block once the renderer has drawn into the mount point that follows it.
HIDE_WHEN_RENDERED = f'[{ATTRIBUTE}]:has(+[{ROOT_ATTRIBUTE}]>*){{display:none}}'
CSS = '''.vr-static{{font:var(--vrs-body)/var(--vrs-leading) var(--vrs-font);color:var(--vrs-text);background:var(--vrs-surface);border:1px solid var(--vrs-divider);border-radius:var(--vrs-radius);padding:var(--vrs-pad);max-width:var(--vrs-max);margin-inline:auto;box-sizing:border-box}}
.vr-static *{{box-sizing:border-box;overflow-wrap:anywhere}}
.vr-static h2{{font-size:var(--vrs-title);line-height:var(--vrs-title-leading);letter-spacing:var(--vrs-tracking);font-weight:700;margin:0 0 16px}}
.vr-static h3{{font-size:var(--vrs-section);font-weight:600;line-height:1.4;margin:0}}
.vr-static p,.vr-static ol,.vr-static dl,.vr-static dd{{margin:0}}
.vr-static a{{color:var(--vrs-accent)}}
.vr-static .vrs-context{{display:grid;gap:4px;font-size:var(--vrs-small);margin-bottom:16px}}
.vr-static .vrs-muted{{color:var(--vrs-muted);font-size:var(--vrs-small)}}
.vr-static .vrs-badge{{justify-self:start;padding:4px 9px;border-radius:var(--vrs-chip);background:var(--vrs-selected);color:var(--vrs-on-selected);font-size:var(--vrs-meta);font-weight:600}}
.vr-static .vrs-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--vrs-card)),1fr));gap:16px}}
.vr-static .vrs-card{{display:grid;align-content:start;gap:12px;padding:var(--vrs-surface-pad);border:1px solid var(--vrs-divider);border-radius:var(--vrs-radius)}}
.vr-static .vrs-recommended{{border-color:var(--vrs-accent-border)}}
.vr-static .vrs-column{{display:grid;align-content:start;gap:12px;padding:12px;border:1px solid var(--vrs-divider);border-radius:var(--vrs-radius)}}
.vr-static .vrs-table{{overflow-x:auto}}
.vr-static table{{width:100%;border-collapse:collapse;font-size:var(--vrs-small)}}
.vr-static th,.vr-static td{{padding:var(--vrs-cell);vertical-align:top;text-align:start;border-bottom:1px solid var(--vrs-divider)}}
.vr-static thead th{{background:var(--vrs-hover);color:var(--vrs-muted);font-weight:600}}
.vr-static .vrs-number{{text-align:right;font-variant-numeric:tabular-nums}}
.vr-static .vrs-flow{{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--vrs-flow)),1fr));gap:8px;list-style:none;padding:0}}
.vr-static .vrs-step{{display:grid;align-content:start;gap:8px;padding:16px;border:1px solid var(--vrs-divider);border-radius:var(--vrs-radius)}}
.vr-static .vrs-step-number{{color:var(--vrs-accent);font-size:var(--vrs-small)}}
.vr-static dl{{display:grid;gap:12px}}
.vr-static dt{{font-size:var(--vrs-small);font-weight:500}}
.vr-static .vrs-pre{{white-space:pre-wrap}}
.vr-static summary{{cursor:pointer;color:var(--vrs-muted);font-size:var(--vrs-small);font-weight:600}}
.vr-static .vrs-pending{{margin-top:16px;padding-top:12px;border-top:1px solid var(--vrs-divider)}}
@media(min-width:600px){{.vr-static{{padding:var(--vrs-pad-wide)}}.vr-static h2{{font-size:var(--vrs-title-wide)}}}}'''.format()


def _name(role):
    return re.sub('[A-Z]', lambda m: '-' + m.group().lower(), role)


def _palette(palette, prefix):
    complete = visual_config.complete_palette(palette)
    return ';'.join(f'--{prefix}-{_name(role)}:{complete[role]}' for role in ROLES)


def theme_css(theme, appearance, inline):
    """Theme sizes and colors as `--vrs-*` variables; `system` and `host` follow light/dark markers, then the OS."""
    type_, layout = theme['type'], theme['layout']
    cell_y, cell_x = theme['table']['cellPadding']
    pad, wide = (layout['inlinePadding'],) * 2 if inline else (layout['contentPaddingCompact'], layout['contentPadding'])
    title, title_wide = (type_['inlineTitle'],) * 2 if inline else (type_['titleCompact'], type_['title'])
    sizes = (f'--vrs-font:{theme["fontFamily"]};--vrs-body:{type_["body"]}px;--vrs-small:{type_["small"]}px;'
             f'--vrs-meta:{type_["meta"]}px;--vrs-leading:{type_["lineHeight"]};--vrs-title:{title}px;--vrs-title-wide:{title_wide}px;'
             f'--vrs-title-leading:{type_["titleLineHeight"]};--vrs-tracking:{type_["titleTracking"]};--vrs-section:{type_["section"]}px;'
             f'--vrs-radius:{theme["radius"]["surface"]}px;--vrs-chip:{theme["radius"]["chip"]}px;--vrs-max:{layout["maxWidth"]}px;'
             f'--vrs-card:{layout["cardMinWidth"]}px;--vrs-flow:{layout["flowMinWidth"]}px;--vrs-surface-pad:{layout["surfacePadding"]}px;'
             f'--vrs-pad:{pad}px;--vrs-pad-wide:{wide}px;--vrs-cell:{cell_y}px {cell_x}px')
    light, dark = _palette(theme['light'], 'vrs-t'), _palette(theme['dark'], 'vrs-t')
    if appearance in ('light', 'dark'):
        css = f'.vr-static{{{sizes};{light if appearance == "light" else dark};color-scheme:{appearance}}}'
    else:
        css = (f'.vr-static{{{sizes};{light};color-scheme:light}}'
               f'@media(prefers-color-scheme:dark){{:root:not([data-theme=light]):not([data-mode=light]) .vr-static{{{dark};color-scheme:dark}}}}'
               f':root[data-theme=dark] .vr-static,:root[data-mode=dark] .vr-static{{{dark};color-scheme:dark}}')
    # `host` borrows Claude's own colors where it defines them; a host accent also stands in for the theme's accent family.
    host = visual_config.HOST_PALETTE if appearance == 'host' else {}
    accent_family = {'accentBorder', 'onSelected'} if 'accent' in host else set()
    values = []
    for role in ROLES:
        own = f'var(--vrs-t-{_name(role)})'
        value = f'var({host[role]},{own})' if role in host else 'var(--vrs-accent)' if role in accent_family else own
        values.append(f'--vrs-{_name(role)}:{value}')
    return css + '.vr-static{' + ';'.join(values) + '}'


def _text(value):
    if value is None:
        return ''
    return json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value)


def _e(value):
    return escape(_text(value), quote=True)


def _safe_url(value):
    return value if isinstance(value, str) and re.match(r'https?://', value, re.I) else None


def _copy(copy, path, **values):
    node = copy
    for part in path.split('.'):
        node = node.get(part) if isinstance(node, dict) else None
    return re.sub(r'\{(\w+)\}', lambda m: str(values.get(m.group(1), '')), node if isinstance(node, str) else path)


def _table(spec, copy):
    columns, rows = spec['columns'], spec.get('rows', [])
    shown = rows[:spec.get('pageSize', 20)]
    number = lambda column: ' class="vrs-number"' if column.get('type') == 'number' else ''
    head = ''.join(f'<th scope="col"{number(c)}>{_e(c["label"])}</th>' for c in columns)
    body = ''.join('<tr>' + ''.join(f'<td{number(c)}>{_e(row.get(c["key"]))}</td>' for c in columns) + '</tr>' for row in shown)
    note = f'<p class="vrs-muted">{_e(_copy(copy, "static.rows", shown=len(shown), count=len(rows)))}</p>' if len(shown) < len(rows) else ''
    return f'<div class="vrs-table"><table aria-label="{_e(spec["title"])}"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>{note}'


def _card(row, copy):
    title = row.get('title') or row.get('name') or row['id']
    parts = [f'<h3>{_e(title)}</h3>']
    if row.get('recommended'):
        parts.append(f'<span class="vrs-badge">{_e(_copy(copy, "recommended"))}</span>')
    if row.get('summary'):
        parts.append(f'<p>{_e(row["summary"])}</p>')
    if row.get('details'):
        parts.append(f'<details><summary>{_e(_copy(copy, "moreDetail"))}</summary><p class="vrs-pre">{_e(row["details"])}</p></details>')
    if _safe_url(row.get('source')):
        parts.append(f'<a href="{_e(row["source"])}" target="_blank" rel="noreferrer">{_e(_copy(copy, "source"))}</a>')
    return f'<article class="vrs-card{" vrs-recommended" if row.get("recommended") else ""}">{"".join(parts)}</article>'


def _cards(spec, copy):
    return '<div class="vrs-grid">' + ''.join(_card(row, copy) for row in spec.get('rows', [])) + '</div>'


def _kanban(spec, copy):
    stages = spec.get('stages', ['To review', 'In progress', 'Done'])
    columns = []
    for stage in stages:
        rows = [row for row in spec.get('rows', []) if row.get('stage', stages[0]) == stage]
        cards = ''.join(f'<article class="vrs-card"><h3>{_e(row.get("title") or row["id"])}</h3></article>' for row in rows)
        columns.append(f'<section class="vrs-column"><h3>{_e(stage)} · {len(rows)}</h3>{cards}</section>')
    return '<div class="vrs-grid">' + ''.join(columns) + '</div>'


def _answer(field, copy):
    kind, value = field.get('type', 'text'), field.get('value', '')
    if kind == 'checkbox':
        return _e(_copy(copy, 'static.yes' if value else 'static.no'))
    if kind == 'select':
        labels = {option['id']: option['label'] for option in field['options']}
        value = labels.get(value, value)
    if kind == 'multiselect':
        value = ', '.join(option['label'] for option in field['options'] if option.get('selected'))
    if value in ('', None):
        return f'<span class="vrs-muted">{_e(_copy(copy, "static.empty"))}</span>'
    return f'<span class="vrs-pre">{_e(value)}</span>' if kind == 'textarea' else _e(value)


def _form(spec, copy):
    items = []
    for field in spec.get('fields', []):
        help_text = f'<p class="vrs-muted">{_e(field["help"])}</p>' if field.get('help') else ''
        items.append(f'<div><dt>{_e(field["label"])}</dt><dd>{_answer(field, copy)}{help_text}</dd></div>')
    return '<dl>' + ''.join(items) + '</dl>'


def _flow(spec, copy):
    steps = []
    for index, node in enumerate(spec.get('nodes', []), 1):
        detail = f'<p>{_e(node["detail"])}</p>' if node.get('detail') else ''
        steps.append(f'<li class="vrs-step"><p class="vrs-step-number">{index}</p><h3>{_e(node["title"])}</h3>{detail}</li>')
    return f'<ol class="vrs-flow">{"".join(steps)}</ol>'


VIEWS = {'table': _table, 'cards': _cards, 'kanban': _kanban, 'form': _form, 'flow': _flow}


def markup(spec, theme, copy, appearance, *, inline, interactive):
    """The static block: a scoped stylesheet plus the finished, read-only view."""
    context = spec.get('context', {})
    goal_next = ''.join(f'<p><strong>{_e(_copy(copy, key))}</strong> {_e(context[key])}</p>' for key in ('goal', 'next') if context.get(key))
    parts = [f'<h2>{_e(spec.get("title") or spec["view"])}</h2>']
    if goal_next:
        parts.append(f'<div class="vrs-context">{goal_next}</div>')
    parts.append(VIEWS[spec['view']](spec, copy))
    if interactive:
        parts.append(f'<p class="vrs-muted vrs-pending">{_e(_copy(copy, "static.pending"))}</p>')
    style = (HIDE_WHEN_RENDERED + '\n' if interactive else '') + CSS + theme_css(theme, appearance, inline)
    visual_config.require('</style' not in style.lower(), 'Static stylesheet contains an unsafe closing tag')
    return f'<div {ATTRIBUTE}><style>{style}</style><section class="vr-static">{"".join(parts)}</section></div>'
