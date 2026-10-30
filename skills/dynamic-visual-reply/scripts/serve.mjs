#!/usr/bin/env node
/** Serve one standalone view on loopback and atomically save submitted feedback. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {existsFile, isMain, object, parseCli, requireValue, runCli} from './visual-config.mjs';

export const BRIDGE = '<script>\nwindow.dynamicVisualReplySave = async function(payload) {\n' +
  "  const response = await fetch('/api/feedback', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});\n" +
  '  const result = await response.json();\n  if(!response.ok) throw new Error(result.error || \'Feedback save failed\');\n  return result;\n};\n</script>\n';

export function createPreviewServer(html, feedback) {
  html = path.resolve(html);
  requireValue(existsFile(html) && fs.readFileSync(html, 'utf8').toLowerCase().includes('<!doctype html>'),
    'Serve a file generated with --format standalone');
  feedback = path.resolve(feedback || html.slice(0, -path.extname(html).length) + '.feedback.json');
  const server = http.createServer(async (request, response) => {
    const respond = (status, body, type = 'application/json') => {
      if (response.destroyed || response.writableEnded) return;
      body = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
      response.writeHead(status, {'Content-Type': type + '; charset=utf-8', 'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      response.end(body);
    };
    try {
      if (request.method === 'GET') {
        if (['/', '/index.html'].includes(request.url)) {
          const content = fs.readFileSync(html, 'utf8').replace('<script data-dynamic-visual-reply-runtime>', BRIDGE + '<script data-dynamic-visual-reply-runtime>');
          respond(200, content, 'text/html');
        } else if (request.url === '/api/feedback') respond(200, existsFile(feedback) ? fs.readFileSync(feedback) : {feedback: null});
        else respond(404, {error: 'Not found'});
        return;
      }
      if (request.method !== 'POST') { respond(405, {error: 'Method not allowed'}); return; }
      const expected = 'http://127.0.0.1:' + server.address().port;
      if (request.url !== '/api/feedback' || (request.headers.origin || expected) !== expected) {
        request.resume(); respond(403, {error: 'Invalid submission origin or endpoint'}); return;
      }
      const length = Number(request.headers['content-length'] || 0);
      requireValue(Number.isInteger(length) && length > 0 && length <= 1_000_000, 'Feedback must be smaller than 1 MB');
      requireValue((request.headers['content-type'] || '').split(';')[0] === 'application/json', 'Expected application/json');
      const chunks = []; let received = 0;
      for await (const chunk of request) {
        received += chunk.length;
        requireValue(received <= 1_000_000, 'Feedback must be smaller than 1 MB');
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requireValue(object(payload) && object(payload.feedback) && payload.feedback.schemaVersion === 1, 'Invalid feedback payload');
      fs.mkdirSync(path.dirname(feedback), {recursive: true});
      const temporary = path.join(path.dirname(feedback), '.' + path.basename(feedback) + '.' + randomUUID() + '.tmp');
      try {
        fs.writeFileSync(temporary, JSON.stringify(payload, null, 2) + '\n', {flag: 'wx', mode: 0o600});
        fs.renameSync(temporary, feedback);
      } finally { fs.rmSync(temporary, {force: true}); }
      respond(200, {saved: true, path: feedback});
    } catch (error) { request.resume(); respond(400, {error: error.message}); }
  });
  return {server, feedback};
}
export async function main() {
  const {values: args, positionals} = parseCli({port: {type: 'string', default: '0'}, feedback: {type: 'string'}}, process.argv.slice(2), true);
  if (args.help) { console.log('Usage: node serve.mjs <standalone.html> [--port 0] [--feedback <receipt.json>]'); return; }
  requireValue(positionals.length === 1, 'Provide one standalone HTML file');
  const port = Number(args.port);
  requireValue(Number.isInteger(port) && port >= 0 && port <= 65535, 'Port must be between 0 and 65535');
  const {server, feedback} = createPreviewServer(positionals[0], args.feedback);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  console.log(JSON.stringify({url: 'http://127.0.0.1:' + server.address().port + '/', feedback, pidHint: 'Stop this process to close the preview server'}));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.closeAllConnections(); server.close(); });
}
if (isMain(import.meta.url)) runCli(main);
