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
import unittest
import render
import visual_config

ROOT = render.ROOT
SPEC_SCHEMA = visual_config.load(visual_config.SCHEMA_DIR / 'spec.schema.json')
URL = 'https://cdn.jsdelivr.net/npm/visual-response-renderer@1.1.0/dist/renderer.js'
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
        spec = self.example('flow-motion'); spec['nodes'][0]['title'] = 'x' * 40; broken.append(spec)
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
            extract = lambda p: p.read_text().split('<script data-visual-response-runtime>\n', 1)[1]
            self.assertEqual(extract(first), extract(second))
            self.assertLess(first.stat().st_size, 1_000_000)
            self.assertNotIn('<script src=', first.read_text())
            self.assertIn('"adapter":"codex"', first.read_text())
            self.assertTrue(first.with_suffix('.spec.json').exists())
            self.assertTrue(result['contentReference'].startswith('visualize'))

    def test_invalid_motion_shape_and_invalid_form_value_rejected(self):
        flow = self.example('flow-motion')
        flow['nodes'].append({'id': 'extra', 'title': 'Extra'})
        with self.assertRaises(ValueError):
            render.validate(flow)
        form = self.example('form')
        form['fields'][0]['value'] = 'not-an-option'
        with self.assertRaises(ValueError):
            render.validate(form)

    def test_automatic_placement_accounts_for_size_and_component(self):
        table = self.table()
        table['rows'] = table['rows'][:2]
        self.assertEqual(render.placement(table)['mode'], 'inline')
        table['rows'].append({'id':'extra','name':'Extra'})
        self.assertEqual(render.placement(table)['mode'], 'standalone')
        table['rows'] = table['rows'][:1]
        self.assertEqual(render.placement(table, width=360)['mode'], 'standalone')
        table['rows'][0]['name'] = 'Long description ' * 100
        self.assertEqual(render.placement(table)['mode'], 'standalone')

    def test_kanban_and_motion_are_sized_like_other_views(self):
        board = self.example('kanban')
        self.assertEqual(render.placement(board)['mode'], 'inline')
        board['rows'] = [{'id': f'r{i}', 'title': f'Item {i}', 'stage': 'To review'} for i in range(7)]
        self.assertEqual(render.placement(board)['mode'], 'standalone')
        self.assertEqual(render.placement(self.example('flow-motion'))['mode'], 'inline')
        strict = visual_config.resolve({'placement': {'inlineLimits': {'kanban': False, 'motion': False}}}, isolated=True)
        for name in ('kanban', 'flow-motion'):
            self.assertEqual(render.placement(self.example(name), config=strict.config, theme=strict.theme)['mode'], 'standalone')

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
        packs = {'neutral': visual_config.load(ROOT / 'themes/neutral/theme.json')}
        found = visual_config.find_theme(DEFAULT_THEME)
        if found:
            packs[DEFAULT_THEME] = found[0]
        for name, theme in packs.items():
            with self.subTest(theme=name):
                visual_config.check_schema(theme, 'theme', name)
                self.assertEqual(visual_config.contrast_problems(visual_config.complete_theme(theme)), [])

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

    def test_default_theme_pack_is_found_by_name(self):
        found = visual_config.find_theme(DEFAULT_THEME)
        if not found:
            self.skipTest(f'Theme pack {DEFAULT_THEME!r} is not installed beside this skill')
        context = render.default_context()
        self.assertEqual(context.theme['name'], DEFAULT_THEME)
        self.assertEqual(context.theme_source, found[1])

    def test_missing_theme_falls_back_to_neutral(self):
        context = visual_config.resolve({'theme': 'no-such-theme'}, isolated=True)
        self.assertEqual(context.theme['name'], 'neutral')

    def test_config_layers_apply_in_order_and_record_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            user = base / 'user.json'
            user.write_text(json.dumps({'theme': 'neutral', 'appearance': 'dark', 'copy': {'badge': 'From user'}}))
            project = base / 'repo'
            (project / '.git').mkdir(parents=True)
            (project / '.visual-response.json').write_text(json.dumps({'appearance': 'system', 'harness': 'browser-local'}))
            env = {'HOME': directory, 'VISUAL_RESPONSE_CONFIG': str(user)}
            context = visual_config.resolve({'appearance': 'light'}, cwd=project, env=env)
            self.assertEqual(context.harness['id'], 'browser-local')
            self.assertEqual(context.theme['name'], 'neutral')
            self.assertEqual(context.config['appearance'], 'light')
            self.assertEqual(context.sources['appearance'], 'command line')
            self.assertEqual(context.sources['copy.badge'], 'user')
            self.assertEqual(context.sources['harness'], 'project')
            self.assertEqual([name for name, _ in context.layers], ['defaults', 'harness:browser-local', 'user', 'project', 'command line'])

    def test_unknown_config_keys_are_rejected(self):
        with self.assertRaises(ValueError):
            visual_config.resolve({'colour': 'blue'}, isolated=True)
        with self.assertRaises(ValueError):
            visual_config.resolve({'feedback': {'messageFormat': 'yaml'}}, isolated=True)

    def test_message_format_reaches_the_page_only_when_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            for value, expected in (('summary', {'messageFormat': 'summary'}), ('json', None)):
                context = visual_config.resolve({'feedback': {'messageFormat': value}}, isolated=True)
                quiet(render.render, self.example('flow'), Path(directory) / f'{value}.html', 'inline', context=context)
                html = (Path(directory) / f'{value}.html').read_text()
                config = json.loads(html.split('data-visual-response-config>', 1)[1].split('</script>', 1)[0])
                self.assertEqual(config.get('feedback'), expected)

    def test_harness_detection_from_environment(self):
        cases = {
            'claude-inline': {'CLAUDECODE': '1', 'CLAUDE_CODE_DESKTOP_APP_VERSION': '1.0'},
            'claude-code': {'CLAUDECODE': '1'},
            'codex': {'CODEX_HOME': '/tmp/codex'},
            'static': {},
        }
        for expected, env in cases.items():
            with self.subTest(expected=expected):
                self.assertEqual(visual_config.detect_harness(env)[0], expected)

    def test_every_harness_profile_is_valid_and_has_its_adapter(self):
        for identifier in visual_config.harness_ids():
            with self.subTest(harness=identifier):
                profile = visual_config.load_harness(identifier)
                for key in ('standaloneHarness', 'inlineHarness'):
                    if profile.get(key):
                        visual_config.load_harness(profile[key])
                if profile.get('references'):
                    self.assertTrue((ROOT / profile['references']).is_file(), profile['references'])

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
            self.assertNotIn('data-visual-response-host', html)
            self.assertNotIn('data-visual-response-runtime', html)
            self.assertLess(len(html.encode()), 8000)

    def test_public_repository_release_supplies_the_renderer_url(self):
        delivery = {'repository': 'someone/visual-response', 'repositoryPath': 'skills/visual-response-design', 'tagPrefix': 'v'}
        self.assertEqual(visual_config.renderer_url(delivery, '1.1.0'),
                         'https://cdn.jsdelivr.net/gh/someone/visual-response@v1.1.0/skills/visual-response-design/assets/renderer/dist/renderer.js')
        self.assertEqual(visual_config.renderer_url({**delivery, 'rendererUrl': URL}, '1.1.0'), URL)
        with tempfile.TemporaryDirectory() as directory:
            context = visual_config.resolve({'delivery': {'repository': 'someone/visual-response'}}, harness='claude-inline', isolated=True)
            quiet(render.render, self.example('flow'), Path(directory) / 'w.html', 'auto', context=context)
            self.assertIn('cdn.jsdelivr.net/gh/someone/visual-response@v', (Path(directory) / 'w.html').read_text())

    def test_url_delivery_requires_renderer_url(self):
        with tempfile.TemporaryDirectory() as directory:
            context = visual_config.resolve({'delivery': {'repository': None}}, harness='claude-inline', isolated=True)
            with self.assertRaises(ValueError):
                quiet(render.render, self.example('flow'), Path(directory) / 'w.html', 'auto', context=context)

    def test_claude_inline_falls_back_to_browser_when_artifacts_cannot_load_the_url(self):
        with tempfile.TemporaryDirectory() as directory:
            context = visual_config.resolve({'delivery': {'repository': 'someone/visual-response'}}, harness='claude-inline', isolated=True)
            result = quiet(render.render, self.table(), Path(directory) / 'a.html', 'auto', context=context)
            self.assertEqual(result['harness'], 'browser-local')
            self.assertIn('cannot load the renderer URL', result['placement']['reason'])

    def test_claude_inline_hands_large_views_to_an_artifact_page(self):
        with tempfile.TemporaryDirectory() as directory:
            context = visual_config.resolve({'delivery': {'rendererUrl': URL}}, harness='claude-inline', isolated=True)
            result = quiet(render.render, self.table(), Path(directory) / 'a.html', 'auto', context=context)
            html = (Path(directory) / 'a.html').read_text()
            self.assertEqual(result['harness'], 'claude-artifact')
            self.assertEqual(result['handoff']['type'], 'artifact')
            self.assertEqual(result['handoff']['capabilities'], {'db': {}, 'user': {}})
            self.assertTrue(html.startswith('<title>Sample: review response components</title>'))
            self.assertNotIn('<!doctype', html.lower())
            self.assertIn('"adapter":"claude-artifact"', html)
            self.assertIn('padding-left:max(16px,env(safe-area-inset-left,0px))', html)

    def test_module_delivery_returns_data_for_wrappers(self):
        with tempfile.TemporaryDirectory() as directory:
            context = visual_config.resolve(harness='module', isolated=True)
            out = Path(directory) / 'view.json'
            quiet(render.render, self.example('cards'), out, 'auto', context=context)
            module = json.loads(out.read_text())
            self.assertEqual(module['spec']['viewId'], 'sample-cards')
            self.assertEqual(module['theme']['name'], context.theme['name'])
            self.assertEqual(module['renderer']['sha256'], render.load(render.MANIFEST)['sha256'])

    def test_spec_appearance_and_copy_reach_the_page(self):
        with tempfile.TemporaryDirectory() as directory:
            spec = self.example('flow')
            spec['appearance'] = 'system'
            context = visual_config.resolve({'copy': {'badge': 'Review'}}, isolated=True)
            quiet(render.render, spec, Path(directory) / 'v.html', 'inline', context=context)
            html = (Path(directory) / 'v.html').read_text()
            config = json.loads(html.split('data-visual-response-config>', 1)[1].split('</script>', 1)[0])
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

if __name__ == '__main__':
    os.environ.pop('VISUAL_RESPONSE_CONFIG', None)
    unittest.main()
