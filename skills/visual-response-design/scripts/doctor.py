#!/usr/bin/env python3
"""Report which harness, theme, delivery and feedback path this environment will use; standard library only."""
import argparse
import base64
import hashlib
import json
import os
import sys
import urllib.request

import visual_config
from visual_config import ROOT, load

def check_url(url, expected_sri):
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'visual-response-doctor'})
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read()
    except Exception as error:  # Network errors are reported, not raised.
        return {'reachable': False, 'error': str(error)}
    sri = 'sha384-' + base64.b64encode(hashlib.sha384(body).digest()).decode()
    return {'reachable': True, 'bytes': len(body), 'matchesLocalBundle': sri == expected_sri}

def report(args, env=os.environ):
    cli = {'harness': args.harness, 'theme': args.theme}
    context = visual_config.resolve(cli)
    harness, config = context.harness, context.config
    problems, notes = [], []
    detected, detected_reason = visual_config.detect_harness(env)
    manifest = load(ROOT / 'assets/renderer/dist/manifest.json')
    bundle = ROOT / 'assets/renderer/dist/renderer.js'
    if hashlib.sha256(bundle.read_bytes()).hexdigest() != manifest['sha256']:
        problems.append('renderer.js does not match manifest.json; rebuild the bundle.')
    contrast = visual_config.contrast_problems(context.theme)
    problems += [f'Theme contrast: {p}' for p in contrast]
    if context.theme['name'] != config['theme'] and not isinstance(config['theme'], dict):
        notes.append(f'Theme {config["theme"]!r} was not found; using fallback {context.theme["name"]!r}. '
                     'Install that theme pack beside this skill or point `theme` at its folder.')
    delivery = config['delivery']
    url_check = None
    paths = {h: visual_config.load_harness(h) for h in visual_config.harness_ids()}
    used = {harness['id']} | {harness[k] for k in ('standaloneHarness', 'inlineHarness') if harness.get(k)}
    for identifier in sorted(used):
        mode = (context if identifier == harness['id'] else visual_config.resolve(cli, harness=identifier)).config['delivery']
        if mode['mode'] == 'url':
            url = visual_config.renderer_url(mode, manifest['version'])
            if not url:
                problems.append(f'{identifier} loads the renderer from a URL, but neither delivery.rendererUrl nor delivery.repository is set. '
                                'Release this skill from a public GitHub repo (set repository) or publish dist/renderer.js to npm (set rendererUrl).')
            elif identifier == 'claude-artifact' and not url.startswith(('https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/', 'https://cdnjs.cloudflare.com/')):
                problems.append(f'claude-artifact pages only load scripts from cdnjs, unpkg or jsDelivr /npm/, so {url} will be blocked. '
                                'Set delivery.rendererUrl to an npm-published copy for artifacts.')
            elif manifest['version'] not in url:
                notes.append(f'{url} does not name version {manifest["version"]}; make sure it serves the same bundle.')
            if url and args.check_url:
                url_check = check_url(url, manifest.get('sri'))
                if not url_check['reachable']:
                    problems.append(f'rendererUrl is not reachable: {url_check["error"]}')
                elif not url_check['matchesLocalBundle']:
                    problems.append('rendererUrl serves a different bundle than dist/renderer.js; publish this build or update the URL.')
    submit = {'codex': 'window.openai.sendFollowUpMessage starts a chat turn; standalone views save to a file through serve.py',
              'claude-inline': 'sendPrompt() starts a chat turn; standalone views become a Claude artifact',
              'claude-artifact': 'Submit writes to the artifact `batches` collection; Claude reads it with ArtifactData',
              'browser-local': 'serve.py saves <view>.feedback.json; ask the agent to read it',
              'claude-code': 'serve.py saves <view>.feedback.json; ask the agent to read it',
              'static': 'No bridge: Prepare message, Copy and Export JSON only',
              'module': 'The wrapper supplies window.visualResponseHost'}
    return {
        'ok': not problems,
        'harness': {'id': harness['id'], 'label': harness['label'], 'reason': context.harness_reason,
                    'detected': detected, 'detectedReason': detected_reason, 'handoff': harness['handoff'],
                    'standaloneHarness': harness.get('standaloneHarness'), 'references': harness.get('references'),
                    'feedback': submit.get(harness['id'], 'See the harness profile notes')},
        'theme': {'name': context.theme['name'], 'source': context.theme_source, 'appearance': context.appearance,
                  'contrastOk': not contrast},
        'delivery': {**delivery, 'bundleVersion': manifest['version'], 'bundleBytes': manifest['bytes'], 'urlCheck': url_check},
        'configLayers': context.layers,
        'userConfig': str(visual_config.user_config_path(env)),
        'availableHarnesses': {h: p['label'] for h, p in paths.items()},
        'problems': problems,
        'notes': notes,
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--harness', help='Check a specific harness profile instead of the detected one')
    parser.add_argument('--theme', help='Check a specific theme pack')
    parser.add_argument('--check-url', action='store_true', help='Download rendererUrl and compare it with the local bundle')
    args = parser.parse_args()
    try:
        result = report(args)
    except (ValueError, OSError, KeyError) as error:
        print(json.dumps({'ok': False, 'problems': [str(error)]}, indent=2))
        sys.exit(2)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result['ok'] else 1)

if __name__ == '__main__':
    main()
