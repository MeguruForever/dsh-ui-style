window.__ModuleLoader__.load({ id: "dsh-ui-style", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict'

/**
 * dsh-ui-style — browser half.
 *
 * - Settings page (settings.section): capture styles from URLs/repos, preview
 *   captured themes live, manage the style library, pin a current style.
 * - Composer integration: an `@` trigger source listing captured styles, a
 *   launcher button in conversation.input.right that opens the picker menu,
 *   and a conversation.input.dock chip pinning the current style for one
 *   click invocation.
 *
 * All heavy lifting lives in the host plugin behind /dsh-ui-style/* routes;
 * this file is pure UI and composer glue.
 */

const React = require('react')
const h = React.createElement
const { useCallback, useEffect, useMemo, useRef, useState } = React
const NS = 'dsh-ui-style'

const zh = {
  tab: 'UI 风格',
  title: 'UI 风格捕获',
  subtitle: '从任意网站或 GitHub 项目提取 UI 设计风格,沉淀为可复用的 Skill,让每一次 UI 开发保持一致的设计语言。',
  inputPlaceholder: '输入网址或 GitHub 项目地址,如 https://linear.app 或 https://github.com/shadcn-ui/ui',
  capture: '提取风格',
  capturing: '正在提取…',
  captureHint: '提取会抓取页面样式表或仓库中的主题/样式文件,解析颜色、字体、间距、圆角、阴影、断点、组件蓝图等设计令牌,并总结设计思路,生成 SKILL.md 保存到插件目录。',
  saved: '已保存的风格',
  builtin: '内置',
  current: '当前',
  setCurrent: '设为当前风格',
  empty: '还没有保存的风格。输入一个链接,开始建立你的 UI 风格库。',
  loading: '正在加载风格库…',
  loadFailed: '风格库加载失败,请点击重试。',
  retry: '重试',
  view: '查看 Skill',
  hide: '收起',
  preview: '预览主题',
  remove: '删除',
  removing: '删除中…',
  confirmRemove: '确认删除这个风格 Skill?该操作不可恢复。',
  source: '来源',
  capturedAt: '提取时间',
  usage: '使用方式',
  usageDetail: '会话中说"使用 <name> 风格开发 UI",或在输入框输入 @ 选择风格、输入 / 后接风格名调用。设为当前风格后,输入框上方会出现快捷胶囊。',
  success: '风格提取完成',
  counts: { colors: '颜色', cssVariables: 'CSS 变量', typeSizes: '字号', spacings: '间距', radii: '圆角', shadows: '阴影', components: '组件蓝图' },
  skillFile: 'SKILL.md 内容',
  error: '提取失败',
  rateLimited: 'GitHub API 达到速率限制,可为主机配置 GITHUB_TOKEN 后重试。',
  launcher: '选择 UI 风格',
  dockUse: '点击以当前风格调用',
  dockClear: '取消固定',
  darkNote: '源站包含暗色方案',
}

const en = {
  tab: 'UI Styles',
  title: 'UI Style Capture',
  subtitle: 'Distill the UI design style of any website or GitHub project into a reusable skill, and keep every future UI build visually consistent.',
  inputPlaceholder: 'Paste a page or GitHub repo URL, e.g. https://linear.app or https://github.com/shadcn-ui/ui',
  capture: 'Capture style',
  capturing: 'Capturing…',
  captureHint: 'A capture fetches the page stylesheets or the repo theme/style files, parses colors, type, spacing, radii, shadows, breakpoints and component blueprints into design tokens, summarizes the design language, then writes a SKILL.md into the plugin directory.',
  saved: 'Saved styles',
  builtin: 'Built-in',
  current: 'Current',
  setCurrent: 'Set as current',
  empty: 'No saved styles yet. Paste a link above to start your UI style library.',
  loading: 'Loading the style library…',
  loadFailed: 'The style library could not be loaded. Try again.',
  retry: 'Retry',
  view: 'View skill',
  hide: 'Hide',
  preview: 'Preview theme',
  remove: 'Delete',
  removing: 'Deleting…',
  confirmRemove: 'Delete this style skill? This cannot be undone.',
  source: 'Source',
  capturedAt: 'Captured',
  usage: 'How to use',
  usageDetail: 'Say "build UI in the <name> style", or type @ in the composer to pick a style, or /<name> directly. Pin a current style to get a one-click chip above the composer.',
  success: 'Style captured',
  counts: { colors: 'colors', cssVariables: 'CSS variables', typeSizes: 'type sizes', spacings: 'spacings', radii: 'radii', shadows: 'shadows', components: 'blueprints' },
  skillFile: 'SKILL.md content',
  error: 'Capture failed',
  rateLimited: 'GitHub API rate limit reached. Configure GITHUB_TOKEN on the host and retry.',
  launcher: 'Pick a UI style',
  dockUse: 'Click to invoke with the current style',
  dockClear: 'Unpin',
  darkNote: 'Source ships a dark scheme',
}

const CSS = `
.dus-root{color:var(--dsw-alias-label-primary,#202124);container-type:inline-size;display:flex;flex-direction:column;gap:16px;min-width:0}
.dus-head h3{font-size:20px;line-height:1.25;margin:0 0 4px}
.dus-head p{color:var(--dsw-alias-label-secondary,#667085);font-size:13px;line-height:1.55;margin:0;max-width:72ch}
.dus-capture{display:flex;flex-direction:column;gap:10px}
.dus-form{display:flex;gap:8px}
.dus-input{background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-normal,#d0d5dd);border-radius:10px;color:inherit;flex:1;font:inherit;font-size:13px;min-height:42px;min-width:0;padding:0 13px}
.dus-input:focus{border-color:var(--dsw-alias-brand-primary,#4f46e5);outline:2px solid var(--dsw-alias-brand-secondary,#eef2ff)}
.dus-action{appearance:none;background:var(--dsw-alias-brand-primary,#4f46e5);border:1px solid transparent;border-radius:10px;color:var(--dsw-alias-button-primary-foreground,#fff);cursor:pointer;font:inherit;font-size:13px;font-weight:650;min-height:42px;padding:0 16px;white-space:nowrap}
.dus-action:disabled{cursor:not-allowed;opacity:.55}
.dus-hint{color:var(--dsw-alias-label-tertiary,#7c8594);font-size:12px;line-height:1.55;margin:0}
.dus-error{background:var(--dsw-alias-state-danger-secondary,#fff0f0);border:1px solid var(--dsw-alias-state-danger-border,#eaa);border-radius:10px;color:var(--dsw-alias-state-danger-primary,#a12626);font-size:13px;line-height:1.5;padding:10px 12px;white-space:pre-wrap;word-break:break-word}
.dus-success{background:var(--dsw-alias-state-success-secondary,#ecfdf3);border:1px solid var(--dsw-alias-state-success-border,#abefc6);border-radius:10px;color:var(--dsw-alias-state-success-primary,#067647);font-size:13px;line-height:1.6;padding:10px 12px}
.dus-success code{background:rgba(0,0,0,.06);border-radius:5px;padding:1px 5px}
.dus-grid{display:flex;flex-direction:column;gap:10px}
.dus-card{background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-subtle,#e4e7ec);border-radius:12px;display:flex;flex-direction:column;gap:10px;min-width:0;padding:14px}
.dus-card[data-current=true]{border-color:var(--dsw-alias-brand-primary,#4f46e5);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#4f46e5)}
.dus-card-head{align-items:flex-start;display:flex;gap:10px}
.dus-name{font-size:14px;font-weight:700;line-height:1.35;overflow-wrap:anywhere}
.dus-sub{color:var(--dsw-alias-label-tertiary,#7c8594);font-size:12px;line-height:1.5;margin-top:2px}
.dus-sub a{color:var(--dsw-alias-brand-primary,#4338ca);text-decoration:none;word-break:break-all}
.dus-sub a:hover{text-decoration:underline}
.dus-badge{background:var(--dsw-alias-brand-secondary,#eef2ff);border-radius:999px;color:var(--dsw-alias-brand-primary,#4338ca);flex:0 0 auto;font-size:11px;font-weight:650;padding:3px 8px}
.dus-badge[data-kind=current]{background:var(--dsw-alias-brand-primary,#4f46e5);color:var(--dsw-alias-button-primary-foreground,#fff)}
.dus-swatches{display:flex;gap:6px}
.dus-swatch{border:1px solid var(--dsw-alias-border-subtle,#e4e7ec);border-radius:6px;display:inline-block;height:20px;width:20px}
.dus-chips{display:flex;flex-wrap:wrap;gap:6px}
.dus-chip{background:var(--dsw-alias-bg-layer-2,#f2f4f7);border-radius:999px;color:var(--dsw-alias-label-secondary,#667085);font-size:11px;padding:4px 8px}
.dus-card-foot{align-items:center;display:flex;flex-wrap:wrap;gap:8px}
.dus-grow{flex:1}
.dus-btn{appearance:none;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-normal,#d0d5dd);border-radius:9px;color:inherit;cursor:pointer;font:inherit;font-size:12px;min-height:34px;padding:5px 11px}
.dus-btn[data-kind=primary]{background:var(--dsw-alias-brand-primary,#4f46e5);border-color:transparent;color:var(--dsw-alias-button-primary-foreground,#fff);font-weight:650}
.dus-btn[data-kind=remove]{border-color:var(--dsw-alias-state-danger-border,#dc6b6b);color:var(--dsw-alias-state-danger-primary,#b42318)}
.dus-btn:disabled{cursor:not-allowed;opacity:.55}
.dus-usage{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-radius:9px;color:var(--dsw-alias-label-secondary,#586174);font-size:12px;line-height:1.6;padding:9px 11px}
.dus-usage code{background:rgba(0,0,0,.06);border-radius:5px;padding:1px 5px;word-break:break-all}
.dus-skillview{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-radius:9px;font-family:var(--dsw-mono-font,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:1.55;margin:0;max-height:420px;overflow:auto;padding:11px;white-space:pre-wrap;word-break:break-word}
.dus-state{align-items:center;color:var(--dsw-alias-label-secondary,#667085);display:flex;font-size:13px;gap:8px;justify-content:center;min-height:120px;text-align:center}
.dus-spin{animation:dus-spin .8s linear infinite;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;height:15px;width:15px}@keyframes dus-spin{to{transform:rotate(360deg)}}
.dus-section-label{color:var(--dsw-alias-label-tertiary,#7c8594);font-size:12px;font-weight:650;letter-spacing:.04em;margin:2px 0 0;text-transform:uppercase}
.dus-preview{border-radius:12px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);overflow:hidden}
.dus-preview-frame{display:flex;flex-direction:column;min-width:0}
.dus-preview-topbar{align-items:center;display:flex;gap:8px;padding:10px 14px}
.dus-preview-dot{border-radius:50%;display:inline-block;height:10px;width:10px}
.dus-preview-nav{border-radius:4px;display:inline-block;height:8px;opacity:.45}
.dus-preview-body{display:flex;flex-direction:column}
.dus-preview-card{display:flex;flex-direction:column}
.dus-preview-note{font-size:11px;opacity:.6;padding:0 0 10px;text-align:center}
@media(max-width:560px){.dus-form{flex-direction:column}.dus-action{width:100%}}
.dus-launch{align-items:center;background:transparent;border:1px solid transparent;border-radius:8px;color:inherit;cursor:pointer;display:flex;font:inherit;font-size:12px;gap:5px;min-height:30px;opacity:.75;padding:3px 9px}
.dus-launch:hover{background:var(--dsw-alias-bg-layer-2,#f2f4f7);opacity:1}
.dus-launch:disabled{cursor:not-allowed;opacity:.35}
.dus-dock{align-items:center;background:var(--dsw-alias-brand-secondary,#eef2ff);border:1px solid var(--dsw-alias-brand-primary,#4f46e5);border-radius:999px;color:var(--dsw-alias-brand-primary,#4338ca);cursor:pointer;display:inline-flex;font-size:12px;font-weight:650;gap:6px;min-height:28px;padding:3px 6px 3px 11px;width:max-content}
.dus-dock:hover{filter:brightness(.97)}
.dus-dock-clear{align-items:center;background:transparent;border:none;border-radius:50%;color:inherit;cursor:pointer;display:inline-flex;font-size:12px;height:18px;justify-content:center;line-height:1;opacity:.6;padding:0;width:18px}
.dus-dock-clear:hover{opacity:1}
.dus-dock-swatches{display:inline-flex;gap:2px}
.dus-dock-swatch{border-radius:50%;display:inline-block;height:8px;width:8px}
`

function injectStyles() {
  if (document.getElementById('dsh-ui-style-style')) return
  const style = document.createElement('style')
  style.id = 'dsh-ui-style-style'
  style.textContent = CSS
  document.head.appendChild(style)
}

async function api(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options })
  let body = null
  try { body = await response.json() } catch { /* non-JSON */ }
  if (!response.ok) {
    const error = new Error(body && body.error ? body.error : 'HTTP ' + response.status)
    error.code = body && body.code
    throw error
  }
  return body
}

function useCopy(locale) {
  const snapshot = React.useSyncExternalStore(
    listener => locale.subscribe(listener),
    () => locale.getSnapshot(),
  )
  const lang = String(snapshot.active).toLowerCase().startsWith('zh') ? 'zh' : 'en'
  return lang === 'zh' ? zh : en
}

function Swatches({ colors }) {
  if (!colors || colors.length === 0) return null
  return h('div', { className: 'dus-swatches', title: colors.join(' ') },
    colors.map(color => h('span', { key: color, className: 'dus-swatch', style: { background: color } })))
}

/* ------------------------------------------------------------------ */
/* Theme preview: a mock application rendered with the captured tokens  */
/* ------------------------------------------------------------------ */

function pxOf(value) {
  const m = /^([0-9.]+)(px|rem|em)?$/.exec(String(value || ''))
  if (!m) return null
  const n = parseFloat(m[1])
  return (m[2] === 'rem' || m[2] === 'em') ? n * 16 : n
}

/** Relative luminance → readable foreground for a colored surface. */
function contrastText(color) {
  const hex = /^#([0-9a-f]{6})/i.exec(String(color || '').trim())
  if (!hex) return '#ffffff'
  const r = parseInt(hex[1].slice(0, 2), 16) / 255
  const g = parseInt(hex[1].slice(2, 4), 16) / 255
  const b = parseInt(hex[1].slice(4, 6), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.55 ? '#1a1a1a' : '#ffffff'
}

function derivePreview(tokens) {
  const t = tokens || {}
  const roles = {}
  for (const r of t.colorRoles || []) if (!roles[r.role]) roles[r.role] = r.value
  const bg = roles.background || '#ffffff'
  const text = roles.text || roles.foreground || '#1f2329'
  const primary = roles.primary || '#4f46e5'
  const surface = roles.surface || bg
  const border = roles.border || 'rgba(0,0,0,.12)'
  const family = (t.typography && t.typography.families[0] && t.typography.families[0].value) || 'system-ui, -apple-system, sans-serif'
  const sizes = (t.typography ? t.typography.sizes : [] || []).map(s => pxOf(s.value)).filter(n => n !== null && n > 0).sort((a, b) => a - b)
  const body = sizes.length ? sizes.reduce((best, n) => Math.abs(n - 15) < Math.abs(best - 15) ? n : best, sizes[0]) : 15
  const heading = sizes.filter(n => n >= body * 1.5).pop() || Math.round(body * 1.8)
  const caption = sizes.find(n => n >= 11 && n < body) || Math.max(11, Math.round(body * 0.8))
  const radii = (t.radii || []).map(r => r.value).filter(v => pxOf(v) !== null)
  const radius = radii.length ? radii[Math.floor(radii.length / 2)] : '8px'
  const shadow = (t.shadows && t.shadows[0] && t.shadows[0].value) || 'none'
  const spacings = (t.spacing || []).map(s => s.value).filter(v => pxOf(v) !== null)
  const gap = spacings.length ? spacings[Math.floor(spacings.length / 2)] : '16px'
  const weight = (t.typography && t.typography.weights[0] && t.typography.weights[0].value) || '400'
  return { bg, text, primary, surface, border, family, body, heading, caption, radius, shadow, gap, weight, dark: !!t.darkMode }
}

function ThemePreview({ tokens, copy }) {
  const p = useMemo(() => derivePreview(tokens), [tokens])
  const onPrimary = contrastText(p.primary)
  const hairline = '1px solid ' + p.border
  return h('div', { className: 'dus-preview', style: { background: p.bg, color: p.text, fontFamily: p.family } },
    h('div', { className: 'dus-preview-frame' },
      h('div', { className: 'dus-preview-topbar', style: { borderBottom: hairline, background: p.surface } },
        h('span', { className: 'dus-preview-dot', style: { background: p.primary } }),
        [36, 28, 30].map((w, i) => h('span', {
          key: i, className: 'dus-preview-nav',
          style: { width: w + 'px', background: p.text },
        }))),
      h('div', { className: 'dus-preview-body', style: { padding: p.gap, gap: p.gap } },
        h('div', { style: { fontSize: Math.min(p.heading, 26) + 'px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' } },
          'The quick brown fox jumps'),
        h('p', { style: { fontSize: Math.min(p.body, 15) + 'px', fontWeight: /^\d+$/.test(p.weight) ? p.weight : 400, lineHeight: 1.6, margin: 0, opacity: .8 } },
          'Body copy rendered with the captured type scale, color roles and spacing rhythm of the source design system.'),
        h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
          h('span', { style: { background: p.primary, color: onPrimary, borderRadius: p.radius, padding: '7px 16px', fontSize: Math.min(p.body, 14) + 'px', fontWeight: 650, boxShadow: p.shadow === 'none' ? 'none' : 'none', display: 'inline-block' } }, 'Primary action'),
          h('span', { style: { border: hairline, color: p.text, borderRadius: p.radius, padding: '7px 16px', fontSize: Math.min(p.body, 14) + 'px', display: 'inline-block' } }, 'Secondary')),
        h('div', { className: 'dus-preview-card', style: { background: p.surface, border: hairline, borderRadius: p.radius, boxShadow: p.shadow, padding: p.gap, gap: '10px' } },
          h('span', { style: { alignSelf: 'flex-start', background: p.primary, color: onPrimary, borderRadius: p.radius, fontSize: Math.min(p.caption, 12) + 'px', fontWeight: 650, padding: '2px 9px' } }, 'Badge'),
          h('div', { style: { fontSize: Math.min(p.body, 14) + 'px', fontWeight: 650 } }, 'Card title'),
          h('div', { style: { fontSize: Math.min(p.caption, 12) + 'px', lineHeight: 1.55, opacity: .7 } },
            'Cards carry the captured radius, border, elevation and surface color.'),
          h('div', { style: { border: hairline, borderRadius: p.radius, color: p.text, fontSize: Math.min(p.body, 13) + 'px', opacity: .55, padding: '7px 11px' } }, 'Input field')),
        h('div', { style: { fontSize: Math.min(p.caption, 12) + 'px', opacity: .6 } }, 'Caption · helper text · metadata'))),
    p.dark && h('div', { className: 'dus-preview-note', style: { background: p.bg, color: p.text } }, copy.darkNote))
}

/* ------------------------------------------------------------------ */
/* Settings page                                                        */
/* ------------------------------------------------------------------ */

function StyleCard({ style, copy, selection, onSelect, onRemoved }) {
  const [panel, setPanel] = useState(null) // null | 'skill' | 'preview'
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const isCurrent = selection === style.name

  const ensureDetail = useCallback(async () => {
    if (detail) return true
    setBusy(true)
    setError(null)
    try {
      setDetail(await api('/dsh-ui-style/styles/' + encodeURIComponent(style.name)))
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }, [detail, style.name])

  const toggle = useCallback(async kind => {
    if (panel === kind) { setPanel(null); return }
    if (await ensureDetail()) setPanel(kind)
  }, [panel, ensureDetail])

  const remove = useCallback(async () => {
    if (!window.confirm(copy.confirmRemove)) return
    setBusy(true)
    setError(null)
    try {
      await api('/dsh-ui-style/styles/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: style.name }),
      })
      onRemoved(style.name)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }, [copy.confirmRemove, style.name, onRemoved])

  const pin = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await api('/dsh-ui-style/selection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: isCurrent ? null : style.name }),
      })
      onSelect(isCurrent ? null : style.name)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [isCurrent, style.name, onSelect])

  const usage = copy.usageDetail.replace('<name>', style.name)

  return h('div', { className: 'dus-card', 'data-current': isCurrent || undefined },
    h('div', { className: 'dus-card-head' },
      h('div', { style: { minWidth: 0, flex: 1 } },
        h('div', { className: 'dus-name' }, style.title || style.name),
        h('div', { className: 'dus-sub' },
          style.sourceUrl
            ? h('a', { href: style.sourceUrl, target: '_blank', rel: 'noreferrer' }, style.sourceUrl)
            : style.name,
          style.capturedAt ? ' · ' + copy.capturedAt + ' ' + style.capturedAt.slice(0, 10) : '')),
      isCurrent && h('span', { className: 'dus-badge', 'data-kind': 'current' }, copy.current),
      style.builtin && h('span', { className: 'dus-badge' }, copy.builtin)),
    h(Swatches, { colors: style.topColors }),
    style.frameworks && style.frameworks.length > 0 && h('div', { className: 'dus-chips' },
      style.frameworks.map(f => h('span', { key: f, className: 'dus-chip' }, f))),
    h('div', { className: 'dus-usage' },
      h('strong', null, copy.usage + ': '),
      h('code', null, style.name),
      ' — ' + usage),
    error && h('div', { className: 'dus-error' }, error),
    panel === 'skill' && detail && h('div', null,
      h('div', { className: 'dus-section-label' }, copy.skillFile),
      h('pre', { className: 'dus-skillview' }, detail.skill)),
    panel === 'preview' && detail && h(ThemePreview, { tokens: detail.tokens && detail.tokens.tokens, copy }),
    busy && panel === null && h('div', { className: 'dus-state' }, h('span', { className: 'dus-spin' })),
    h('div', { className: 'dus-card-foot' },
      !style.builtin && h('button', {
        className: 'dus-btn', 'data-kind': isCurrent ? undefined : 'primary', type: 'button', onClick: pin, disabled: busy,
      }, isCurrent ? copy.current + ' ✓' : copy.setCurrent),
      h('span', { className: 'dus-grow' }),
      !style.builtin && h('button', {
        className: 'dus-btn', type: 'button', onClick: () => toggle('preview'), disabled: busy,
      }, panel === 'preview' ? copy.hide : copy.preview),
      h('button', { className: 'dus-btn', type: 'button', onClick: () => toggle('skill'), disabled: busy },
        panel === 'skill' ? copy.hide : copy.view),
      !style.builtin && h('button', {
        className: 'dus-btn', 'data-kind': 'remove', type: 'button', onClick: remove, disabled: busy,
      }, copy.remove)))
}

function StylePage({ locale }) {
  const copy = useCopy(locale)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [list, setList] = useState(null)
  const [selection, setSelection] = useState(null)
  const [listError, setListError] = useState(null)
  const abortRef = useRef(null)

  const load = useCallback(async () => {
    setListError(null)
    try {
      const data = await api('/dsh-ui-style/styles')
      setList(data.styles)
      setSelection(data.selection ?? null)
    } catch (err) {
      setListError(err.message)
    }
  }, [])

  useEffect(() => {
    injectStyles()
    load()
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [load])

  const capture = useCallback(async () => {
    const trimmed = url.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 120000)
    try {
      const result = await api('/dsh-ui-style/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
        signal: controller.signal,
      })
      const counts = Object.entries(result.counts || {})
        .filter(([, n]) => n > 0)
        .map(([key, n]) => (copy.counts[key] || key) + ' ' + n)
        .join(' · ')
      setNotice({ name: result.name, counts })
      setUrl('')
      await load()
    } catch (err) {
      setError(err.code === 'RATE_LIMITED' ? copy.rateLimited : (err.name === 'AbortError' ? 'Timeout (120s)' : err.message))
    } finally {
      clearTimeout(timeout)
      abortRef.current = null
      setBusy(false)
    }
  }, [url, busy, copy, load])

  const onRemoved = useCallback(name => {
    setList(current => (current || []).filter(item => item.name !== name))
    setSelection(current => current === name ? null : current)
  }, [])

  const onKeyDown = useCallback(event => {
    if (event.key === 'Enter') capture()
  }, [capture])

  return h('div', { className: 'dus-root' },
    h('div', { className: 'dus-head' },
      h('h3', null, copy.title),
      h('p', null, copy.subtitle)),
    h('div', { className: 'dus-capture' },
      h('div', { className: 'dus-form' },
        h('input', {
          className: 'dus-input',
          type: 'url',
          value: url,
          placeholder: copy.inputPlaceholder,
          onChange: event => setUrl(event.target.value),
          onKeyDown,
          disabled: busy,
          spellCheck: false,
        }),
        h('button', { className: 'dus-action', type: 'button', onClick: capture, disabled: busy || !url.trim() },
          busy ? copy.capturing : copy.capture)),
      h('p', { className: 'dus-hint' }, copy.captureHint)),
    error && h('div', { className: 'dus-error' }, copy.error + ': ' + error),
    notice && h('div', { className: 'dus-success' },
      copy.success + ': ', h('code', null, notice.name),
      notice.counts ? ' — ' + notice.counts : ''),
    h('div', { className: 'dus-section-label' }, copy.saved),
    list === null && !listError && h('div', { className: 'dus-state' }, h('span', { className: 'dus-spin' }), copy.loading),
    listError && h('div', { className: 'dus-state' },
      copy.loadFailed + ' ',
      h('button', { className: 'dus-btn', type: 'button', onClick: load }, copy.retry)),
    list && list.length === 0 && h('div', { className: 'dus-state' }, copy.empty),
    list && list.length > 0 && h('div', { className: 'dus-grid' },
      list.map(style => h(StyleCard, {
        key: style.name, style, copy, selection, onSelect: setSelection, onRemoved,
      }))))
}

/* ------------------------------------------------------------------ */
/* Composer integration                                                 */
/* ------------------------------------------------------------------ */

/** Shared style-catalog cache for the composer surfaces. */
const catalog = {
  settled: null,
  promise: null,
  listeners: new Set(),
}
function fetchStyleCatalog() {
  if (catalog.promise) return catalog.promise
  catalog.promise = api('/dsh-ui-style/styles')
    .then(data => {
      catalog.settled = (data.styles || []).filter(s => !s.builtin)
      for (const listener of [...catalog.listeners]) listener()
      return catalog.settled
    })
    .catch(() => {
      catalog.promise = null
      return []
    })
  return catalog.promise
}
function subscribeCatalog(listener) {
  catalog.listeners.add(listener)
  return () => catalog.listeners.delete(listener)
}

/** The `@` trigger source: type @ in the composer to pick a captured style. */
function createStyleTriggerSource() {
  return {
    trigger: '@',
    name: 'style',
    order: 40,
    async candidates(session, { query, signal }) {
      const styles = catalog.settled ?? await fetchStyleCatalog()
      if (signal.aborted) return []
      const needle = query.toLowerCase()
      return styles
        .filter(s => s.name.toLowerCase().includes(needle) || (s.title || '').toLowerCase().includes(needle))
        .map(s => ({
          name: s.name,
          description: (s.title && s.title !== s.name ? s.title + ' · ' : '') + (s.sourceUrl || ''),
        }))
    },
    warm() { fetchStyleCatalog() },
    lexicon() { return catalog.settled ? catalog.settled.map(s => s.name) : undefined },
    subscribeLexicon(session, listener) { return subscribeCatalog(listener) },
    onPick({ candidate }) {
      // Plain-text path: the draft gains `/ui-style-… `, the native
      // user-invocable skill command flow takes it from there.
      return { text: '/' + candidate.name + ' ' }
    },
  }
}

/** Launcher button in conversation.input.right: opens the `@` style menu. */
function StyleLauncher(props) {
  const { useInput, inputActions, locked } = props
  const input = useInput ? useInput(s => s) : undefined
  const [hasStyles, setHasStyles] = useState(false)
  useEffect(() => {
    injectStyles()
    fetchStyleCatalog().then(styles => setHasStyles(styles.length > 0))
    return subscribeCatalog(() => setHasStyles((catalog.settled || []).length > 0))
  }, [])
  const open = useCallback(() => {
    if (!inputActions || !input) return
    const draft = input.draft || ''
    // Appending `@` at the caret drives the ordinary typed-trigger path:
    // the menu opens with the style group ready to pick.
    const joiner = draft === '' || /\s$/.test(draft) ? '' : ' '
    inputActions.setDraft(draft + joiner + '@')
  }, [inputActions, input])
  if (!hasStyles) return null
  return h('button', {
    className: 'dus-launch',
    type: 'button',
    onClick: open,
    disabled: locked || !inputActions || !input,
    title: 'UI Style',
  }, '🎨', ' Style')
}

/** Dock chip in conversation.input.dock: the pinned current style. */
function StyleDock(props) {
  const { inputActions, useInput } = props
  const [selection, setSelection] = useState(undefined)
  useEffect(() => {
    injectStyles()
    let disposed = false
    const load = () => api('/dsh-ui-style/selection')
      .then(data => { if (!disposed) setSelection(data.name ? data : null) })
      .catch(() => { if (!disposed) setSelection(null) })
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    const timer = setInterval(load, 20000)
    return () => {
      disposed = true
      window.removeEventListener('focus', onFocus)
      clearInterval(timer)
    }
  }, [])
  const invoke = useCallback(() => {
    if (!inputActions || !selection || !selection.name) return
    const draft = useInput ? (useInput(s => s && s.draft) || '') : ''
    inputActions.setDraft('/' + selection.name + ' ' + (draft.startsWith('/') ? '' : draft))
  }, [inputActions, useInput, selection])
  const clear = useCallback(event => {
    event.stopPropagation()
    api('/dsh-ui-style/selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: null }),
    }).then(() => setSelection(null)).catch(() => {})
  }, [])
  if (!selection || !selection.name) return null
  const style = selection.style || {}
  const label = selection.name.replace(/^ui-style-/, '')
  return h('span', { className: 'dus-dock', onClick: invoke, title: selection.name, role: 'button', tabIndex: 0,
    onKeyDown: event => { if (event.key === 'Enter') invoke() } },
    '🎨',
    label,
    style.topColors && h('span', { className: 'dus-dock-swatches' },
      style.topColors.slice(0, 3).map(c => h('span', { key: c, className: 'dus-dock-swatch', style: { background: c } }))),
    h('button', { className: 'dus-dock-clear', type: 'button', onClick: clear, title: '×' }, '×'))
}

exports.name = 'dsh-ui-style/client'
exports.inject = ['slots', 'locale', 'inputTriggers']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ui-style: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'ui-style',
    order: 80,
    label: () => t('tab'),
    locale: NS,
  }, () => h(StylePage, { locale: ctx.locale })))

  // Composer: `@` trigger source listing every captured style.
  const inputTriggers = ctx.get('inputTriggers')
  if (inputTriggers) {
    ctx.effect(() => inputTriggers.registerSource(createStyleTriggerSource()), 'dsh-ui-style: trigger source')
  }

  // Composer: launcher button opening the style picker from the input row.
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'ui-style',
    order: 90,
    locale: NS,
  }, StyleLauncher))

  // Composer: dock chip pinning the current style for one-click invocation.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'ui-style',
    order: 40,
    locale: NS,
  }, StyleDock))
}

return module.exports; } });
