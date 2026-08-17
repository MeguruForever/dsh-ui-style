/**
 * CSS parsing and design-token aggregation.
 *
 * Everything here is dependency-free, regex/Scanner-based CSS analysis. The
 * goal is not a full CSS parser; it is a robust token harvester that survives
 * minified, malformed, and preprocessor-generated stylesheets.
 */

/** @typedef {{ value: string, count: number, sources?: Set<string> }} WeightedValue */

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/g;
const HEX_RE = /^#([0-9a-fA-F]{3,8})$/;
const MEDIA_MIN_WIDTH_RE = /@media[^{]*\(\s*min-width\s*:\s*([0-9.]+)(px|em|rem)\s*\)/g;
const FONT_SIZE_RE = /(?:^|[;{}\s])font-size\s*:\s*([^;}]+)/g;
const FONT_FAMILY_RE = /(?:^|[;{}\s])font-family\s*:\s*([^;}]+)/g;
const FONT_WEIGHT_RE = /(?:^|[;{}\s])font-weight\s*:\s*([^;}]+)/g;
const LINE_HEIGHT_RE = /(?:^|[;{}\s])line-height\s*:\s*([^;}]+)/g;
const LETTER_SPACING_RE = /(?:^|[;{}\s])letter-spacing\s*:\s*([^;}]+)/g;
const BORDER_RADIUS_RE = /(?:^|[;{}\s])border-radius\s*:\s*([^;}]+)/g;
const BOX_SHADOW_RE = /(?:^|[;{}\s])box-shadow\s*:\s*([^;}]+)/g;
const SPACING_DECL_RE = /(?:^|[;{}\s])(?:margin|padding|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?\s*:\s*([^;}]+)/g;
const TRANSITION_DURATION_RE = /(?:^|[;{}\s])transition(?:-duration)?\s*:\s*([^;}]+)/g;
const DURATION_RE = /([0-9.]+m?s)\b/g;
const EASING_RE = /(cubic-bezier\([^)]*\)|steps\([^)]*\)|\b(?:ease-in-out|ease-out|ease-in|ease|linear)\b)/g;
const CUSTOM_PROP_RE = /(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)/g;
const ROOT_BLOCK_RE = /(:root|html|:host)(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g;
const DARK_SCHEME_RE = /prefers-color-scheme\s*:\s*dark|\[data-theme[^\]"]*dark|\.dark\b|data-mode=["']?dark/i;
const RULE_RE = /([^{}@]+)\{([^{}]*)\}/g;
const BORDER_WIDTH_RE = /(?:^|[;{}\s])border(?:-top|-right|-bottom|-left)?-width\s*:\s*([^;}]+)/g;
const MAX_WIDTH_RE = /(?:^|[;{}\s])max-width\s*:\s*([0-9.]+(?:px|rem|em|ch))\s*[;}]?/g;

/**
 * Component archetype selectors whose computed look defines a design system's
 * character. Matching is prefix-aware: `button`, `.btn:hover`, `a.nav-link`
 * all land under their archetype.
 */
const COMPONENT_SELECTORS = [
  'button', '.btn', '[type=submit]', '[type=button]',
  'a', 'input', 'select', 'textarea', '.input',
  '.card', 'article', 'dialog', '.modal', '.popover', '.dropdown',
  'nav', 'header', 'footer', 'main', 'aside',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'code', 'pre', 'kbd', 'blockquote', 'hr',
  'table', 'th', 'td',
  'img', '.avatar', '.badge', '.tag', '.chip', '.pill',
  'label', 'legend', 'fieldset', 'small',
];

/** Declarations worth recording on a component blueprint. */
const COMPONENT_PROPS = new Set([
  'background', 'background-color', 'color', 'padding', 'padding-inline',
  'padding-block', 'margin', 'border', 'border-width', 'border-color',
  'border-style', 'border-radius', 'box-shadow', 'font-size', 'font-weight',
  'font-family', 'line-height', 'letter-spacing', 'text-transform',
  'text-decoration', 'transition', 'opacity', 'cursor', 'outline',
]);

const MAX_COMPONENT_ENTRIES = 40;
const MAX_COMPONENT_PROPS = 8;

/** CSS-wide and otherwise useless declaration values. */
const JUNK_VALUES = new Set([
  'inherit', 'initial', 'unset', 'revert', 'revert-layer', 'none', 'normal',
  'auto', '0', '0px', 'currentcolor', 'transparent', 'medium',
]);

/** Create an empty aggregation bucket. */
export function createTokenAggregate() {
  return {
    colors: new Map(), // normalized color -> { value, count, sources:Set }
    cssVariables: new Map(), // --name -> { value, count }
    fontFamilies: new Map(),
    fontSizes: new Map(),
    fontWeights: new Map(),
    lineHeights: new Map(),
    letterSpacings: new Map(),
    radii: new Map(),
    shadows: new Map(),
    spacings: new Map(),
    breakpoints: new Map(),
    durations: new Map(),
    easings: new Map(),
    borderWidths: new Map(),
    containerWidths: new Map(),
    components: new Map(), // selector -> Map(prop -> { value, count })
    darkMode: false,
    stylesheetBytes: 0,
  };
}

function bump(map, raw, normalize) {
  if (typeof raw !== 'string') return;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 240) return;
  const value = normalize ? normalize(trimmed) : trimmed;
  if (!value || JUNK_VALUES.has(value.toLowerCase())) return;
  if (value.startsWith('var(') || value.startsWith('env(')) return;
  const entry = map.get(value);
  if (entry) entry.count += 1;
  else map.set(value, { value, count: 1 });
}

function normalizeColor(raw) {
  const value = raw.trim().toLowerCase();
  // Fully transparent colors are layout artifacts, not palette members.
  const alpha = /^(?:rgba?|hsla?)\(([^)]*)\)$/.exec(value);
  if (alpha) {
    const parts = alpha[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length === 4 && parseFloat(parts[3]) === 0) return '';
  }
  const hex = HEX_RE.exec(value);
  if (hex) {
    let body = hex[1];
    if (body.length === 3 || body.length === 4) {
      body = [...body].map(ch => ch + ch).join('');
    }
    // Drop a fully-opaque alpha channel; skip a fully transparent one.
    if (body.length === 8 && body.endsWith('ff')) body = body.slice(0, 6);
    if (body.length === 8 && body.endsWith('00')) return '';
    return '#' + body;
  }
  // Collapse whitespace inside functional colors for stable dedupe.
  return value.replace(/\s+/g, ' ').replace(/\s*([(),/])\s*/g, '$1');
}

function normalizeLength(raw) {
  const value = raw.trim().toLowerCase();
  if (/^[0-9.]+px$/.test(value)) return String(parseFloat(value)) + 'px';
  return value;
}

function eachMatch(re, text, fn) {
  re.lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) fn(match);
}

/**
 * Fold one CSS text (stylesheet or inline <style> body) into the aggregate.
 * @param {ReturnType<typeof createTokenAggregate>} agg
 * @param {string} css
 * @param {{ sourceLabel?: string }} [options]
 */
export function aggregateCss(agg, css) {
  if (typeof css !== 'string' || css.length === 0) return agg;
  agg.stylesheetBytes += css.length;
  if (DARK_SCHEME_RE.test(css)) agg.darkMode = true;

  // Custom properties from root scopes carry the design-token vocabulary.
  eachMatch(ROOT_BLOCK_RE, css, blockMatch => {
    eachMatch(CUSTOM_PROP_RE, blockMatch[2], propMatch => {
      const name = propMatch[1].toLowerCase();
      const value = propMatch[2].trim();
      if (!value || value.length > 300) return;
      const existing = agg.cssVariables.get(name);
      if (existing) existing.count += 1;
      else agg.cssVariables.set(name, { value, count: 1 });
    });
  });

  eachMatch(COLOR_RE, css, m => bump(agg.colors, m[0], normalizeColor));
  eachMatch(FONT_FAMILY_RE, css, m => bump(agg.fontFamilies, m[1], v => v.replace(/\s+/g, ' ')));
  eachMatch(FONT_SIZE_RE, css, m => {
    for (const part of m[1].split(/\s+/)) bump(agg.fontSizes, part, normalizeLength);
  });
  eachMatch(FONT_WEIGHT_RE, css, m => bump(agg.fontWeights, m[1]));
  eachMatch(LINE_HEIGHT_RE, css, m => bump(agg.lineHeights, m[1], normalizeLength));
  eachMatch(LETTER_SPACING_RE, css, m => bump(agg.letterSpacings, m[1], normalizeLength));
  eachMatch(BORDER_RADIUS_RE, css, m => bump(agg.radii, m[1], normalizeLength));
  eachMatch(BOX_SHADOW_RE, css, m => bump(agg.shadows, m[1], v =>
    v.replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1')));
  eachMatch(SPACING_DECL_RE, css, m => {
    for (const part of m[1].split(/\s+/)) bump(agg.spacings, part, normalizeLength);
  });
  eachMatch(TRANSITION_DURATION_RE, css, m => {
    eachMatch(DURATION_RE, m[1], d => bump(agg.durations, d[1]));
    eachMatch(EASING_RE, m[1], e => bump(agg.easings, e[1]));
  });
  eachMatch(MEDIA_MIN_WIDTH_RE, css, m => {
    const amount = parseFloat(m[1]);
    const px = m[2] === 'px' ? amount : amount * 16;
    bump(agg.breakpoints, String(Math.round(px)) + 'px');
  });
  eachMatch(BORDER_WIDTH_RE, css, m => bump(agg.borderWidths, m[1], normalizeLength));
  eachMatch(MAX_WIDTH_RE, css, m => bump(agg.containerWidths, m[1], normalizeLength));
  aggregateComponentRules(agg, css);
  return agg;
}

/** True when one comma-separated selector belongs to a known archetype. */
function componentBase(selector) {
  const cleaned = selector.trim().replace(/^:(?:root|host)$/, '');
  if (!cleaned || cleaned.length > 60 || cleaned.includes('>') || cleaned.includes('~')) return null;
  for (const base of COMPONENT_SELECTORS) {
    if (cleaned === base) return cleaned;
    if (cleaned.startsWith(base)) {
      const next = cleaned.charAt(base.length);
      // `button.primary` / `.btn:hover` qualify; `buttonx` / `.button` must not
      // match `.btn` — for class bases the next char must continue the class
      // boundary, for element bases any combinator/pseudo continues it.
      if (base.startsWith('.') || base.startsWith('[')) {
        // BEM variants (`.btn-primary`) are distinct looks worth capturing.
        if (next === ':' || next === '[' || next === ' ' || next === '+' || next === '-') return cleaned;
      } else if (next === '' || next === ':' || next === '.' || next === '[' || next === ' ') {
        return cleaned;
      }
    }
  }
  return null;
}

/**
 * Scan qualified rules for component archetypes and record their curated
 * declarations as a component blueprint.
 */
function aggregateComponentRules(agg, css) {
  if (agg.components.size >= MAX_COMPONENT_ENTRIES) return;
  eachMatch(RULE_RE, css, ruleMatch => {
    if (agg.components.size >= MAX_COMPONENT_ENTRIES) return;
    const selectorText = ruleMatch[1];
    if (selectorText.includes('@') || selectorText.length > 200) return;
    const body = ruleMatch[2];
    for (const rawSelector of selectorText.split(',')) {
      const selector = componentBase(rawSelector);
      if (!selector) continue;
      let props = agg.components.get(selector);
      if (!props) {
        props = new Map();
        agg.components.set(selector, props);
      }
      if (props.size >= MAX_COMPONENT_PROPS) continue;
      for (const decl of body.split(';')) {
        if (props.size >= MAX_COMPONENT_PROPS) break;
        const colon = decl.indexOf(':');
        if (colon <= 0) continue;
        const prop = decl.slice(0, colon).trim().toLowerCase();
        const value = decl.slice(colon + 1).trim();
        if (!COMPONENT_PROPS.has(prop) || !value || value.length > 120) continue;
        if (value.startsWith('var(') || JUNK_VALUES.has(value.toLowerCase())) continue;
        const existing = props.get(prop);
        if (existing) existing.count += 1;
        else props.set(prop, { value, count: 1 });
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Color math for role inference                                       */
/* ------------------------------------------------------------------ */

/** Parse a normalized color into { r, g, b } 0-255, or null. */
export function parseColor(value) {
  const hex = HEX_RE.exec(value);
  if (hex) {
    const body = hex[1].length <= 4
      ? [...hex[1]].map(ch => ch + ch).join('')
      : hex[1];
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
    };
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const channel = part => part.endsWith('%')
        ? Math.round((parseFloat(part) / 100) * 255)
        : Math.round(parseFloat(part));
      return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]) };
    }
  }
  const hsl = /^hsla?\(([^)]*)\)$/.exec(value);
  if (hsl) {
    const parts = hsl[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      return hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100);
    }
  }
  return null;
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = t => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(channel(h + 1 / 3) * 255),
    g: Math.round(channel(h) * 255),
    b: Math.round(channel(h - 1 / 3) * 255),
  };
}

/** @returns {{ h: number, s: number, l: number }} h 0-360, s/l 0-1 */
export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/* ------------------------------------------------------------------ */
/* Summarization                                                       */
/* ------------------------------------------------------------------ */

function sortedEntries(map, limit) {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit)
    .map(entry => ({ value: entry.value, count: entry.count }));
}

/** Sort a length scale numerically, converting rem/em to px at base 16. */
function lengthScale(map, limit, maxPx = 400) {
  const toPx = value => {
    const m = /^([0-9.]+)(px|rem|em|ch|%|vh|vw)?$/.exec(value);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (m[2] === 'rem' || m[2] === 'em') return n * 16;
    if (m[2] === 'ch') return n * 8; // 1ch ≈ 0.5em at a 16px base
    if (m[2] === '%' || m[2] === 'vh' || m[2] === 'vw') return null;
    return n;
  };
  return [...map.values()]
    .map(entry => ({ ...entry, px: toPx(entry.value) }))
    .filter(entry => entry.px !== null && entry.px <= maxPx)
    .sort((a, b) => a.px - b.px || b.count - a.count)
    .slice(0, limit)
    .map(({ value, count }) => ({ value, count }));
}

/** Semantic variable-name -> role mapping used by shadcn/Tailwind themes. */
const SEMANTIC_VAR_ROLES = [
  [/^--(?:primary|brand|accent)(?!-)/, 'primary'],
  [/^--secondary(?!-)/, 'secondary'],
  [/^--background(?!-)/, 'background'],
  [/^--foreground(?!-)/, 'text'],
  [/^--card(?!-)/, 'surface'],
  [/^--popover(?!-)/, 'surface'],
  [/^--muted(?!-)/, 'muted'],
  [/^--border(?!-)/, 'border'],
  [/^--input(?!-)/, 'border'],
  [/^--ring(?!-)/, 'focus-ring'],
  [/^--destructive(?!-)|^--danger|^--error/, 'danger'],
  [/^--success/, 'success'],
  [/^--warning|^--warn/, 'warning'],
];

/**
 * Infer semantic color roles. Variable names win; lightness/saturation
 * heuristics cover the rest. Every inferred role is labeled as such.
 * @param {ReturnType<typeof createTokenAggregate>} agg
 */
function inferColorRoles(agg) {
  const roles = [];
  const claimed = new Set();

  for (const [name, entry] of agg.cssVariables) {
    for (const [re, role] of SEMANTIC_VAR_ROLES) {
      if (re.test(name) && !claimed.has(role)) {
        roles.push({ role, value: entry.value, via: `variable ${name}` });
        claimed.add(role);
        break;
      }
    }
  }

  const ranked = [...agg.colors.values()]
    .map(entry => ({ ...entry, rgb: parseColor(entry.value) }))
    .filter(entry => entry.rgb !== null)
    .map(entry => ({ ...entry, hsl: rgbToHsl(entry.rgb) }))
    .sort((a, b) => b.count - a.count);

  if (!claimed.has('background')) {
    const light = ranked.find(c => c.hsl.l > 0.92 && c.hsl.s < 0.35);
    const dark = ranked.find(c => c.hsl.l < 0.13);
    const candidate = light ?? dark;
    if (candidate) {
      roles.push({ role: 'background', value: candidate.value, via: 'inferred (dominant light/dark color)' });
      claimed.add('background');
    }
  }
  if (!claimed.has('text')) {
    const dark = ranked.find(c => c.hsl.l < 0.3 && c.hsl.l > 0.001);
    if (dark) {
      roles.push({ role: 'text', value: dark.value, via: 'inferred (dominant dark color)' });
      claimed.add('text');
    }
  }
  if (!claimed.has('primary')) {
    const brand = ranked.find(c => c.hsl.s > 0.35 && c.hsl.l > 0.2 && c.hsl.l < 0.75);
    if (brand) {
      roles.push({ role: 'primary', value: brand.value, via: 'inferred (most-used saturated color)' });
      claimed.add('primary');
    }
  }
  return roles;
}

/**
 * Reduce an aggregate to a compact, model-facing token summary.
 * @param {ReturnType<typeof createTokenAggregate>} agg
 */
export function summarizeTokens(agg) {
  return {
    colorRoles: inferColorRoles(agg),
    colors: sortedEntries(agg.colors, 24),
    cssVariables: [...agg.cssVariables.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .slice(0, 80)
      .map(([name, entry]) => ({ name, value: entry.value })),
    typography: {
      families: sortedEntries(agg.fontFamilies, 6),
      sizes: lengthScale(agg.fontSizes, 14),
      weights: sortedEntries(agg.fontWeights, 8),
      lineHeights: sortedEntries(agg.lineHeights, 8),
      letterSpacings: sortedEntries(agg.letterSpacings, 6),
    },
    spacing: lengthScale(agg.spacings, 16),
    radii: lengthScale(agg.radii, 10, 10000),
    shadows: sortedEntries(agg.shadows, 6),
    borderWidths: lengthScale(agg.borderWidths, 6, 100),
    containerWidths: lengthScale(agg.containerWidths, 8, 3000),
    components: [...agg.components.entries()]
      .map(([selector, props]) => ({
        selector,
        props: [...props.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .map(([prop, entry]) => ({ prop, value: entry.value })),
      }))
      .filter(c => c.props.length > 0)
      .sort((a, b) => b.props.length - a.props.length || a.selector.localeCompare(b.selector)),
    breakpoints: [...agg.breakpoints.values()]
      .map(e => ({ value: e.value, count: e.count, px: parseInt(e.value, 10) }))
      .sort((a, b) => a.px - b.px)
      .map(({ value, count }) => ({ value, count })),
    motion: {
      durations: sortedEntries(agg.durations, 6),
      easings: sortedEntries(agg.easings, 6),
    },
    darkMode: agg.darkMode,
    stats: { stylesheetBytes: agg.stylesheetBytes },
  };
}
