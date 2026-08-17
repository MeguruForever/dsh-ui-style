/**
 * Web capture: fetch a page and its stylesheets, then harvest design tokens.
 *
 * Dependency-free by design — the plugin runs inside the DSH host and must not
 * pull a headless browser. HTML and CSS are scanned with tolerant regexes;
 * the output is a token aggregate plus page metadata.
 */
import { aggregateCss, createTokenAggregate, summarizeTokens } from './tokens.js';

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_STYLESHEETS = 10;
const MAX_CSS_TOTAL_BYTES = 2 * 1024 * 1024;
const USER_AGENT = 'dsh-ui-style/0.1 (+https://github.com/deepseek-ai/deepseek-harness)';

/** Hostname literals that must never be fetched (loopback / private ranges). */
const BLOCKED_HOST_RE = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?fe80:.*\]?)$/i;

/**
 * Validate a user-supplied URL. Only public http(s) is allowed.
 * NOTE: this checks the hostname literal only; DNS-rebinding style indirection
 * is out of scope for a local development tool bound to loopback.
 * @param {string} input
 * @returns {URL}
 */
export function guardUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new CaptureError('INVALID_URL', `Not a valid URL: ${input}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CaptureError('INVALID_URL', `Only http(s) URLs are supported: ${input}`);
  }
  // DSH_UI_STYLE_ALLOW_PRIVATE=1 opts into capturing loopback/intranet pages
  // (self-hosted tools, local dev servers). Off by default.
  if (process.env.DSH_UI_STYLE_ALLOW_PRIVATE !== '1' && BLOCKED_HOST_RE.test(url.hostname)) {
    throw new CaptureError('BLOCKED_HOST', `Refusing to fetch a loopback or private address: ${url.hostname}`);
  }
  return url;
}

export class CaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Fetch a text resource with a timeout and a hard byte cap.
 * @param {string} url
 * @param {{ maxBytes?: number, timeoutMs?: number, accept?: string }} [options]
 * @returns {Promise<{ url: string, text: string, contentType: string }>}
 */
export async function fetchText(url, options = {}) {
  const { maxBytes = MAX_HTML_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS, accept = 'text/html,*/*' } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept },
    });
    if (!response.ok) {
      throw new CaptureError('FETCH_FAILED', `GET ${url} -> HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body) return { url: response.url, text: '', contentType };
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        chunks.push(value.subarray(0, value.byteLength - (received - maxBytes)));
        break;
      }
      chunks.push(value);
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { url: response.url, text, contentType };
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    if (error?.name === 'AbortError') {
      throw new CaptureError('TIMEOUT', `GET ${url} timed out after ${timeoutMs}ms`);
    }
    throw new CaptureError('FETCH_FAILED', `GET ${url} failed: ${error?.message ?? error}`);
  } finally {
    clearTimeout(timer);
  }
}

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_DESC_RE = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i;
const META_DESC_RE2 = /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i;
const META_THEME_RE = /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']*)["']/i;
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
const STYLESHEET_LINK_RE = /<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi;
const HREF_RE = /href=["']([^"']+)["']/i;
const GOOGLE_FONTS_RE = /fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/g;
const FONT_FAMILY_PARAM_RE = /family=([^:&]+)/g;

/** Detect well-known UI frameworks from HTML/CSS signatures. */
export function detectFrameworks(...texts) {
  const haystack = texts.join('\n');
  const found = [];
  const checks = [
    [/--tw-[a-z-]+:|tailwindcss|tailwind\.config/i, 'Tailwind CSS'],
    [/--bs-[a-z-]+:|bootstrap(?:\.min)?\.css/i, 'Bootstrap'],
    [/--mdc-[a-z-]+:|--mat-[a-z-]+:|material-components/i, 'Material'],
    [/--ant-[a-z-]+:|antd/i, 'Ant Design'],
    [/chakra-ui|--chakra-[a-z-]+:/i, 'Chakra UI'],
    [/--mui-[a-z-]+:|@mui\/material/i, 'MUI'],
    [/radix-ui|--radix-/i, 'Radix UI'],
    [/shadcn|components\.json/i, 'shadcn/ui'],
    [/bulma(?:\.min)?\.css/i, 'Bulma'],
    [/foundation(?:\.min)?\.css/i, 'Foundation'],
  ];
  for (const [re, label] of checks) if (re.test(haystack)) found.push(label);
  return found;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

/**
 * Capture the design tokens of a public web page.
 * @param {string} input validated page URL
 * @returns {Promise<object>} capture result for skill generation
 */
export async function captureWebsite(input) {
  const url = guardUrl(input);
  const page = await fetchText(url.href, { maxBytes: MAX_HTML_BYTES, accept: 'text/html,*/*' });
  const html = page.text;
  if (html.length === 0) {
    throw new CaptureError('EMPTY_PAGE', `GET ${url.href} returned an empty body`);
  }

  const agg = createTokenAggregate();
  const titleMatch = TITLE_RE.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : url.hostname;
  const descMatch = META_DESC_RE.exec(html) ?? META_DESC_RE2.exec(html);
  const description = descMatch ? decodeEntities(descMatch[1]) : '';
  const themeMatch = META_THEME_RE.exec(html);

  // Inline <style> blocks.
  let styleMatch;
  STYLE_BLOCK_RE.lastIndex = 0;
  while ((styleMatch = STYLE_BLOCK_RE.exec(html)) !== null) aggregateCss(agg, styleMatch[1]);

  // External stylesheets.
  const sheetUrls = [];
  let linkMatch;
  STYLESHEET_LINK_RE.lastIndex = 0;
  while ((linkMatch = STYLESHEET_LINK_RE.exec(html)) !== null && sheetUrls.length < MAX_STYLESHEETS) {
    const href = HREF_RE.exec(linkMatch[0]);
    if (!href) continue;
    try {
      const sheetUrl = new URL(decodeEntities(href[1]), page.url);
      if (process.env.DSH_UI_STYLE_ALLOW_PRIVATE === '1' || !BLOCKED_HOST_RE.test(sheetUrl.hostname)) {
        sheetUrls.push(sheetUrl.href);
      }
    } catch { /* skip malformed href */ }
  }

  const fetched = [];
  const cssTexts = [];
  let cssBudget = MAX_CSS_TOTAL_BYTES;
  await Promise.all(sheetUrls.map(async sheetUrl => {
    try {
      const sheet = await fetchText(sheetUrl, { maxBytes: cssBudget, accept: 'text/css,*/*' });
      fetched.push(sheetUrl);
      cssTexts.push(sheet.text);
      cssBudget -= sheet.text.length;
      aggregateCss(agg, sheet.text);
    } catch { /* an unreachable stylesheet must not fail the capture */ }
  }));

  // Web fonts referenced through Google Fonts links.
  const fonts = new Set();
  let fontMatch;
  GOOGLE_FONTS_RE.lastIndex = 0;
  while ((fontMatch = GOOGLE_FONTS_RE.exec(html)) !== null) {
    let familyMatch;
    FONT_FAMILY_PARAM_RE.lastIndex = 0;
    while ((familyMatch = FONT_FAMILY_PARAM_RE.exec(fontMatch[1])) !== null) {
      fonts.add(decodeURIComponent(familyMatch[1]).replace(/\+/g, ' '));
    }
  }

  const tokens = summarizeTokens(agg);
  if (themeMatch && !tokens.colorRoles.some(r => r.via === 'meta theme-color')) {
    tokens.colorRoles.push({ role: 'theme-color', value: themeMatch[1].trim(), via: 'meta theme-color' });
  }

  return {
    kind: 'website',
    sourceUrl: page.url,
    requestedUrl: url.href,
    title,
    description,
    capturedAt: new Date().toISOString(),
    fonts: [...fonts],
    frameworks: detectFrameworks(html, ...cssTexts),
    stylesheets: fetched,
    tokens,
  };
}
