/**
 * `ctx.skills` provider for the plugin's own skills directory.
 *
 * The built-in filesystem provider scans project and user roots; this
 * provider adds the plugin root so captured styles and the bundled
 * `ui-design-craft` skill are discoverable in every session immediately
 * after generation — no copying into `~/.dsh/skills` required.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseFrontmatter(text) {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return null;
  const body = text.slice(match[0].length);
  const fields = {};
  let inMetadata = false;
  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s/.test(line)) continue; // nested metadata values — not needed here
    inMetadata = /^metadata\s*:/.test(line);
    if (inMetadata) continue;
    const field = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (field) fields[field[1]] = field[2].trim();
  }
  if (!fields.name || !SKILL_NAME_RE.test(fields.name) || !fields.description) return null;
  return { fields, body };
}

async function loadBundle(dir) {
  const path = join(dir, 'SKILL.md');
  const text = await fs.readFile(path, 'utf8').catch(() => null);
  if (text === null) return null;
  const parsed = parseFrontmatter(text);
  if (!parsed) return null;
  return { ...parsed, path };
}

/**
 * Register the plugin skill provider.
 * @param {object} skills ctx.skills registry
 * @param {string} root absolute skills directory
 * @param {{ current: { invalidate: () => void } | null }} [controlRef]
 *   receives the provider control so callers can invalidate catalogs after
 *   writing or deleting bundles.
 */
export function registerStyleSkillProvider(skills, root, controlRef) {
  return skills.registerProvider(control => {
    if (controlRef) controlRef.current = control;
    return {
    name: 'dsh-ui-style',

    async list(options) {
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
      const candidates = [];
      for (const entry of entries) {
        if (options.signal?.aborted) break;
        if (!entry.isDirectory() || !SKILL_NAME_RE.test(entry.name)) continue;
        const dir = join(root, entry.name);
        const bundle = await loadBundle(dir);
        if (!bundle) continue;
        candidates.push({
          name: bundle.fields.name,
          description: bundle.fields.description,
          ...(bundle.fields.whenToUse ? { whenToUse: bundle.fields.whenToUse } : {}),
          invocation: { modelInvocable: true, userInvocable: true },
          source: entry.name === 'ui-design-craft' ? 'bundled' : 'custom',
          provider: 'dsh-ui-style',
          rank: entry.name === 'ui-design-craft' ? 600 : 300,
          locator: { path: bundle.path },
          path: bundle.path,
          resourceBase: { kind: 'directory', path: dir },
        });
      }
      return candidates;
    },

    async get(candidate, options) {
      const path = candidate?.locator?.path;
      if (typeof path !== 'string') return undefined;
      const text = await fs.readFile(path, 'utf8').catch(() => null);
      if (text === null || options.signal?.aborted) return undefined;
      const parsed = parseFrontmatter(text);
      if (!parsed || parsed.fields.name !== candidate.name) return undefined;
      return {
        name: parsed.fields.name,
        description: parsed.fields.description,
        ...(parsed.fields.whenToUse ? { whenToUse: parsed.fields.whenToUse } : {}),
        invocation: { modelInvocable: true, userInvocable: true },
        source: candidate.source,
        provider: 'dsh-ui-style',
        resourceBase: { kind: 'directory', path: join(path, '..') },
        content: parsed.body,
        path,
      };
    },
  };
  });
}
