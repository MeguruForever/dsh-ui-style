/** Unit tests for the token harvester. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCss, createTokenAggregate, summarizeTokens,
  parseColor, rgbToHsl,
} from '../lib/tokens.js';

const FIXTURE = `
:root {
  --primary: #4f46e5;
  --background: #ffffff;
  --foreground: #18181b;
  --muted: #f4f4f5;
  --border: #e4e4e7;
  --radius: 0.5rem;
}
@media (prefers-color-scheme: dark) {
  :root { --background: #09090b; --foreground: #fafafa; }
}
body {
  font-family: "Inter", -apple-system, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: #18181b;
  background: #ffffff;
}
h1 { font-size: 2.25rem; font-weight: 700; letter-spacing: -0.02em; }
h2 { font-size: 1.5rem; font-weight: 600; }
.card {
  padding: 24px;
  margin-bottom: 16px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  background: #ffffff;
  color: #18181b;
}
.btn {
  background: #4f46e5;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 200ms ease-out;
}
.btn:hover { background: #4338ca; }
@media (min-width: 768px) { .grid { display: grid; gap: 24px; } }
@media (min-width: 1024px) { .grid { gap: 32px; } }
`;

test('aggregateCss harvests root custom properties', () => {
  const agg = createTokenAggregate();
  aggregateCss(agg, FIXTURE);
  assert.equal(agg.cssVariables.get('--primary').value, '#4f46e5');
  assert.equal(agg.cssVariables.get('--radius').value, '0.5rem');
});

test('colors are normalized and ranked by frequency', () => {
  const tokens = summarizeTokens(aggregateCss(createTokenAggregate(), FIXTURE));
  const values = tokens.colors.map(c => c.value);
  assert.ok(values.includes('#4f46e5'));
  assert.ok(values.includes('#ffffff'));
  // #18181b appears in body + .card + declaration order — most frequent dark
  const text = tokens.colorRoles.find(r => r.role === 'text');
  assert.ok(text, 'a text role is inferred');
});

test('semantic variable names drive color roles', () => {
  const tokens = summarizeTokens(aggregateCss(createTokenAggregate(), FIXTURE));
  const primary = tokens.colorRoles.find(r => r.role === 'primary');
  assert.equal(primary.value, '#4f46e5');
  assert.match(primary.via, /--primary/);
  const background = tokens.colorRoles.find(r => r.role === 'background');
  assert.equal(background.value, '#ffffff');
});

test('typography, spacing, radii and breakpoints land on sorted scales', () => {
  const tokens = summarizeTokens(aggregateCss(createTokenAggregate(), FIXTURE));
  assert.ok(tokens.typography.families.some(f => f.value.includes('Inter')));
  const sizePx = tokens.typography.sizes.map(s => s.value);
  assert.ok(sizePx.includes('16px'));
  // rem converted and sorted ascending: 1.5rem (24px) before 2.25rem (36px)
  const remSizes = tokens.typography.sizes.filter(s => s.value.endsWith('rem'));
  assert.deepEqual(remSizes.map(s => s.value), ['1.5rem', '2.25rem']);
  const radii = tokens.radii.map(r => r.value);
  assert.ok(radii.includes('8px'));
  assert.deepEqual(tokens.breakpoints.map(b => b.value), ['768px', '1024px']);
});

test('dark mode and motion are detected', () => {
  const tokens = summarizeTokens(aggregateCss(createTokenAggregate(), FIXTURE));
  assert.equal(tokens.darkMode, true);
  assert.ok(tokens.motion.durations.some(d => d.value === '200ms'));
  assert.ok(tokens.motion.easings.some(e => e.value === 'ease-out'));
  assert.ok(tokens.shadows.some(s => s.value.includes('rgba(0,0,0,0.1)')));
});

test('junk values and var() references are excluded', () => {
  const tokens = summarizeTokens(aggregateCss(createTokenAggregate(),
    '.a{color:inherit;margin:auto;padding:var(--x);font-size:unset;border-radius:none}'));
  assert.equal(tokens.colors.length, 0);
  assert.equal(tokens.spacing.length, 0);
  assert.equal(tokens.radii.length, 0);
});

test('color parsing helpers round-trip', () => {
  assert.deepEqual(parseColor('#4f46e5'), { r: 79, g: 70, b: 229 });
  assert.deepEqual(parseColor('rgb(79,70,229)'), { r: 79, g: 70, b: 229 });
  const hsl = rgbToHsl({ r: 79, g: 70, b: 229 });
  assert.ok(hsl.h > 230 && hsl.h < 250);
  assert.ok(hsl.s > 0.5);
});
