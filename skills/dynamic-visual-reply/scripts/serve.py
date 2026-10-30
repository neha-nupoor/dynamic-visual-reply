#!/usr/bin/env python3
"""Serve one standalone view on loopback and save deliberately submitted feedback."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import tempfile

BRIDGE = '''<script>
window.dynamicVisualReplySave = async function(payload) {
  const response = await fetch('/api/feedback', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  const result = await response.json();
  if(!response.ok) throw new Error(result.error || 'Feedback save failed');
  return result;
};
</script>\n'''

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html', type=Path)
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--feedback', type=Path, help='Receipt file; default <html stem>.feedback.json')
    args = parser.parse_args()
    html = args.html.resolve()
    if not html.is_file() or '<!doctype html>' not in html.read_text(encoding='utf-8').lower():
        parser.error('Serve a file generated with --format standalone')
    feedback = args.feedback.resolve() if args.feedback else html.with_suffix('.feedback.json')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass
        def respond(self, code, data, content_type='application/json'):
            self.send_response(code)
            self.send_header('Content-Type', content_type + '; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(data)
        def do_GET(self):
            if self.path in ('/', '/index.html'):
                content = html.read_text(encoding='utf-8').replace('<script data-dynamic-visual-reply-runtime>', BRIDGE + '<script data-dynamic-visual-reply-runtime>', 1)
                self.respond(200, content.encode(), 'text/html')
            elif self.path == '/api/feedback':
                self.respond(200, feedback.read_bytes() if feedback.exists() else b'{"feedback":null}')
            else:
                self.respond(404, b'{"error":"Not found"}')
        def do_POST(self):
            expected = f'http://127.0.0.1:{self.server.server_port}'
            if self.path != '/api/feedback' or self.headers.get('Origin', expected) != expected:
                self.respond(403, b'{"error":"Invalid submission origin or endpoint"}')
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 1_000_000:
                    raise ValueError('Feedback must be smaller than 1 MB')
                require_type = self.headers.get('Content-Type', '').split(';')[0]
                if require_type != 'application/json':
                    raise ValueError('Expected application/json')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict) or not isinstance(payload.get('feedback'), dict) or payload['feedback'].get('schemaVersion') != 1:
                    raise ValueError('Invalid feedback payload')
                feedback.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=feedback.parent, delete=False) as stream:
                    json.dump(payload, stream, ensure_ascii=False, indent=2, allow_nan=False)
                    stream.write('\n')
                    temporary = Path(stream.name)
                temporary.replace(feedback)
                self.respond(200, json.dumps({'saved': True, 'path': str(feedback)}).encode())
            except (ValueError, OSError, TypeError) as error:
                self.respond(400, json.dumps({'error': str(error)}).encode())

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(json.dumps({'url': f'http://127.0.0.1:{server.server_port}/', 'feedback': str(feedback), 'pidHint': 'Stop this process to close the preview server'}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
