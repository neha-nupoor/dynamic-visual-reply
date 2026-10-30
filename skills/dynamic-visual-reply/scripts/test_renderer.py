#!/usr/bin/env python3
"""Data integrity, configuration and harness output checks; standard library only."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import socket
import subprocess
import sys
import urllib.request
from urllib.parse import urlparse
import unittest
import render
import visual_config

ROOT = render.ROOT
SPEC_SCHEMA = visual_config.load(visual_config.SCHEMA_DIR / 'spec.schema.json')
COMMIT = 'a' * 40
URL = f'https://cdn.jsdelivr.net/gh/someone/dynamic-visual-reply@{COMMIT}/skills/dynamic-visual-reply/assets/renderer/dist/renderer.js'
DEFAULT_THEME = visual_config.load(visual_config.CONFIG_DIR / 'defaults.json')['theme']

def quiet(fn, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*args, **kwargs)

class RendererTests(unittest.TestCase):
    def table(self):
        return render.load(ROOT / 'assets/examples/table.json')

    def example(self, name):
        return render.load(ROOT / 'assets/examples' / f'{name}.json')

    def test_stable_patch_merges_and_removes_without_losing_other_values(self):
        spec = self.table()
        updated = render.apply_patch(spec, {'upsert': [{'id': 'cards', 'status': 'Accepted'}], 'remove': ['flows']})
        rows = {row['id']: row for row in updated['rows']}
        self.assertEqual(rows['cards']['name'], 'Cards')
        self.assertEqual(rows['cards']['status'], 'Accepted')
        self.assertNotIn('flows', rows)
        self.assertEqual(updated['revision'], 2)

    def test_duplicate_ids_and_reserved_ids_are_rejected(self):
        for identifier in ('table', '__proto__'):
            spec = self.table()
            spec['rows'].append({'id': identifier, 'name': 'Duplicate or reserved'})
            with self.assertRaises(ValueError):
                render.validate(spec)

    def test_csv_reference_resolves_and_preserves_numeric_sort_values(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / 'rows.csv').write_text('id,name,effort\na,A,10\nb,B,2\n')
            spec = self.table()
            spec.pop('rows')
            spec['dataFile'] = 'rows.csv'
            loaded = render.validate(render.resolve_data(spec, base / 'spec.json'))
            self.assertEqual(loaded['rows'][0]['effort'], 10)
            self.assertIsInstance(loaded['rows'][0]['effort'], float)

    def test_script_like_user_content_is_escaped_but_lossless(self):
        value = {'message': '</script><img src=x onerror=alert(1)> &  '}
        encoded = render.json_for_html(value)
        self.assertNotIn('</script>', encoded)
        self.assertEqual(json.loads(encoded), value)

    def test_all_examples_pass_contract_and_schema(self):
        for path in (ROOT / 'assets/examples').glob('*.json'):
            with self.subTest(path=path.name):
                spec = render.load(path)
                render.validate(spec)
                self.assertEqual(visual_config.schema_errors(spec, SPEC_SCHEMA), [])

    def test_schema_and_python_validator_reject_the_same_invalid_specs(self):
        broken = []
        spec = self.table(); spec['rows'][0]['id'] = '__proto__'; broken.append(spec)
        spec = self.table(); spec['pageSize'] = 500; broken.append(spec)
        spec = self.table(); spec['view'] = 'chart'; broken.append(spec)
        spec = self.example('form'); spec['fields'][3]['value'] = 'yes'; broken.append(spec)
        spec = self.example('kanban'); spec['stages'] = ['A', 'A']; broken.append(spec)
        spec = self.table(); spec['appearance'] = 'neon'; broken.append(spec)
        for index, spec in enumerate(broken):
            with self.subTest(case=index):
                self.assertTrue(visual_config.schema_errors(spec, SPEC_SCHEMA))
                with self.assertRaises(ValueError):
                    render.validate(spec)

    def test_codex_inline_is_offline_and_reuses_identical_code_for_new_data(self):
        with tempfile.TemporaryDirectory() as directory:
            first, second = Path(directory) / 'a.html', Path(directory) / 'b.html'
            spec = self.table()
            result = quiet(render.render, copy.deepcopy(spec), first, 'inline')
            spec['title'] = 'Another dataset review'
            quiet(render.render, spec, second, 'inline')
            extract = lambda p: p.read_text().split('<script data-dynamic-visual-reply-runtime>\n', 1)[1]
            self.assertEqual(extract(first), extract(second))
            self.assertLess(first.stat().st_size, 1_000_000)
            self.assertNotIn('<script src=', first.read_text())
            self.assertIn('"adapter":"codex"', first.read_text())
            self.assertTrue(first.with_suffix('.spec.json').exists())
            self.assertTrue(result['contentReference'].startswith('visualize'))

    def test_invalid_selected_form_value_rejected(self):
        form = self.example('form')
        form['fields'][0]['value'] = 'not-an-option'
        with self.assertRaises(ValueError):
            render.validate(form)

    def test_spec_schema_is_the_rendering_validator(self):
        # Regressions for the two validators that previously disagreed.
        cases = []
        spec = self.table(); spec['pageSize'] = True; cases.append(spec)
        spec = self.table(); spec['schemaVersion'] = True; cases.append(spec)
        spec = self.table(); spec['feedbackPrompt'] = {}; cases.append(spec)
        cases.append({'schemaVersion': 1, 'viewId': 'x', 'view': 'form', 'title': 'Missing fields'})
        for spec in cases:
            with self.subTest(spec=spec):
                with self.assertRaises(ValueError):
                    render.validate(spec)

    def test_automatic_placement_accounts_for_size_and_component(self):
        table = self.table()
        table['rows'] = table['rows'][:1]
        self.assertEqual(render.placement(table)['mode'], 'inline')
        table['rows'].append({'id':'extra','name':'Extra'})
        self.assertEqual(render.placement(table)['mode'], 'standalone')
        table['rows'] = table['rows'][:1]
        self.assertEqual(render.placement(table, width=360)['mode'], 'standalone')
        table['rows'][0]['name'] = 'Long description ' * 100
        self.assertEqual(render.placement(table)['mode'], 'standalone')

    def test_kanban_is_sized_like_other_views(self):
        board = self.example('kanban')
        self.assertEqual(render.placement(board)['mode'], 'inline')
        board['rows'] = [{'id': f'r{i}', 'title': f'Item {i}', 'stage': 'To review'} for i in range(7)]
        self.assertEqual(render.placement(board)['mode'], 'standalone')

    def test_placement_decisions_match_renderer_1_0_snapshot(self):
        expected = {'table': 'standalone', 'cards': 'standalone', 'form': 'standalone', 'flow': 'inline'}
        for name, mode in expected.items():
            with self.subTest(name=name):
                self.assertEqual(render.placement(self.example(name))['mode'], mode)
        cards = self.example('cards'); cards['rows'] = cards['rows'][:2]
        form = self.example('form'); form['fields'] = form['fields'][:1]
        self.assertEqual(render.placement(cards)['mode'], 'inline')
        self.assertEqual(render.placement(form)['mode'], 'inline')

    def test_placement_estimate_follows_theme_tokens(self):
        context = render.default_context()
        roomy = visual_config.merge(context.theme, {'control': {'minHeight': 64, 'inputHeight': 72}, 'type': {'body': 20}})
        flow = self.example('flow')
        normal = render.placement(flow, config=context.config, theme=context.theme)
        larger = render.placement(flow, config=context.config, theme=roomy)
        self.assertGreater(larger['estimatedHeightPx'], normal['estimatedHeightPx'])

    def test_auto_honors_explicit_override(self):
        with tempfile.TemporaryDirectory() as directory:
            table = self.table()
            table['presentation'] = 'inline'
            quiet(render.render, table, Path(directory)/'override.html', 'auto')
            self.assertEqual(table['resolvedPresentation']['mode'], 'inline')
            self.assertEqual(table['resolvedPresentation']['reason'], 'Explicit presentation override')

    def test_theme_packs_keep_readable_text_and_visible_controls(self):
        packs = {'generic': visual_config.load(visual_config.THEME_FILE)}
        found = visual_config.find_theme(DEFAULT_THEME)
        if found:
            packs[DEFAULT_THEME] = found[0]
        for name, theme in packs.items():
            with self.subTest(theme=name):
                visual_config.check_schema(theme, 'theme', name)
                self.assertEqual(visual_config.contrast_problems(visual_config.complete_theme(theme)), [])

    def test_legacy_theme_uses_its_own_accent_for_optional_roles(self):
        theme = visual_config.load(visual_config.THEME_FILE)
        for key in ('accentFill', 'onAccentFill', 'accentBorder', 'onSelected'):
            theme['dark'].pop(key, None)
        theme['dark']['accent'] = '#bb99ff'
        resolved = visual_config.complete_theme(theme)['dark']
        self.assertEqual(resolved['accentFill'], '#bb99ff')
        self.assertEqual(resolved['accentBorder'], '#bb99ff')
        self.assertEqual(resolved['onSelected'], '#bb99ff')

    def test_draft_key_is_unchanged_from_renderer_1_0_across_harness_and_theme(self):
        legacy = hashlib.sha256(b'1.0.0:sample-review:table').hexdigest()[:24]
        keys = set()
        with tempfile.TemporaryDirectory() as directory:
            for harness, theme in (('codex', None), ('browser-local', 'neutral'), ('claude-inline', 'neutral')):
                spec = self.table()
                context = visual_config.resolve({'theme': theme, 'delivery': {'rendererUrl': URL}}, harness=harness, isolated=True)
                quiet(render.render, spec, Path(directory) / f'{harness}.html', 'auto', context=context)
                keys.add(spec['stateKey'])
        self.assertEqual(keys, {legacy})

    def test_standalone_uses_theme_canvas_and_adapter(self):
        with tempfile.TemporaryDirectory() as directory:
            spec = self.table()
            result = quiet(render.render, spec, Path(directory) / 'view.html', 'standalone')
            html = (Path(directory) / 'view.html').read_text()
            context = render.default_context()
            self.assertEqual(result['harness'], 'browser-local')
            self.assertEqual(result['handoff']['type'], 'serve')
            self.assertIn('<!doctype html>', html)
            self.assertIn(context.theme['light']['canvas'], html)
            if context.appearance == 'light':
                self.assertIn('color-scheme:light}', html)
            else:
                self.assertIn(context.theme['dark']['canvas'], html)
            self.assertIn('"adapter":"browser-local"', html)

    def test_local_server_handles_an_idle_browser_connection(self):
        # Browsers can pre-open a socket before sending a request. It must not block other views.
        with tempfile.TemporaryDirectory() as directory:
            html = Path(directory) / 'view.html'
            quiet(render.render, self.table(), html, 'standalone')
            process = subprocess.Popen([sys.executable, str(ROOT / 'scripts/serve.py'), str(html)],
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                address = json.loads(process.stdout.readline())['url']
                parsed = urlparse(address)
                with socket.create_connection((parsed.hostname, parsed.port), timeout=2):
                    with urllib.request.urlopen(address + 'api/feedback', timeout=2) as response:
                        self.assertEqual(json.load(response), {'feedback': None})
            finally:
                process.terminate()
                process.communicate(timeout=3)

    def test_default_theme_pack_is_found_by_name(self):
        found = visual_config.find_theme(DEFAULT_THEME)
        if not found:
            self.skipTest(f'Theme pack {DEFAULT_THEME!r} is not installed beside this skill')
        context = render.default_context()
        self.assertEqual(context.theme['name'], DEFAULT_THEME)
        self.assertEqual(context.theme_source, found[1])

    def test_missing_theme_falls_back_to_generic(self):
        context = visual_config.resolve({'theme': 'no-such-theme'}, isolated=True)
        self.assertEqual(context.theme['name'], 'generic')

    def test_legacy_theme_names_resolve_to_the_single_generic_file(self):
        for name in ('generic', 'base-web', 'neutral'):
            with self.subTest(name=name):
                context = visual_config.resolve({'theme': name}, isolated=True)
                self.assertEqual(context.theme['name'], 'generic')
                self.assertEqual(context.theme_source, str(visual_config.THEME_FILE))
        self.assertNotIn('appearance', visual_config.load(visual_config.THEME_FILE))

    def test_renamed_config_paths_preserve_legacy_settings_and_prefer_new_names(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            legacy = base / 'visual-response/config.json'
            legacy.parent.mkdir()
            legacy.write_text(json.dumps({'appearance': 'dark'}))
            env = {'HOME': directory, 'XDG_CONFIG_HOME': directory}
            self.assertEqual(visual_config.user_config_path(env), legacy)
            current = base / 'dynamic-visual-reply/config.json'
            current.parent.mkdir()
            current.write_text(json.dumps({'appearance': 'light'}))
            self.assertEqual(visual_config.user_config_path(env), current)
            env.update(VISUAL_RESPONSE_CONFIG=str(legacy), DYNAMIC_VISUAL_REPLY_CONFIG=str(current))
            self.assertEqual(visual_config.user_config_path(env), current)
            del env['DYNAMIC_VISUAL_REPLY_CONFIG']
            self.assertEqual(visual_config.user_config_path(env), legacy)
            project = base / 'project'
            (project / '.git').mkdir(parents=True)
            old_project = project / '.visual-response.json'
            old_project.write_text(json.dumps({'appearance': 'dark'}))
            self.assertEqual(visual_config.project_config_path(project), old_project.resolve())
            new_project = project / '.dynamic-visual-reply.json'
            new_project.write_text(json.dumps({'appearance': 'light'}))
            self.assertEqual(visual_config.project_config_path(project), new_project.resolve())
            context = visual_config.resolve(cwd=project, env=env, harness='browser-local')
            self.assertEqual(context.appearance, 'light')
            self.assertEqual(context.sources['appearance'], 'project')

    def test_config_layers_apply_in_order_and_record_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            user = base / 'user.json'
            user.write_text(json.dumps({'theme': 'neutral', 'appearance': 'dark', 'copy': {'badge': 'From user'}}))
            project = base / 'repo'
            (project / '.git').mkdir(parents=True)
            (project / '.dynamic-visual-reply.json').write_text(json.dumps({'appearance': 'system', 'harness': 'browser-local'}))
            env = {'HOME': directory, 'DYNAMIC_VISUAL_REPLY_CONFIG': str(user)}
            context = visual_config.resolve({'appearance': 'light'}, cwd=project, env=env)
            self.assertEqual(context.harness['id'], 'browser-local')
            self.assertEqual(context.theme['name'], 'generic')
            self.assertEqual(context.config['appearance'], 'light')
            self.assertEqual(context.sources['appearance'], 'command line')
            self.assertEqual(context.sources['copy.badge'], 'user')
            self.assertEqual(context.sources['harness'], 'project')
            self.assertEqual([name for name, _ in context.layers], ['defaults', 'user', 'project', 'command line'])

    def test_harness_appearance_defaults_and_null_reset(self):
        for harness in visual_config.harness_ids():
            expected = 'system'
            with self.subTest(harness=harness):
                context = visual_config.resolve(harness=harness, isolated=True)
                self.assertEqual(context.appearance, expected)
                reset = visual_config.resolve({'appearance': None}, harness=harness, isolated=True)
                self.assertEqual(reset.appearance, expected)
                for fixed in ('light', 'dark'):
                    context = visual_config.resolve({'appearance': fixed}, harness=harness, isolated=True)
                    self.assertEqual(context.appearance, fixed)

    def test_claude_host_colors_are_opt_in(self):
        with tempfile.TemporaryDirectory() as directory:
            for appearance, palette in ((None, False), ('host', True)):
                with self.subTest(appearance=appearance):
                    # Interactive Claude pages need a pinned renderer commit; any full SHA works for rendering.
                    context = visual_config.resolve({'appearance': appearance, 'delivery': {'commit': 'a' * 40}}, harness='claude-inline', isolated=True)
                    out = Path(directory) / f'{appearance}.html'
                    quiet(render.render, self.example('flow'), out, 'inline', context=context)
                    config = json.loads(out.read_text().split('data-dynamic-visual-reply-config>', 1)[1].split('</script>', 1)[0])
                    self.assertEqual(config['appearance'], appearance or 'system')
                    self.assertEqual('hostPalette' in config, palette)

    def test_explicit_appearance_layers_override_harness_defaults_in_rendered_page(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            user = base / 'user.json'
            user.write_text(json.dumps({'appearance': 'dark', 'delivery': {'rendererUrl': URL}}))
            project = base / 'repo'
            (project / '.git').mkdir(parents=True)
            env = {'HOME': directory, 'DYNAMIC_VISUAL_REPLY_CONFIG': str(user)}
            for harness in ('codex', 'claude-inline', 'browser-local'):
                with self.subTest(harness=harness):
                    project_config = project / '.dynamic-visual-reply.json'
                    project_config.unlink(missing_ok=True)
                    context = visual_config.resolve(harness=harness, cwd=project, env=env)
                    self.assertEqual(context.appearance, 'dark')
                    self.assertEqual(context.sources['appearance'], 'user')
                    project_config.write_text(json.dumps({'appearance': 'light'}))
                    context = visual_config.resolve(harness=harness, cwd=project, env=env)
                    self.assertEqual(context.appearance, 'light')
                    self.assertEqual(context.sources['appearance'], 'project')
                    context = visual_config.resolve({'appearance': 'dark'}, harness=harness, cwd=project, env=env)
                    self.assertEqual(context.appearance, 'dark')
                    self.assertEqual(context.sources['appearance'], 'command line')
                    spec = self.example('flow')
                    spec['appearance'] = 'light'
                    out = base / (harness + '.html')
                    quiet(render.render, spec, out, 'inline', context=context)
                    config = json.loads(out.read_text().split('data-dynamic-visual-reply-config>', 1)[1].split('</script>', 1)[0])
                    self.assertEqual(config['appearance'], 'light')
                    self.assertNotIn('hostPalette', config)

    def test_unknown_config_keys_are_rejected(self):
        with self.assertRaises(ValueError):
            visual_config.resolve({'colour': 'blue'}, isolated=True)
        with self.assertRaises(ValueError):
            visual_config.resolve({'placement': {'inlineLimits': {'table': 0}}}, isolated=True)
        with self.assertRaises(ValueError):
            visual_config.resolve({'feedback': {'messageFormat': 'yaml'}}, isolated=True)

    def test_message_format_reaches_the_page_only_when_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            for value, expected in (('summary', {'messageFormat': 'summary'}), ('json', None)):
                context = visual_config.resolve({'feedback': {'messageFormat': value}}, isolated=True)
                quiet(render.render, self.example('flow'), Path(directory) / f'{value}.html', 'inline', context=context)
                html = (Path(directory) / f'{value}.html').read_text()
                config = json.loads(html.split('data-dynamic-visual-reply-config>', 1)[1].split('</script>', 1)[0])
                self.assertEqual(config.get('feedback'), expected)

    def test_harness_detection_from_environment(self):
        cases = {
            'claude-code': {'CLAUDECODE': '1'},
            'codex': {'CODEX_HOME': '/tmp/codex'},
            'static': {},
        }
        for expected, env in cases.items():
            with self.subTest(expected=expected):
                self.assertEqual(visual_config.detect_harness(env)[0], expected)
        self.assertEqual(visual_config.detect_harness({'CLAUDECODE': '1', 'CLAUDE_CODE_DESKTOP_APP_VERSION': '1.0'})[0], 'claude-code')

    def test_claude_inline_writes_a_small_loader_without_the_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            spec = self.example('flow')
            context = visual_config.resolve({'delivery': {'rendererUrl': URL}}, harness='claude-inline', isolated=True)
            result = quiet(render.render, spec, Path(directory) / 'w.html', 'auto', context=context)
            html = (Path(directory) / 'w.html').read_text()
            manifest = render.load(render.MANIFEST)
            self.assertEqual(result['handoff']['type'], 'show_widget')
            self.assertIn(f'<script src="{URL}" integrity="{manifest["sri"]}" crossorigin="anonymous">', html)
            self.assertIn('"adapter":"claude-inline"', html)
            self.assertNotIn('data-dynamic-visual-reply-host', html)
            self.assertNotIn('data-dynamic-visual-reply-runtime', html)
            self.assertLess(len(html.encode()), 8000)

    def test_public_repository_commit_supplies_the_renderer_url(self):
        delivery = {'repository': 'someone/dynamic-visual-reply', 'commit': COMMIT}
        self.assertEqual(visual_config.renderer_url(delivery), URL)
        override = 'https://example.com/immutable/renderer.js'
        self.assertEqual(visual_config.renderer_url({**delivery, 'rendererUrl': override}), override)
        self.assertIsNone(visual_config.renderer_url({'repository': delivery['repository']}))
        self.assertIsNone(visual_config.renderer_url({'commit': COMMIT}))
        with tempfile.TemporaryDirectory() as directory:
            context = visual_config.resolve({'delivery': delivery}, harness='claude-inline', isolated=True)
            quiet(render.render, self.example('flow'), Path(directory) / 'w.html', 'auto', context=context)
            self.assertIn(URL, (Path(directory) / 'w.html').read_text())

    def test_delivery_commit_rejects_mutable_or_incomplete_references(self):
        for commit in ('main', 'v1.4.0', 'a' * 7, 'g' * 40, ''):
            with self.subTest(commit=commit), self.assertRaises(ValueError):
                visual_config.resolve({'delivery': {'commit': commit}}, isolated=True)

    def test_bundle_identity_is_a_hash_and_does_not_change_draft_keys(self):
        manifest = render.manifest()
        self.assertNotIn('version', manifest)
        self.assertEqual(manifest['draftVersion'], '1.0.0')
        with tempfile.TemporaryDirectory() as directory:
            keys = []
            for harness in ('codex', 'claude-inline', 'browser-local', 'static'):
                context = visual_config.resolve({'delivery': {'rendererUrl': URL}}, harness=harness, isolated=True)
                out = Path(directory) / (harness + '.html')
                result = quiet(render.render, self.example('flow'), out, 'inline', context=context)
                config = json.loads(out.read_text().split('data-dynamic-visual-reply-config>', 1)[1].split('</script>', 1)[0])
                self.assertEqual(result['rendererHash'], manifest['sha256'])
                self.assertEqual(config['rendererHash'], manifest['sha256'])
                self.assertNotIn('rendererVersion', result)
                keys.append(render.load(out.with_suffix('.spec.json'))['stateKey'])
            self.assertEqual(len(set(keys)), 1)

    def test_feedback_accepts_bundle_hash_and_legacy_metadata(self):
        schema = visual_config.load(visual_config.SCHEMA_DIR / 'feedback.schema.json')
        feedback = {'schemaVersion': 1, 'viewId': 'test', 'view': 'form', 'revision': 1,
                    'selectedIds': [], 'reviewedIds': [], 'items': [], 'fields': [], 'comment': ''}
        for source in ({'rendererHash': render.manifest()['sha256']}, {'rendererVersion': '1.3.0'}, {}):
            self.assertEqual(visual_config.schema_errors({**feedback, 'source': source}, schema), [])
        self.assertTrue(visual_config.schema_errors({**feedback, 'source': {'rendererHash': 'bad'}}, schema))

    def test_url_delivery_requires_renderer_url(self):
        with tempfile.TemporaryDirectory() as directory:
            for repository in (None, 'neha-nupoor/dynamic-visual-reply'):
                context = visual_config.resolve({'delivery': {'repository': repository}}, harness='claude-inline', isolated=True)
                with self.subTest(repository=repository), self.assertRaisesRegex(ValueError, 'delivery.commit'):
                    quiet(render.render, self.example('flow'), Path(directory) / 'w.html', 'auto', context=context)

    def test_large_claude_views_use_the_same_local_browser_as_codex(self):
        with tempfile.TemporaryDirectory() as directory:
            context = visual_config.resolve(harness='claude-inline', isolated=True)
            result = quiet(render.render, self.table(), Path(directory) / 'review.html', 'auto', context=context)
            self.assertEqual(result['harness'], 'browser-local')
            self.assertEqual(result['handoff']['type'], 'serve')
            self.assertIn('data-dynamic-visual-reply-runtime', (Path(directory) / 'review.html').read_text())

    def test_spec_appearance_and_copy_reach_the_page(self):
        with tempfile.TemporaryDirectory() as directory:
            spec = self.example('flow')
            spec['appearance'] = 'system'
            context = visual_config.resolve({'copy': {'badge': 'Review'}}, isolated=True)
            quiet(render.render, spec, Path(directory) / 'v.html', 'inline', context=context)
            html = (Path(directory) / 'v.html').read_text()
            config = json.loads(html.split('data-dynamic-visual-reply-config>', 1)[1].split('</script>', 1)[0])
            self.assertEqual(config['appearance'], 'system')
            self.assertEqual(config['copy'], {'badge': 'Review'})

    def test_disabled_views_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            context = visual_config.resolve({'views': {'enabled': ['table']}}, isolated=True)
            with self.assertRaises(ValueError):
                quiet(render.render, self.example('flow'), Path(directory) / 'v.html', 'auto', context=context)

    def test_theme_css_variables_cover_every_palette_role(self):
        css = visual_config.css_variables(render.default_context().theme, 'system')
        for role in ('--vr-accent', '--vr-on-accent', '--vr-control-border', '--vr-font'):
            self.assertIn(role, css)
        self.assertIn('prefers-color-scheme: dark', css)

    def render_html(self, spec, context=None, mode='inline'):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / 'view.html'
            result = quiet(render.render, spec, out, mode, context=context)
            return result, out.read_text()

    def test_static_view_alone_has_no_script_for_every_example(self):
        for path in sorted((ROOT / 'assets/examples').glob('*.json')):
            with self.subTest(example=path.stem):
                spec = render.load(path)
                spec['interactive'] = False
                result, html = self.render_html(spec)
                self.assertNotIn('<script', html)
                self.assertNotIn('data-dynamic-visual-reply-root', html)
                self.assertIn('data-dynamic-visual-reply-static', html)
                self.assertIn(spec['title'].replace('&', '&amp;'), html)
                self.assertEqual(result['delivery'], 'none')
                self.assertFalse(result['interactive'])

    def test_interactive_pages_place_static_view_before_the_mount_point(self):
        result, html = self.render_html(self.example('flow'))
        self.assertTrue(result['interactive'])
        self.assertLess(html.index('data-dynamic-visual-reply-static'), html.index('<div data-dynamic-visual-reply-root>'))
        self.assertIn('[data-dynamic-visual-reply-static]:has(+[data-dynamic-visual-reply-root]>*){display:none}', html)
        self.assertIn('Interactive feedback controls appear here once the renderer loads.', html)

    def test_static_view_shows_each_views_content(self):
        cards = self.example('cards')
        flow = self.example('flow')
        form = self.example('form')
        kanban = self.example('kanban')
        for spec, expected in ((cards, [row['title'] for row in cards['rows']]),
                               (flow, [node['title'] for node in flow['nodes']]),
                               (form, [field['label'] for field in form['fields']]),
                               (kanban, [row['title'] for row in kanban['rows']])):
            spec['interactive'] = False
            with self.subTest(view=spec['view']):
                html = self.render_html(spec)[1]
                for text in expected:
                    self.assertIn(text.replace('&', '&amp;'), html)

    def test_static_table_notes_rows_beyond_the_first_page(self):
        spec = self.table()
        spec.update(interactive=False, pageSize=1)
        html = self.render_html(spec, mode='standalone')[1]
        self.assertIn(f'Showing 1 of {len(spec["rows"])} rows.', html)

    def test_static_view_escapes_spec_text(self):
        spec = self.example('cards')
        spec['interactive'] = False
        spec['rows'][0]['title'] = '<img src=x onerror=alert(1)>'
        spec['rows'][0]['source'] = 'javascript:alert(1)'
        html = self.render_html(spec, mode='standalone')[1]
        self.assertNotIn('<img src=x', html)
        self.assertIn('&lt;img src=x onerror=alert(1)&gt;', html)
        self.assertNotIn('javascript:alert', html)

    def test_claude_static_view_needs_no_renderer_url(self):
        context = visual_config.resolve({'delivery': {'repository': None}}, harness='claude-inline', isolated=True)
        spec = self.example('flow')
        spec['interactive'] = False
        result, html = self.render_html(spec, context=context)
        self.assertEqual(result['handoff']['type'], 'show_widget')
        self.assertNotIn('cdn.jsdelivr.net', html)

    def test_static_view_follows_appearance(self):
        theme = render.default_context().theme
        for appearance in ('light', 'dark', 'system', 'host'):
            spec = self.example('flow')
            spec.update(interactive=False, appearance=appearance)
            with self.subTest(appearance=appearance):
                html = self.render_html(spec)[1]
                own = theme['light' if appearance == 'light' else 'dark']['surface']
                self.assertIn(f'--vrs-t-surface:{own}', html)
                self.assertEqual('prefers-color-scheme:dark' in html, appearance in ('system', 'host'))
                self.assertEqual('var(--surface-2,' in html, appearance == 'host')

if __name__ == '__main__':
    os.environ.pop('DYNAMIC_VISUAL_REPLY_CONFIG', None)
    os.environ.pop('VISUAL_RESPONSE_CONFIG', None)
    unittest.main()
