window.__ModuleLoader__.load({ id: "dsh-ui-style", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict'

/**
 * dsh-ui-style — browser half.
 *
 * A dedicated settings page that captures the UI design style of a website or
 * GitHub repository into a reusable skill bundle, lists every saved style,
 * and explains how to invoke them in future sessions. All heavy lifting lives
 * in the host plugin behind /dsh-ui-style/* routes; this file is pure UI.
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
  captureHint: '提取会抓取页面样式表或仓库中的主题/样式文件,解析颜色、字体、间距、圆角、阴影、断点等设计令牌,并生成 SKILL.md 保存到插件目录。',
  saved: '已保存的风格',
  builtin: '内置',
  empty: '还没有保存的风格。输入一个链接,开始建立你的 UI 风格库。',
  loading: '正在加载风格库…',
  loadFailed: '风格库加载失败,请点击重试。',
  retry: '重试',
  view: '查看 Skill',
  hide: '收起',
  remove: '删除',
  removing: '删除中…',
  confirmRemove: '确认删除这个风格 Skill?该操作不可恢复。',
  source: '来源',
  capturedAt: '提取时间',
  usage: '使用方式',
  usageDetail: '在会话中直接说"使用 <name> 风格开发 UI",模型会自动加载该 Skill;也可以输入 / 唤起 skill 列表手动调用。配合内置的 ui-design-craft 可获得专业级质量校验。',
  success: '风格提取完成',
  counts: { colors: '颜色', cssVariables: 'CSS 变量', typeSizes: '字号', spacings: '间距', radii: '圆角', shadows: '阴影' },
  reload: '风格库已更新',
  skillFile: 'SKILL.md 内容',
  error: '提取失败',
  rateLimited: 'GitHub API 达到速率限制,可为主机配置 GITHUB_TOKEN 后重试。',
}

const en = {
  tab: 'UI Styles',
  title: 'UI Style Capture',
  subtitle: 'Distill the UI design style of any website or GitHub project into a reusable skill, and keep every future UI build visually consistent.',
  inputPlaceholder: 'Paste a page or GitHub repo URL, e.g. https://linear.app or https://github.com/shadcn-ui/ui',
  capture: 'Capture style',
  capturing: 'Capturing…',
  captureHint: 'A capture fetches the page stylesheets or the repo theme/style files, parses colors, type, spacing, radii, shadows and breakpoints into design tokens, then writes a SKILL.md into the plugin directory.',
  saved: 'Saved styles',
  builtin: 'Built-in',
  empty: 'No saved styles yet. Paste a link above to start your UI style library.',
  loading: 'Loading the style library…',
  loadFailed: 'The style library could not be loaded. Try again.',
  retry: 'Retry',
  view: 'View skill',
  hide: 'Hide',
  remove: 'Delete',
  removing: 'Deleting…',
  confirmRemove: 'Delete this style skill? This cannot be undone.',
  source: 'Source',
  capturedAt: 'Captured',
  usage: 'How to use',
  usageDetail: 'In any session, say "build the UI in the <name> style" and the model loads the skill automatically; or type / to invoke it manually. Pair it with the built-in ui-design-craft skill for a professional quality pass.',
  success: 'Style captured',
  counts: { colors: 'colors', cssVariables: 'CSS variables', typeSizes: 'type sizes', spacings: 'spacings', radii: 'radii', shadows: 'shadows' },
  reload: 'Style library updated',
  skillFile: 'SKILL.md content',
  error: 'Capture failed',
  rateLimited: 'GitHub API rate limit reached. Configure GITHUB_TOKEN on the host and retry.',
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
.dus-card-head{align-items:flex-start;display:flex;gap:10px}
.dus-name{font-size:14px;font-weight:700;line-height:1.35;overflow-wrap:anywhere}
.dus-sub{color:var(--dsw-alias-label-tertiary,#7c8594);font-size:12px;line-height:1.5;margin-top:2px}
.dus-sub a{color:var(--dsw-alias-brand-primary,#4338ca);text-decoration:none;word-break:break-all}
.dus-sub a:hover{text-decoration:underline}
.dus-badge{background:var(--dsw-alias-brand-secondary,#eef2ff);border-radius:999px;color:var(--dsw-alias-brand-primary,#4338ca);flex:0 0 auto;font-size:11px;font-weight:650;padding:3px 8px}
.dus-swatches{display:flex;gap:6px}
.dus-swatch{border:1px solid var(--dsw-alias-border-subtle,#e4e7ec);border-radius:6px;display:inline-block;height:20px;width:20px}
.dus-chips{display:flex;flex-wrap:wrap;gap:6px}
.dus-chip{background:var(--dsw-alias-bg-layer-2,#f2f4f7);border-radius:999px;color:var(--dsw-alias-label-secondary,#667085);font-size:11px;padding:4px 8px}
.dus-card-foot{align-items:center;display:flex;gap:8px}
.dus-grow{flex:1}
.dus-btn{appearance:none;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-normal,#d0d5dd);border-radius:9px;color:inherit;cursor:pointer;font:inherit;font-size:12px;min-height:34px;padding:5px 11px}
.dus-btn[data-kind=remove]{border-color:var(--dsw-alias-state-danger-border,#dc6b6b);color:var(--dsw-alias-state-danger-primary,#b42318)}
.dus-btn:disabled{cursor:not-allowed;opacity:.55}
.dus-usage{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-radius:9px;color:var(--dsw-alias-label-secondary,#586174);font-size:12px;line-height:1.6;padding:9px 11px}
.dus-usage code{background:rgba(0,0,0,.06);border-radius:5px;padding:1px 5px;word-break:break-all}
.dus-skillview{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-radius:9px;font-family:var(--dsw-mono-font,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:1.55;margin:0;max-height:420px;overflow:auto;padding:11px;white-space:pre-wrap;word-break:break-word}
.dus-state{align-items:center;color:var(--dsw-alias-label-secondary,#667085);display:flex;font-size:13px;gap:8px;justify-content:center;min-height:120px;text-align:center}
.dus-spin{animation:dus-spin .8s linear infinite;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;height:15px;width:15px}@keyframes dus-spin{to{transform:rotate(360deg)}}
.dus-section-label{color:var(--dsw-alias-label-tertiary,#7c8594);font-size:12px;font-weight:650;letter-spacing:.04em;margin:2px 0 0;text-transform:uppercase}
@media(max-width:560px){.dus-form{flex-direction:column}.dus-action{width:100%}}
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

function Swatches({ colors }) {
  if (!colors || colors.length === 0) return null
  return h('div', { className: 'dus-swatches', title: colors.join(' ') },
    colors.map(color => h('span', { key: color, className: 'dus-swatch', style: { background: color } })))
}

function StyleCard({ style, copy, onRemoved }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const toggle = useCallback(async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (detail) return
    setBusy(true)
    setError(null)
    try {
      setDetail(await api('/dsh-ui-style/styles/' + encodeURIComponent(style.name)))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [expanded, detail, style.name])

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

  const usage = copy.usageDetail.replace('<name>', style.name)

  return h('div', { className: 'dus-card' },
    h('div', { className: 'dus-card-head' },
      h('div', { style: { minWidth: 0, flex: 1 } },
        h('div', { className: 'dus-name' }, style.title || style.name),
        h('div', { className: 'dus-sub' },
          style.sourceUrl
            ? h('a', { href: style.sourceUrl, target: '_blank', rel: 'noreferrer' }, style.sourceUrl)
            : style.name,
          style.capturedAt ? ' · ' + copy.capturedAt + ' ' + style.capturedAt.slice(0, 10) : '')),
      style.builtin && h('span', { className: 'dus-badge' }, copy.builtin)),
    h(Swatches, { colors: style.topColors }),
    style.frameworks && style.frameworks.length > 0 && h('div', { className: 'dus-chips' },
      style.frameworks.map(f => h('span', { key: f, className: 'dus-chip' }, f))),
    h('div', { className: 'dus-usage' },
      h('strong', null, copy.usage + ': '),
      h('code', null, style.name),
      ' — ' + usage),
    error && h('div', { className: 'dus-error' }, error),
    expanded && (busy
      ? h('div', { className: 'dus-state' }, h('span', { className: 'dus-spin' }), copy.loading)
      : detail && h('div', null,
          h('div', { className: 'dus-section-label' }, copy.skillFile),
          h('pre', { className: 'dus-skillview' }, detail.skill))),
    h('div', { className: 'dus-card-foot' },
      h('span', { className: 'dus-grow' }),
      h('button', { className: 'dus-btn', type: 'button', onClick: toggle, disabled: busy && !expanded },
        expanded ? copy.hide : copy.view),
      !style.builtin && h('button', {
        className: 'dus-btn', 'data-kind': 'remove', type: 'button', onClick: remove, disabled: busy,
      }, busy && !expanded ? copy.removing : copy.remove)))
}

function useCopy(locale) {
  const snapshot = React.useSyncExternalStore(
    listener => locale.subscribe(listener),
    () => locale.getSnapshot(),
  )
  const lang = String(snapshot.active).toLowerCase().startsWith('zh') ? 'zh' : 'en'
  return lang === 'zh' ? zh : en
}

function StylePage({ locale }) {
  const copy = useCopy(locale)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [list, setList] = useState(null)
  const [listError, setListError] = useState(null)
  const abortRef = useRef(null)

  const load = useCallback(async () => {
    setListError(null)
    try {
      const data = await api('/dsh-ui-style/styles')
      setList(data.styles)
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
      list.map(style => h(StyleCard, { key: style.name, style, copy, onRemoved }))))
}

exports.name = 'dsh-ui-style/client'
exports.inject = ['slots', 'locale']
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
}

return module.exports; } });
