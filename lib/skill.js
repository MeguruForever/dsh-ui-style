/**
 * SKILL.md generation: turn a capture result into an agent-consumable skill
 * bundle (`<name>/SKILL.md` + `references/tokens.json`).
 */

/** Kebab-case slug from a hostname, repo name, or free-form title. */
export function slugify(input) {
  const slug = String(input)
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48)
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

/**
 * Derive the skill name for a capture. Websites slug by hostname,
 * repositories by repo name.
 * @param {object} capture
 */
export function skillNameFor(capture) {
  let base;
  if (capture.kind === 'repository') {
    base = slugify(capture.title);
  } else {
    try {
      base = slugify(new URL(capture.sourceUrl).hostname);
    } catch {
      base = slugify(capture.title);
    }
  }
  return `ui-style-${base}`.replace(/-{2,}/g, '-').slice(0, 64);
}

function row(cells) {
  return `| ${cells.join(' | ')} |`;
}

function table(header, rows) {
  if (rows.length === 0) return '_Not detected._\n';
  return [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n') + '\n';
}

function weightedRows(entries, limit) {
  return entries.slice(0, limit).map(e => [`\`${e.value}\``, `${e.count}×`]);
}

/**
 * Render the SKILL.md body for a capture.
 * @param {object} capture capture result from extract.js / github.js
 * @param {string} name final skill name
 */
export function renderSkillMarkdown(capture, name) {
  const t = capture.tokens;
  const sourceLabel = capture.kind === 'repository' ? 'GitHub repository' : 'website';
  const lines = [];

  lines.push('---');
  lines.push(`name: ${name}`);
  lines.push(`description: UI design style captured from ${capture.title} (${sourceLabel}: ${capture.sourceUrl}). Contains the color palette, typography, spacing, radii, shadows, breakpoints and motion tokens needed to reproduce this project's visual style.`);
  lines.push(`whenToUse: Use when building or restyling any UI that must visually match ${capture.title} — pages, components, landing sections, dashboards — so new work stays consistent with the captured design system.`);
  lines.push('metadata:');
  lines.push('  kind: ui-style');
  lines.push(`  source: ${JSON.stringify(capture.sourceUrl)}`);
  lines.push(`  sourceKind: ${capture.kind}`);
  lines.push(`  capturedAt: ${capture.capturedAt}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${capture.title} — UI Style Guide`);
  lines.push('');
  lines.push(`Captured from ${sourceLabel} [${capture.sourceUrl}](${capture.sourceUrl}) on ${capture.capturedAt.slice(0, 10)}.`);
  if (capture.description) lines.push(`\n> ${capture.description}`);
  lines.push('');
  lines.push('This skill is a distilled design system. Follow it exactly when the user asks for UI in this style; the goal is that a reviewer cannot tell the new work apart from the original project.');

  lines.push('\n## How to apply this style\n');
  lines.push('1. **Translate tokens first.** Before writing markup, map the tokens below into the target stack — CSS custom properties, a Tailwind `theme.extend` block, or component-library theme overrides. Never hard-code ad-hoc values when a token exists here.');
  lines.push('2. **Respect the measured scales.** Use only the captured spacing, radius, and type sizes. If a needed value is missing, pick the nearest scale step — do not invent intermediates.');
  lines.push('3. **Match color roles, not just colors.** Primary actions, surfaces, borders, and text must use their semantic roles from the palette, in light and dark variants when present.');
  lines.push('4. **Check quality with the `ui-design-craft` skill.** Load it for the professional bar: hierarchy, contrast (WCAG AA), state coverage, and responsive discipline. Resolve conflicts in favor of this captured style.');
  lines.push('5. **Stay honest about coverage.** Tokens here are measured from the source. For anything not covered (illustration style, iconography, imagery), imitate the source project conservatively instead of improvising.');

  if (capture.frameworks?.length || capture.languages?.length) {
    lines.push('\n## Detected stack\n');
    if (capture.frameworks?.length) lines.push(`- UI frameworks: ${capture.frameworks.join(', ')}`);
    if (capture.languages?.length) lines.push(`- App stack: ${capture.languages.join(', ')}`);
    if (capture.fonts?.length) lines.push(`- Web fonts: ${capture.fonts.join(', ')}`);
  }

  lines.push('\n## Color roles\n');
  lines.push(table(['Role', 'Value', 'Basis'], t.colorRoles.map(r => [r.role, `\`${r.value}\``, r.via])));

  lines.push('\n## Color palette (by usage frequency)\n');
  lines.push(table(['Color', 'Usage'], weightedRows(t.colors, 20)));

  if (t.cssVariables.length > 0) {
    lines.push('\n## CSS custom properties\n');
    lines.push('The source defines these design tokens on its root scope — reuse the names when the target stack is CSS-based:\n');
    lines.push('```css');
    lines.push(':root {');
    for (const v of t.cssVariables.slice(0, 60)) lines.push(`  ${v.name}: ${v.value};`);
    lines.push('}');
    lines.push('```');
  }

  lines.push('\n## Typography\n');
  if (t.typography.families.length > 0) {
    lines.push('**Font stacks** (most used first):\n');
    for (const f of t.typography.families.slice(0, 4)) lines.push(`- \`${f.value}\``);
  }
  lines.push('\n**Type scale** (px-normalized, ascending):\n');
  lines.push(table(['Size', 'Usage'], weightedRows(t.typography.sizes, 14)));
  if (t.typography.weights.length > 0) {
    lines.push('\n**Weights**: ' + t.typography.weights.map(w => `\`${w.value}\``).join(', '));
  }
  if (t.typography.lineHeights.length > 0) {
    lines.push('\n\n**Line heights**: ' + t.typography.lineHeights.map(w => `\`${w.value}\``).join(', '));
  }

  lines.push('\n\n## Spacing scale\n');
  lines.push(table(['Value', 'Usage'], weightedRows(t.spacing, 16)));

  lines.push('\n## Corner radii\n');
  lines.push(table(['Value', 'Usage'], weightedRows(t.radii, 10)));

  if (t.shadows.length > 0) {
    lines.push('\n## Shadows\n');
    for (const s of t.shadows.slice(0, 5)) lines.push(`- \`${s.value}\``);
  }

  if (t.breakpoints.length > 0) {
    lines.push('\n## Breakpoints\n');
    lines.push(t.breakpoints.map(b => `\`${b.value}\``).join(' → ') + '\n');
  }

  if (t.motion.durations.length > 0 || t.motion.easings.length > 0) {
    lines.push('\n## Motion\n');
    if (t.motion.durations.length > 0) lines.push(`- Durations: ${t.motion.durations.map(d => `\`${d.value}\``).join(', ')}`);
    if (t.motion.easings.length > 0) lines.push(`- Easings: ${t.motion.easings.map(d => `\`${d.value}\``).join(', ')}`);
  }

  lines.push('\n## Dark mode\n');
  lines.push(t.darkMode
    ? 'The source ships a dark color scheme. Provide both themes and keep token parity between them.'
    : 'No dark scheme was detected. Default to the captured light palette unless the user asks otherwise.');

  lines.push('\n## Consistency rules\n');
  lines.push('- One radius family everywhere: cards, buttons, inputs, and modals pick from the captured radii only.');
  lines.push('- One shadow language: elevation comes from the captured shadows, never from invented glows.');
  lines.push('- Interactive states (hover/active/focus/disabled) derive from the captured primary color — darken/lighten by ~8–12% rather than switching hues.');
  lines.push('- Body text, headings, and captions must land on the captured type scale steps.');
  lines.push('- When in doubt, open the source and copy the pattern verbatim instead of improvising.');

  lines.push('\n## Reference data\n');
  lines.push('Machine-readable tokens live in `references/tokens.json` next to this file. Consult it for exact values; this document is the curated view.\n');

  return lines.join('\n');
}

/** Compact machine-readable token payload for references/tokens.json. */
export function renderTokensJson(capture) {
  return JSON.stringify({
    name: skillNameFor(capture),
    source: capture.sourceUrl,
    kind: capture.kind,
    capturedAt: capture.capturedAt,
    frameworks: capture.frameworks ?? [],
    fonts: capture.fonts ?? [],
    tokens: capture.tokens,
  }, null, 2) + '\n';
}
