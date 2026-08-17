/** Integration tests: web capture and the mounted HTTP routes. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureWebsite, guardUrl, CaptureError } from '../lib/extract.js';
import { mountStyleRoutes } from '../lib/index.js';
import { createStyleStore } from '../lib/store.js';

process.env.DSH_UI_STYLE_ALLOW_PRIVATE = '1';

const CSS = `
:root { --brand: #ff5c00; --bg: #fafafa; }
body { font-family: "Space Grotesk", sans-serif; font-size: 15px; background: #fafafa; color: #222222; }
a { color: #ff5c00; }
.chip { border-radius: 999px; padding: 4px 12px; }
`;

const HTML = `<!doctype html><html><head>
<title>Fixture Site</title>
<meta name="description" content="A fixture page">
<meta name="theme-color" content="#fafafa">
<link rel="stylesheet" href="/app.css">
<style>.inline { color: #ff5c00; letter-spacing: 0.01em; }</style>
</head><body><h1>Hello</h1></body></html>`;

let target;
let targetUrl;

before(async () => {
  target = createServer((req, res) => {
    if (req.url === '/app.css') {
      res.writeHead(200, { 'content-type': 'text/css' });
      res.end(CSS);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(HTML);
  });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  targetUrl = `http://127.0.0.1:${target.address().port}/`;
});

after(() => target.close());

test('guardUrl blocks loopback by default and invalid protocols', () => {
  const saved = process.env.DSH_UI_STYLE_ALLOW_PRIVATE;
  delete process.env.DSH_UI_STYLE_ALLOW_PRIVATE;
  try {
    assert.throws(() => guardUrl('http://127.0.0.1:9/'), /loopback|private/);
    assert.throws(() => guardUrl('file:///etc/passwd'), /http/);
    assert.throws(() => guardUrl('not a url'), CaptureError);
    assert.equal(guardUrl('https://example.com/x').hostname, 'example.com');
  } finally {
    process.env.DSH_UI_STYLE_ALLOW_PRIVATE = saved;
  }
});

test('captureWebsite harvests tokens from HTML, inline style and linked CSS', async () => {
  const capture = await captureWebsite(targetUrl);
  assert.equal(capture.kind, 'website');
  assert.equal(capture.title, 'Fixture Site');
  assert.equal(capture.description, 'A fixture page');
  assert.deepEqual(capture.stylesheets, [targetUrl + 'app.css']);
  assert.ok(capture.tokens.cssVariables.some(v => v.name === '--brand' && v.value === '#ff5c00'));
  assert.ok(capture.tokens.colors.some(c => c.value === '#ff5c00'));
  assert.ok(capture.tokens.typography.families.some(f => f.value.includes('Space Grotesk')));
  assert.ok(capture.tokens.radii.some(r => r.value === '999px'));
  assert.ok(capture.tokens.colorRoles.some(r => r.role === 'primary' && r.value === '#ff5c00'));
  assert.ok(capture.tokens.colorRoles.some(r => r.role === 'theme-color'));
});

/* ------------------------- HTTP route integration ------------------------- */

function mockWebServer() {
  const routes = [];
  return {
    routes,
    register(route) {
      routes.push(route);
      return () => routes.splice(routes.indexOf(route), 1);
    },
  };
}

function mockRequest(method, url, body) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  req.headers = { origin: 'http://localhost:3080', host: 'localhost:3080' };
  return req;
}

test('routes: extract -> list -> get -> delete lifecycle', async () => {
  const root = join(mkdtempSync(join(tmpdir(), 'dus-it-')), 'skills');
  const store = createStyleStore(root);
  const webServer = mockWebServer();
  let invalidations = 0;
  const dispose = mountStyleRoutes(webServer, store, () => { invalidations += 1; });
  assert.equal(webServer.routes.length, 5);

  const call = async (path, method, url, body, kind = 'exact') => {
    const route = webServer.routes.find(r => r.path === path && r.kind === kind);
    assert.ok(route, `route ${path} (${kind}) registered`);
    const req = mockRequest(method, url, body);
    const res = {
      status: 0,
      body: null,
      writeHead(status) { this.status = status; return this; },
      end(payload) { this.body = JSON.parse(payload); },
    };
    await route.handler(req, res);
    return res;
  };

  // Extract from the fixture site.
  const extracted = await call('/dsh-ui-style/extract', 'POST', '/dsh-ui-style/extract', { url: targetUrl });
  assert.equal(extracted.status, 200, JSON.stringify(extracted.body));
  assert.equal(extracted.body.name, 'ui-style-127-0-0-1');
  assert.ok(extracted.body.counts.colors > 0);
  assert.equal(invalidations, 1);

  // List shows the saved style.
  const listed = await call('/dsh-ui-style/styles', 'GET', '/dsh-ui-style/styles');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.styles.length, 1);
  assert.equal(listed.body.styles[0].topColors[0], '#ff5c00');

  // Detail returns the SKILL.md.
  const detail = await call('/dsh-ui-style/styles', 'GET', '/dsh-ui-style/styles/ui-style-127-0-0-1', undefined, 'prefix');
  assert.equal(detail.status, 200);
  assert.match(detail.body.skill, /name: ui-style-127-0-0-1/);
  assert.match(detail.body.skill, /#ff5c00/);

  // Pin the style as the current selection, then read it back.
  const pinned = await call('/dsh-ui-style/selection', 'POST', '/dsh-ui-style/selection', { name: 'ui-style-127-0-0-1' });
  assert.equal(pinned.status, 200, JSON.stringify(pinned.body));
  assert.equal(pinned.body.style.name, 'ui-style-127-0-0-1');
  const readSelection = await call('/dsh-ui-style/selection', 'GET', '/dsh-ui-style/selection');
  assert.equal(readSelection.body.name, 'ui-style-127-0-0-1');

  // The styles listing carries the selection.
  const listedWithSelection = await call('/dsh-ui-style/styles', 'GET', '/dsh-ui-style/styles');
  assert.equal(listedWithSelection.body.selection, 'ui-style-127-0-0-1');

  // Delete removes it and invalidates the skill catalog; the selection is
  // auto-cleared with it.
  const deleted = await call('/dsh-ui-style/styles/delete', 'POST', '/dsh-ui-style/styles/delete', { name: 'ui-style-127-0-0-1' });
  assert.equal(deleted.status, 200);
  assert.equal(invalidations, 2);
  assert.equal((await store.list()).length, 0);
  assert.equal(await store.getSelection(), null);

  dispose();
  assert.equal(webServer.routes.length, 0);
});

test('routes reject bad input and foreign origins', async () => {
  const root = join(mkdtempSync(join(tmpdir(), 'dus-it-')), 'skills');
  const store = createStyleStore(root);
  const webServer = mockWebServer();
  mountStyleRoutes(webServer, store, () => {});
  const extract = webServer.routes.find(r => r.path === '/dsh-ui-style/extract');

  const respond = () => ({
    status: 0,
    writeHead(status) { this.status = status; return this; },
    end(payload) { this.body = JSON.parse(payload); },
  });

  // Missing URL.
  const badBody = mockRequest('POST', '/dsh-ui-style/extract', {});
  const res1 = respond();
  await extract.handler(badBody, res1);
  assert.equal(res1.status, 400);

  // Foreign origin on a mutation.
  const foreign = mockRequest('POST', '/dsh-ui-style/extract', { url: targetUrl });
  foreign.headers.origin = 'https://evil.example';
  const res2 = respond();
  await extract.handler(foreign, res2);
  assert.equal(res2.status, 403);
});
