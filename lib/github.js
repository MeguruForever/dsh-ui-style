/**
 * Repository capture: pull the style-bearing files of a GitHub project and
 * harvest the same design-token vocabulary used for web captures.
 *
 * Uses the public GitHub REST + raw endpoints. Unauthenticated access allows
 * 60 requests/hour per host; set GITHUB_TOKEN in the DSH host environment to
 * raise that limit. No git clone is performed.
 */
import { aggregateCss, createTokenAggregate, summarizeTokens } from './tokens.js';
import { CaptureError, detectFrameworks, fetchText } from './extract.js';

const MAX_STYLE_FILES = 14;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;

const GITHUB_URL_RE = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+?)(?:\.git)?(?:[/?#].*)?$/i;

/** Paths that usually carry a project's design tokens, best first. */
const STYLE_PATH_PATTERNS = [
  /(?:^|\/)tailwind\.config\.[cm]?[jt]s$/i,
  /(?:^|\/)components\.json$/i, // shadcn/ui
  /(?:^|\/)theme\.[cm]?[jt]s$/i,
  /(?:^|\/)themes?\/[^/]+\.[cm]?[jt]s$/i,
  /(?:^|\/)(?:globals|index|app|main|base|root|variables?|tokens?|theme)\.(?:css|scss|less)$/i,
  /(?:^|\/)styles?\/[^/]+\.(?:css|scss|less)$/i,
  /(?:^|\/)design[-_]?tokens?\.(?:json|[cm]?[jt]s)$/i,
  /(?:^|\/)(?:src|app|pages|web|frontend|client)\/[^/]*(?:theme|token|style)[^/]*\.[cm]?[jt]s$/i,
  /(?:^|\/)package\.json$/i,
];

/**
 * Parse a GitHub repository URL.
 * @param {string} input
 * @returns {{ owner: string, repo: string }}
 */
export function parseGitHubUrl(input) {
  const match = GITHUB_URL_RE.exec(input.trim());
  if (!match) {
    throw new CaptureError('INVALID_URL', `Not a GitHub repository URL: ${input}`);
  }
  return { owner: match[1], repo: match[2] };
}

function githubHeaders() {
  const headers = {
    'user-agent': 'dsh-ui-style/0.1',
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function githubJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: githubHeaders() });
    if (response.status === 403 || response.status === 429) {
      throw new CaptureError(
        'RATE_LIMITED',
        `GitHub API rate limit reached for ${url}. Set GITHUB_TOKEN on the DSH host to raise the limit.`,
      );
    }
    if (response.status === 404) {
      throw new CaptureError('NOT_FOUND', `GitHub resource not found: ${url} (private repos need the web-URL capture instead)`);
    }
    if (!response.ok) {
      throw new CaptureError('FETCH_FAILED', `GET ${url} -> HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError('FETCH_FAILED', `GET ${url} failed: ${error?.message ?? error}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Harvest token-ish values from arbitrary source text (JS/TS configs). */
function aggregateConfigText(agg, text) {
  // Reuse the CSS scanner: config files are full of the same literals.
  aggregateCss(agg, text
    .replace(/(['"`])\s*([A-Za-z][A-Za-z0-9_ -]*)\s*\1\s*:/g, '$2:') // quoted keys -> declarations-ish
  );
}

/** Path segments that mark non-product files (fixtures, tests, examples). */
const NON_PRODUCT_PATH_RE = /(?:^|\/)(?:tests?|__tests__|fixtures?|e2e|spec|mocks?|examples?|demos?|stories|storybook|\.storybook|templates?|starters?|boilerplates?)(?:\/)/i;

function rankPath(path) {
  for (let i = 0; i < STYLE_PATH_PATTERNS.length; i += 1) {
    if (STYLE_PATH_PATTERNS[i].test(path)) {
      // Test fixtures and examples carry style-shaped files but not the
      // product's design language — deprioritize them behind any real file.
      return NON_PRODUCT_PATH_RE.test(path) ? i + 100 : i;
    }
  }
  return -1;
}

/**
 * Capture the design tokens of a GitHub repository.
 * @param {string} input e.g. https://github.com/owner/repo
 * @returns {Promise<object>} capture result for skill generation
 */
export async function captureRepository(input) {
  const { owner, repo } = parseGitHubUrl(input);
  const repoInfo = await githubJson(`https://api.github.com/repos/${owner}/${repo}`);
  const branch = repoInfo.default_branch ?? 'HEAD';
  const tree = await githubJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (tree.truncated) {
    // A truncated tree still works; shallow paths simply may be missing.
  }
  const paths = (tree.tree ?? [])
    .filter(node => node.type === 'blob' && typeof node.path === 'string')
    .map(node => node.path);

  const candidates = paths
    .map(path => ({ path, rank: rankPath(path) }))
    .filter(c => c.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.path.length - b.path.length)
    .slice(0, MAX_STYLE_FILES);

  if (candidates.length === 0) {
    throw new CaptureError(
      'NO_STYLE_FILES',
      `No recognizable style files (tailwind.config, theme.*, styles/*.css, package.json…) found in ${owner}/${repo}.`,
    );
  }

  const agg = createTokenAggregate();
  const frameworks = new Set();
  const usedFiles = [];
  const languages = new Set();
  let budget = MAX_TOTAL_BYTES;

  for (const { path } of candidates) {
    if (budget <= 0) break;
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    let text;
    try {
      const file = await fetchText(rawUrl, { maxBytes: Math.min(MAX_FILE_BYTES, budget), accept: '*/*' });
      text = file.text;
    } catch {
      continue; // one unreadable file must not fail the capture
    }
    budget -= text.length;
    usedFiles.push(path);

    if (/(?:^|\/)package\.json$/i.test(path)) {
      try {
        const pkg = JSON.parse(text);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [dep, label] of [
          ['tailwindcss', 'Tailwind CSS'], ['bootstrap', 'Bootstrap'],
          ['@mui/material', 'MUI'], ['antd', 'Ant Design'],
          ['@chakra-ui/react', 'Chakra UI'], ['@radix-ui/react-dialog', 'Radix UI'],
          ['styled-components', 'styled-components'], ['@emotion/react', 'Emotion'],
          ['sass', 'Sass'], ['less', 'Less'], ['unocss', 'UnoCSS'],
        ]) {
          if (deps[dep]) frameworks.add(label);
        }
        if (deps.react) languages.add('React');
        if (deps.vue) languages.add('Vue');
        if (deps.svelte || deps['@sveltejs/kit']) languages.add('Svelte');
        if (deps.next) languages.add('Next.js');
        if (deps['@angular/core']) languages.add('Angular');
      } catch { /* malformed package.json */ }
      continue;
    }
    if (/components\.json$/i.test(path)) {
      frameworks.add('shadcn/ui');
      continue;
    }
    if (/\.(?:css|scss|less)$/i.test(path)) aggregateCss(agg, text);
    else aggregateConfigText(agg, text);
  }

  const tokens = summarizeTokens(agg);
  return {
    kind: 'repository',
    sourceUrl: `https://github.com/${owner}/${repo}`,
    requestedUrl: input,
    title: repoInfo.name ?? repo,
    description: repoInfo.description ?? '',
    capturedAt: new Date().toISOString(),
    branch,
    stars: repoInfo.stargazers_count ?? null,
    fonts: [],
    frameworks: [...new Set([...frameworks, ...detectFrameworks(...usedFiles)])],
    languages: [...languages],
    styleFiles: usedFiles,
    tokens,
  };
}
