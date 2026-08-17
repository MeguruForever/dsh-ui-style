/** Unit tests for skill rendering and bundle storage. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSkillMarkdown, renderTokensJson, skillNameFor, slugify, deriveDesignLanguage } from '../lib/skill.js';
import { createStyleStore, isValidSkillName, BUILTIN_SKILL } from '../lib/store.js';

const capture = {
  kind: 'website',
  sourceUrl: 'https://example.com/',
  requestedUrl: 'https://example.com/',
  title: 'Example',
  description: 'An example site',
  capturedAt: '2026-01-02T03:04:05.000Z',
  fonts: ['Inter'],
  frameworks: ['Tailwind CSS'],
  stylesheets: ['https://example.com/app.css'],
  tokens: {
    colorRoles: [{ role: 'primary', value: '#4f46e5', via: 'variable --primary' }],
    colors: [{ value: '#4f46e5', count: 12 }, { value: '#ffffff', count: 9 }],
    cssVariables: [{ name: '--primary', value: '#4f46e5' }],
    typography: {
      families: [{ value: '"Inter", sans-serif', count: 5 }],
      sizes: [{ value: '16px', count: 8 }],
      weights: [{ value: '400', count: 6 }],
      lineHeights: [{ value: '1.5', count: 4 }],
      letterSpacings: [],
    },
    spacing: [{ value: '8px', count: 10 }],
    radii: [{ value: '8px', count: 7 }],
    shadows: [],
    breakpoints: [{ value: '768px', count: 2 }],
    motion: { durations: [{ value: '200ms', count: 3 }], easings: [] },
    darkMode: false,
    stats: { stylesheetBytes: 1000 },
  },
};

test('slugify and skillNameFor produce valid kebab-case names', () => {
  assert.equal(slugify('WWW.Example-Site.com'), 'example-site-com');
  assert.equal(skillNameFor(capture), 'ui-style-example-com');
  assert.ok(isValidSkillName(skillNameFor(capture)));
  const repoCapture = { ...capture, kind: 'repository', title: 'shadcn/ui' };
  assert.equal(skillNameFor(repoCapture), 'ui-style-shadcn-ui');
});

test('renderSkillMarkdown emits valid frontmatter and all sections', () => {
  const md = renderSkillMarkdown(capture, 'ui-style-example-com');
  assert.match(md, /^---\nname: ui-style-example-com\n/);
  assert.match(md, /description: .+Example.+/);
  assert.match(md, /whenToUse: .+/);
  assert.match(md, /## Design language/);
  assert.match(md, /## Color roles/);
  assert.match(md, /#4f46e5/);
  assert.match(md, /## Typography/);
  assert.match(md, /## Spacing scale/);
  assert.match(md, /## Dark mode\n\nNo dark scheme/);
  assert.match(md, /references\/tokens\.json/);
});

test('renderSkillMarkdown includes component blueprints when present', () => {
  const withComponents = {
    ...capture,
    tokens: {
      ...capture.tokens,
      components: [{
        selector: '.btn',
        props: [
          { prop: 'background', value: '#4f46e5' },
          { prop: 'border-radius', value: '8px' },
        ],
      }],
      containerWidths: [{ value: '1200px', count: 2 }],
    },
  };
  const md = renderSkillMarkdown(withComponents, 'ui-style-example-com');
  assert.match(md, /## Component blueprints/);
  assert.match(md, /\*\*`\.btn`\*\* — background: #4f46e5; border-radius: 8px/);
  assert.match(md, /## Layout containers/);
  assert.match(md, /1200px/);
});

test('deriveDesignLanguage turns tokens into design traits', () => {
  const { traits, summary } = deriveDesignLanguage({
    colorRoles: [{ role: 'primary', value: '#4f46e5', via: 'variable --primary' }],
    colors: [],
    cssVariables: [],
    typography: {
      families: [{ value: 'system-ui, sans-serif', count: 3 }],
      sizes: [{ value: '16px', count: 9 }, { value: '30px', count: 2 }],
      weights: [], lineHeights: [], letterSpacings: [],
    },
    spacing: [{ value: '8px', count: 10 }, { value: '16px', count: 5 }],
    radii: [{ value: '6px', count: 8 }],
    shadows: [],
    borderWidths: [{ value: '1px', count: 4 }],
    containerWidths: [],
    breakpoints: [],
    motion: { durations: [{ value: '200ms', count: 3 }], easings: [] },
    darkMode: true,
  });
  const byTrait = Object.fromEntries(traits.map(t => [t.trait, t.value]));
  assert.match(byTrait.Corners, /subtly rounded/);
  assert.match(byTrait.Elevation, /flat/);
  assert.match(byTrait['Palette mood'], /indigo|blue|violet/);
  assert.match(byTrait['Type voice'], /system font stack/);
  assert.match(byTrait.Borders, /hairline/);
  assert.match(byTrait.Motion, /brisk/);
  assert.match(byTrait['Dark mode'], /dark/);
  assert.ok(summary.length > 20);
});

test('renderTokensJson is valid JSON with the token payload', () => {
  const parsed = JSON.parse(renderTokensJson(capture));
  assert.equal(parsed.name, 'ui-style-example-com');
  assert.equal(parsed.tokens.colors[0].value, '#4f46e5');
});

test('style store saves, lists, reads and removes bundles', async () => {
  const root = join(mkdtempSync(join(tmpdir(), 'dus-')), 'skills');
  const store = createStyleStore(root);
  await store.save('ui-style-example-com', {
    skill: renderSkillMarkdown(capture, 'ui-style-example-com'),
    tokens: renderTokensJson(capture),
    meta: {
      title: 'Example', kind: 'website', sourceUrl: 'https://example.com/',
      capturedAt: capture.capturedAt, frameworks: ['Tailwind CSS'], topColors: ['#4f46e5'],
    },
  });

  const list = await store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'ui-style-example-com');
  assert.equal(list[0].builtin, false);
  assert.deepEqual(list[0].topColors, ['#4f46e5']);

  const detail = await store.get('ui-style-example-com');
  assert.match(detail.skill, /## Color roles/);
  assert.equal(detail.tokens.name, 'ui-style-example-com');

  assert.equal(await store.remove('ui-style-example-com'), true);
  assert.equal((await store.list()).length, 0);
  assert.equal(await store.remove('ui-style-example-com'), false);
});

test('store protects the built-in skill and rejects path escapes', async () => {
  const root = join(mkdtempSync(join(tmpdir(), 'dus-')), 'skills');
  const store = createStyleStore(root);
  await assert.rejects(() => store.remove(BUILTIN_SKILL), /built in/);
  await assert.rejects(() => store.save(BUILTIN_SKILL, { skill: '', tokens: '', meta: {} }), /built in/);
  await assert.rejects(() => store.get('../escape'), /invalid skill name/);
  await assert.rejects(() => store.get('UPPERCASE'), /invalid skill name/);
  await fs.rm(root, { recursive: true, force: true });
});
