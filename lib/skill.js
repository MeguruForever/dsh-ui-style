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

/* ------------------------------------------------------------------ */
/* Design-language derivation: turn measured tokens into a design      */
/* philosophy the model can reason about, not just copy.               */
/* ------------------------------------------------------------------ */

function toPx(value) {
  const m = /^([0-9.]+)(px|rem|em|ch)?$/.exec(value);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (m[2] === 'rem' || m[2] === 'em') return n * 16;
  if (m[2] === 'ch') return n * 8;
  return n;
}

/** Usage-weighted median of a length scale, in px. */
function weightedMedianPx(entries) {
  const points = entries
    .map(e => ({ px: toPx(e.value), count: e.count }))
    .filter(e => e.px !== null)
    .sort((a, b) => a.px - b.px);
  const total = points.reduce((sum, e) => sum + e.count, 0);
  if (total === 0) return null;
  let acc = 0;
  for (const point of points) {
    acc += point.count;
    if (acc >= total / 2) return point.px;
  }
  return points[points.length - 1].px;
}

const HUE_NAMES = [
  [15, 'red'], [45, 'orange'], [70, 'yellow'], [155, 'green'], [185, 'teal'],
  [215, 'cyan'], [255, 'blue'], [285, 'indigo'], [320, 'violet'], [345, 'pink'], [361, 'red'],
];

function hueName(h) {
  for (const [limit, name] of HUE_NAMES) if (h < limit) return name;
  return 'gray';
}

/**
 * Derive the design philosophy of a capture: the adjectives a designer would
 * use to describe the system, each with its measured evidence.
 * @param {object} tokens summarized tokens
 * @returns {{ traits: { trait: string, value: string, evidence: string }[], summary: string }}
 */
export function deriveDesignLanguage(tokens) {
  const traits = [];

  const radiusMedian = weightedMedianPx(tokens.radii ?? []);
  const hasPill = (tokens.radii ?? []).some(r => toPx(r.value) !== null && toPx(r.value) >= 999);
  let corners;
  if (radiusMedian === null) corners = null;
  else if (radiusMedian <= 2) corners = 'sharp / geometric';
  else if (radiusMedian <= 6) corners = 'subtly rounded';
  else if (radiusMedian <= 14) corners = 'rounded';
  else corners = 'very rounded';
  if (corners) {
    traits.push({
      trait: 'Corners',
      value: corners + (hasPill ? ' (with pill-shaped elements)' : ''),
      evidence: `median radius ≈ ${Math.round(radiusMedian * 10) / 10}px from ${(tokens.radii ?? []).length} measured values`,
    });
  }

  const shadowCount = (tokens.shadows ?? []).length;
  let elevation;
  if (shadowCount === 0) elevation = 'flat — no shadows, separation through color and borders';
  else {
    const dramatic = (tokens.shadows ?? []).some(s =>
      [...s.value.matchAll(/([0-9.]+)px/g)].some(m => parseFloat(m[1]) >= 24));
    elevation = dramatic ? 'expressive — deep, soft shadows carry the hierarchy' : 'restrained — one subtle shadow family';
  }
  traits.push({ trait: 'Elevation', value: elevation, evidence: `${shadowCount} distinct shadow value(s)` });

  const spacingMedian = weightedMedianPx(tokens.spacing ?? []);
  if (spacingMedian !== null) {
    const density = spacingMedian < 6 ? 'compact / data-dense' : spacingMedian <= 12 ? 'comfortable' : 'spacious / airy';
    traits.push({ trait: 'Density', value: density, evidence: `median spacing ≈ ${Math.round(spacingMedian)}px` });
  }

  const primaryRole = (tokens.colorRoles ?? []).find(r => r.role === 'primary');
  const bgRole = (tokens.colorRoles ?? []).find(r => r.role === 'background');
  if (primaryRole) {
    traits.push({
      trait: 'Palette mood',
      value: `neutral surfaces with a single ${hueNameFromColor(primaryRole.value)} action color`,
      evidence: `primary ${primaryRole.value} (${primaryRole.via}); background ${bgRole?.value ?? 'n/a'}`,
    });
  }

  const families = (tokens.typography?.families ?? []).map(f => f.value);
  // Monospace stacks (code samples) must not pose as the system's voice.
  const textFamilies = families.filter(f => !/\bmono\b|menlo|consolas|monaco|courier|jetbrains|fira code|source code/i.test(f));
  const voice = textFamilies[0] ?? families[0];
  if (voice) {
    const first = voice.split(',')[0].trim().replace(/["']/g, '');
    const system = /^(system-ui|-apple-system|BlinkMacSystemFont|Segoe UI|Roboto|Helvetica Neue|Helvetica|Arial|sans-serif|serif)$/i.test(first);
    traits.push({
      trait: 'Type voice',
      value: system ? 'system font stack — native, quiet' : `custom typeface (${first}) — branded`,
      evidence: voice,
    });
  }
  const sizes = (tokens.typography?.sizes ?? []).map(s => toPx(s.value)).filter(n => n !== null).sort((a, b) => a - b);
  if (sizes.length >= 3) {
    const body = sizes.includes(16) ? 16 : sizes[Math.floor(sizes.length / 2)];
    const ratio = sizes[sizes.length - 1] / body;
    const contrast = ratio < 1.6 ? 'low contrast between heading and body sizes' : ratio < 2.4 ? 'moderate type-scale contrast' : 'dramatic type-scale contrast';
    traits.push({ trait: 'Type scale', value: contrast, evidence: `${Math.round(sizes[0])}px → ${Math.round(sizes[sizes.length - 1])}px (×${ratio.toFixed(2)})` });
  }

  // Most-frequent *plausible* UI border width is the honest signal — chunky
  // one-off accent rules (blockquote bars etc.) are filtered out first.
  const borderTop = [...(tokens.borderWidths ?? [])]
    .filter(b => { const px = toPx(b.value); return px !== null && px <= 4; })
    .sort((a, b) => b.count - a.count)[0];
  if (borderTop) {
    const px = toPx(borderTop.value);
    traits.push({
      trait: 'Borders',
      value: px !== null && px <= 1 ? 'hairline 1px borders' : `${borderTop.value} visible borders`,
      evidence: `most-used border width ${borderTop.value} (${borderTop.count}×)`,
    });
  }

  const durationMedian = (() => {
    const entries = (tokens.motion?.durations ?? []).map(d => {
      const ms = d.value.endsWith('ms') ? parseFloat(d.value) : parseFloat(d.value) * 1000;
      return { value: d.value, count: d.count, ms };
    // Sub-20ms durations are prefers-reduced-motion resets, not design.
    }).filter(d => !Number.isNaN(d.ms) && d.ms >= 20).sort((a, b) => a.ms - b.ms);
    const total = entries.reduce((s, e) => s + e.count, 0);
    if (total === 0) return null;
    let acc = 0;
    for (const e of entries) { acc += e.count; if (acc >= total / 2) return e.ms; }
    return entries[entries.length - 1].ms;
  })();
  if (durationMedian !== null) {
    const motion = durationMedian < 100 ? 'instant / utilitarian' : durationMedian <= 250 ? 'brisk (snappy micro-interactions)' : 'smooth / deliberate';
    traits.push({ trait: 'Motion', value: motion, evidence: `median duration ≈ ${Math.round(durationMedian)}ms` });
  }

  traits.push({
    trait: 'Dark mode',
    value: tokens.darkMode ? 'ships a dark color scheme — keep token parity' : 'light scheme only',
    evidence: tokens.darkMode ? 'dark scheme detected in stylesheets' : 'no dark scheme detected',
  });

  const sentence = traits
    .filter(t => ['Corners', 'Density', 'Palette mood', 'Elevation'].includes(t.trait))
    .map(t => t.value)
    .join('; ');
  const summary = sentence
    ? `A ${sentence} design language. New UI must read as if the original team designed it: same restraint, same proportions, same hierarchy.`
    : 'Follow the measured tokens below; the design language is defined by them rather than by adjectives.';

  return { traits, summary };
}

function hueNameFromColor(value) {
  // Lightweight import-free hue naming for hex/rgb colors.
  const hex = /^#([0-9a-f]{6})/i.exec(value.trim());
  if (!hex) return 'signature';
  const r = parseInt(hex[1].slice(0, 2), 16) / 255;
  const g = parseInt(hex[1].slice(2, 4), 16) / 255;
  const b = parseInt(hex[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  if (max === min) return 'neutral';
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return hueName(h);
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

  const designLanguage = deriveDesignLanguage(t);
  lines.push('\n## Design language\n');
  lines.push(designLanguage.summary + '\n');
  lines.push(table(['Trait', 'Character', 'Measured evidence'],
    designLanguage.traits.map(tr => [tr.trait, tr.value, tr.evidence])));
  lines.push('\nThese traits are the design intent. When a decision is not covered by an exact token, decide in the direction of these traits — never against them.');

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

  if ((t.components ?? []).length > 0) {
    lines.push('\n## Component blueprints\n');
    lines.push('Measured declarations of the source\'s component archetypes — reproduce these shapes verbatim before styling anything new:\n');
    for (const component of t.components.slice(0, 18)) {
      const decls = component.props.map(p => `${p.prop}: ${p.value}`).join('; ');
      lines.push(`- **\`${component.selector}\`** — ${decls}`);
    }
  }

  if ((t.containerWidths ?? []).length > 0) {
    lines.push('\n## Layout containers\n');
    lines.push('Content max-widths in use: ' + t.containerWidths.map(c => `\`${c.value}\``).join(', ') + '. Keep page measure inside these — do not stretch content full-bleed unless the source does.\n');
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
    designLanguage: deriveDesignLanguage(capture.tokens),
    tokens: capture.tokens,
  }, null, 2) + '\n';
}
