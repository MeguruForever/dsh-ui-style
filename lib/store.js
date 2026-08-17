/**
 * Skill-bundle storage: the plugin keeps every captured style as a standard
 * skill bundle inside its own `skills/` directory, next to the built-in
 * `ui-design-craft` skill. A skill bundle is `<name>/SKILL.md` plus optional
 * `references/` resources, the same layout DSH's filesystem skill provider
 * scans — captured styles can therefore also be copied into any project or
 * user skill root unchanged.
 */
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILTIN_SKILL = 'ui-design-craft';
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Default skills root: the package's own `skills/` directory. */
export function defaultSkillsRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills');
}

export function isValidSkillName(name) {
  return SKILL_NAME_RE.test(name) && name.length <= 64;
}

/** Throw unless `name` resolves to a direct child of the skills root. */
function safeChild(root, name) {
  if (!isValidSkillName(name)) throw new Error(`invalid skill name: ${name}`);
  const dir = resolve(root, name);
  if (dirname(dir) !== resolve(root)) throw new Error(`skill escapes its root: ${name}`);
  return dir;
}

export function createStyleStore(root = defaultSkillsRoot()) {
  const skillsRoot = root;

  async function ensureRoot() {
    await fs.mkdir(skillsRoot, { recursive: true });
  }

  async function readMeta(dir) {
    try {
      return JSON.parse(await fs.readFile(join(dir, 'meta.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  async function readFrontmatterName(dir) {
    try {
      const head = (await fs.readFile(join(dir, 'SKILL.md'), 'utf8')).slice(0, 2048);
      const name = /^name:\s*(\S+)\s*$/m.exec(head)?.[1];
      const description = /^description:\s*(.+)$/m.exec(head)?.[1]?.trim();
      return name ? { name, description: description ?? '' } : null;
    } catch {
      return null;
    }
  }

  return {
    root: skillsRoot,

    /** List every skill bundle in the root, newest captures first. */
    async list() {
      await ensureRoot();
      const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => []);
      const styles = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !isValidSkillName(entry.name)) continue;
        const dir = join(skillsRoot, entry.name);
        const frontmatter = await readFrontmatterName(dir);
        if (!frontmatter) continue;
        const meta = await readMeta(dir);
        styles.push({
          name: frontmatter.name,
          description: frontmatter.description,
          builtin: entry.name === BUILTIN_SKILL,
          title: meta?.title ?? frontmatter.name,
          kind: meta?.kind ?? null,
          sourceUrl: meta?.sourceUrl ?? null,
          capturedAt: meta?.capturedAt ?? null,
          frameworks: meta?.frameworks ?? [],
          topColors: meta?.topColors ?? [],
        });
      }
      styles.sort((a, b) => {
        if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
        return (b.capturedAt ?? '').localeCompare(a.capturedAt ?? '');
      });
      return styles;
    },

    /** Read one style bundle for the detail view. */
    async get(name) {
      const dir = safeChild(skillsRoot, name);
      const skill = await fs.readFile(join(dir, 'SKILL.md'), 'utf8').catch(() => null);
      if (skill === null) return null;
      const meta = await readMeta(dir);
      let tokens = null;
      try {
        tokens = JSON.parse(await fs.readFile(join(dir, 'references', 'tokens.json'), 'utf8'));
      } catch { /* optional resource */ }
      return { name, skill, meta, tokens, builtin: name === BUILTIN_SKILL };
    },

    /**
     * Persist one captured style bundle.
     * @param {string} name
     * @param {{ skill: string, tokens: string, meta: object }} bundle
     */
    async save(name, bundle) {
      if (name === BUILTIN_SKILL) throw new Error(`${BUILTIN_SKILL} is built in and cannot be overwritten`);
      const dir = safeChild(skillsRoot, name);
      await fs.mkdir(join(dir, 'references'), { recursive: true });
      await fs.writeFile(join(dir, 'SKILL.md'), bundle.skill, 'utf8');
      await fs.writeFile(join(dir, 'references', 'tokens.json'), bundle.tokens, 'utf8');
      await fs.writeFile(join(dir, 'meta.json'), JSON.stringify(bundle.meta, null, 2) + '\n', 'utf8');
      return dir;
    },

    /** Delete one captured style. Built-ins are protected. */
    async remove(name) {
      if (name === BUILTIN_SKILL) throw new Error(`${BUILTIN_SKILL} is built in and cannot be deleted`);
      const dir = safeChild(skillsRoot, name);
      const stat = await fs.stat(dir).catch(() => null);
      if (!stat) return false;
      await fs.rm(dir, { recursive: true, force: true });
      return true;
    },
  };
}
