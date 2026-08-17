/**
 * dsh-ui-style — host plugin.
 *
 * Captures the UI design style of a website or GitHub repository, distills it
 * into a reusable DSH skill bundle stored in the plugin's own `skills/`
 * directory, and publishes that directory through `ctx.skills` so captured
 * styles are invocable in any session. The browser half (./client) drives the
 * HTTP routes mounted here.
 */
import { promises as fs } from 'node:fs';
import { captureWebsite, CaptureError } from './extract.js';
import { captureRepository } from './github.js';
import { renderSkillMarkdown, renderTokensJson, skillNameFor } from './skill.js';
import { createStyleStore, defaultSkillsRoot, isValidSkillName, BUILTIN_SKILL } from './store.js';
import { registerStyleSkillProvider } from './provider.js';

export const name = 'dsh-ui-style';

const BODY_LIMIT_BYTES = 4 * 1024;
const GITHUB_RE = /^https?:\/\/(?:www\.)?github\.com\/[^/?#]+\/[^/?#]+/i;

function sendJson(response, status, value) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

function requireMethod(request, response, method) {
  if (request.method === method) return true;
  sendJson(response, 405, { error: `use ${method}` });
  return false;
}

/** Mutations only from the loopback page itself. */
function isSameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin === undefined || host === undefined) return false;
  try {
    const url = new URL(origin);
    return url.host === host && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function readJsonBody(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let received = 0;
    request.on('data', chunk => {
      received += chunk.length;
      if (received > BODY_LIMIT_BYTES) {
        rejectPromise(new Error('request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        rejectPromise(new Error('invalid JSON body'));
      }
    });
    request.on('error', rejectPromise);
  });
}

function errorStatus(error) {
  if (!(error instanceof CaptureError)) return 500;
  switch (error.code) {
    case 'INVALID_URL': case 'BLOCKED_HOST': case 'NO_STYLE_FILES': return 400;
    case 'NOT_FOUND': return 404;
    case 'RATE_LIMITED': return 429;
    case 'TIMEOUT': return 504;
    default: return 502;
  }
}

/**
 * Run a capture end to end: fetch, tokenize, render the skill, persist it.
 * @returns {Promise<{ name: string, dir: string, capture: object }>}
 */
async function captureToSkill(store, url) {
  const capture = GITHUB_RE.test(url) ? await captureRepository(url) : await captureWebsite(url);
  const name = skillNameFor(capture);
  if (!isValidSkillName(name)) throw new CaptureError('INVALID_URL', `cannot derive a skill name from ${url}`);
  const meta = {
    title: capture.title,
    kind: capture.kind,
    sourceUrl: capture.sourceUrl,
    capturedAt: capture.capturedAt,
    frameworks: capture.frameworks ?? [],
    topColors: (capture.tokens?.colors ?? []).slice(0, 6).map(c => c.value),
  };
  const dir = await store.save(name, {
    skill: renderSkillMarkdown(capture, name),
    tokens: renderTokensJson(capture),
    meta,
  });
  return { name, dir, capture };
}

function summarizeSaved(name, capture, dir) {
  const t = capture.tokens ?? {};
  return {
    name,
    dir,
    title: capture.title,
    kind: capture.kind,
    sourceUrl: capture.sourceUrl,
    capturedAt: capture.capturedAt,
    frameworks: capture.frameworks ?? [],
    counts: {
      colors: t.colors?.length ?? 0,
      cssVariables: t.cssVariables?.length ?? 0,
      typeSizes: t.typography?.sizes?.length ?? 0,
      spacings: t.spacing?.length ?? 0,
      radii: t.radii?.length ?? 0,
      shadows: t.shadows?.length ?? 0,
      components: t.components?.length ?? 0,
    },
    topColors: (t.colors ?? []).slice(0, 6).map(c => c.value),
  };
}

/**
 * Mount the plugin's HTTP routes on the DSH web server.
 * @returns {() => void} disposer unregistering every route
 */
export function mountStyleRoutes(webServer, store, invalidate) {
  let capturing = false;
  const STYLE_PATH_RE = /^\/dsh-ui-style\/styles\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?(?:[?#].*)?$/;

  const disposers = [
    webServer.register({
      kind: 'exact',
      path: '/dsh-ui-style/styles',
      handler: async (request, response) => {
        if (!requireMethod(request, response, 'GET')) return;
        try {
          sendJson(response, 200, {
            skillsRoot: store.root,
            styles: await store.list(),
            selection: await store.getSelection(),
          });
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    }),

    webServer.register({
      // No trailing slash: the webserver matches `prefix` exactly or
      // `prefix + '/'`; the exact `/styles` route above wins the bare path.
      kind: 'prefix',
      path: '/dsh-ui-style/styles',
      handler: async (request, response) => {
        const match = STYLE_PATH_RE.exec(request.url ?? '');
        if (!match) {
          sendJson(response, 404, { error: 'not found' });
          return;
        }
        if (!requireMethod(request, response, 'GET')) return;
        const detail = await store.get(match[1]);
        if (!detail) {
          sendJson(response, 404, { error: `no style named ${match[1]}` });
          return;
        }
        sendJson(response, 200, detail);
      },
    }),

    webServer.register({
      kind: 'exact',
      path: '/dsh-ui-style/extract',
      handler: async (request, response) => {
        if (!requireMethod(request, response, 'POST')) return;
        if (!isSameOrigin(request)) {
          sendJson(response, 403, { error: 'same-origin loopback requests only' });
          return;
        }
        if (capturing) {
          sendJson(response, 409, { error: 'another capture is already running' });
          return;
        }
        let body;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          return;
        }
        const url = typeof body.url === 'string' ? body.url.trim() : '';
        if (url.length === 0 || url.length > 2048) {
          sendJson(response, 400, { error: 'a non-empty "url" string is required' });
          return;
        }
        capturing = true;
        try {
          const { name: styleName, dir, capture } = await captureToSkill(store, url);
          invalidate();
          sendJson(response, 200, summarizeSaved(styleName, capture, dir));
        } catch (error) {
          sendJson(response, errorStatus(error), {
            error: error instanceof Error ? error.message : String(error),
            code: error instanceof CaptureError ? error.code : 'INTERNAL',
          });
        } finally {
          capturing = false;
        }
      },
    }),

    webServer.register({
      kind: 'exact',
      path: '/dsh-ui-style/selection',
      handler: async (request, response) => {
        if (request.method === 'GET') {
          const name = await store.getSelection();
          if (name === null) {
            sendJson(response, 200, { name: null });
            return;
          }
          const styles = await store.list();
          const style = styles.find(s => s.name === name);
          sendJson(response, 200, { name, style: style ?? null });
          return;
        }
        if (!requireMethod(request, response, 'POST')) return;
        if (!isSameOrigin(request)) {
          sendJson(response, 403, { error: 'same-origin loopback requests only' });
          return;
        }
        let body;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          return;
        }
        if (body.name === null) {
          await store.setSelection(null);
          sendJson(response, 200, { name: null });
          return;
        }
        const selected = typeof body.name === 'string' ? body.name.trim() : '';
        if (!isValidSkillName(selected)) {
          sendJson(response, 400, { error: 'a valid skill "name" (or null) is required' });
          return;
        }
        const styles = await store.list();
        const style = styles.find(s => s.name === selected && !s.builtin);
        if (!style) {
          sendJson(response, 404, { error: `no captured style named ${selected}` });
          return;
        }
        await store.setSelection(selected);
        sendJson(response, 200, { name: selected, style });
      },
    }),

    webServer.register({
      kind: 'exact',
      path: '/dsh-ui-style/styles/delete',
      handler: async (request, response) => {
        if (!requireMethod(request, response, 'POST')) return;
        if (!isSameOrigin(request)) {
          sendJson(response, 403, { error: 'same-origin loopback requests only' });
          return;
        }
        let body;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          return;
        }
        const styleName = typeof body.name === 'string' ? body.name.trim() : '';
        if (!isValidSkillName(styleName)) {
          sendJson(response, 400, { error: 'a valid skill "name" is required' });
          return;
        }
        try {
          const removed = await store.remove(styleName);
          if (!removed) {
            sendJson(response, 404, { error: `no style named ${styleName}` });
            return;
          }
          invalidate();
          sendJson(response, 200, { removed: styleName });
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    }),
  ];

  return () => {
    for (const dispose of disposers) dispose();
  };
}

/**
 * Cordis entry.
 * @param {object} ctx cordis context
 * @param {{ skillsDir?: string }} [config]
 */
export function apply(ctx, config = {}) {
  const skillsRoot = config.skillsDir ?? defaultSkillsRoot();
  const store = createStyleStore(skillsRoot);

  // Make sure the skills root exists so provider scans never fail on a
  // fresh install where nothing has been captured yet.
  void fs.mkdir(skillsRoot, { recursive: true }).catch(() => {});

  const controlRef = { current: null };

  ctx.inject(['skills'], skillsContext => {
    skillsContext.effect(
      () => registerStyleSkillProvider(skillsContext.skills, store.root, controlRef),
      'dsh-ui-style: skill provider',
    );
  });

  ctx.inject(['webServer'], webContext => {
    webContext.effect(
      () => mountStyleRoutes(webContext.webServer, store, () => controlRef.current?.invalidate()),
      'dsh-ui-style: http routes',
    );
  });
}

export { BUILTIN_SKILL };
