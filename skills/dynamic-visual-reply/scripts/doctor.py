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
        request = urllib.request.Request(url, headers={'User-Agent': 'dynamic-visual-reply-doctor'})
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
    if isinstance(config['theme'], str) and config['theme'] not in ('generic', 'base-web', 'neutral') and context.theme['name'] != config['theme']:
        notes.append(f'Theme {config["theme"]!r} was not found; using fallback {context.theme["name"]!r}. '
                     'Install that theme pack beside this skill or point `theme` at its folder.')
    delivery = config['delivery']
    url_check = None
    if harness['id'] == 'claude-inline':
        url = visual_config.renderer_url(delivery, manifest['version'])
        if not url:
            problems.append('Claude inline needs a pinned renderer URL or delivery.repository.')
        elif args.check_url:
            url_check = check_url(url, manifest.get('sri'))
            if not url_check['reachable']:
                problems.append(f'Renderer URL is not reachable: {url_check["error"]}')
            elif not url_check['matchesLocalBundle']:
                problems.append('Renderer URL differs from this build; publish a matching release before using it.')
    submit = {'codex': 'Inline uses window.openai.sendFollowUpMessage; larger views save feedback through serve.py.',
              'claude-inline': 'Inline adds feedback to the message box; press Enter to send. Larger views use serve.py.',
              'browser-local': 'serve.py saves <view>.feedback.json; ask the agent to read it.',
              'claude-code': 'serve.py saves <view>.feedback.json; ask the agent to read it.',
              'static': 'Copy or export feedback and paste it into chat.'}
    notes.append('These checks verify files and settings, not the host rendering or submission APIs. Test those in the rendered view.')
    return {
        'ok': not problems,
        'harness': {'id': harness['id'], 'label': harness['label'], 'reason': context.harness_reason,
                    'detected': detected, 'detectedReason': detected_reason, 'runtimeVerified': False,
                    'feedback': submit.get(harness['id'], 'Choose a supported harness explicitly')},
        'theme': {'name': context.theme['name'], 'source': context.theme_source, 'appearance': context.appearance,
                  'contrastOk': not contrast},
        'delivery': {**delivery, 'bundleVersion': manifest['version'], 'bundleBytes': manifest['bytes'], 'urlCheck': url_check},
        'configLayers': context.layers,
        'userConfig': str(visual_config.user_config_path(env)),
        'availableHarnesses': {h: p['label'] for h, p in visual_config.HARNESSES.items()},
        'problems': problems,
        'notes': notes,
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--harness', help='Check a supported host instead of the suggested one')
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
