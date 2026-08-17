# dsh-ui-style

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that **captures the UI design style of any website or GitHub project and turns it into a reusable agent skill** — so every future UI you build stays visually consistent with the projects you love.

![license](https://img.shields.io/badge/license-MIT-blue)

## What it does

1. **A dedicated page** in the DSH Web settings (*Settings → UI Styles*) where you paste a web URL or a GitHub repository address.
2. **Capture**: the plugin fetches the page's stylesheets — or the repo's `tailwind.config.*`, theme files, `globals.css`, `components.json`, `package.json` — and parses them into **design tokens**: color palette and semantic roles, typography scale, spacing scale, corner radii, shadows, breakpoints, motion timings, dark-mode support, and framework detection (Tailwind, shadcn/ui, MUI, Ant Design, Bootstrap, Chakra…).
3. **Distill**: the tokens are summarized into a standard DSH **skill bundle** (`ui-style-<name>/SKILL.md` + `references/tokens.json`) saved **inside the plugin's own `skills/` directory**.
4. **Reuse**: the plugin registers its skills directory with the DSH skill registry, so captured styles are immediately discoverable in every session. Ask for *"build the settings page in the `ui-style-acme-com` style"* and the model loads the captured design system and imitates it — no copy-pasting style guides.
5. **Quality pass**: a built-in professional skill, **`ui-design-craft`** (visual hierarchy, WCAG contrast, state coverage, responsive discipline, motion restraint, anti-AI-slop checklist), pairs with every captured style to keep the output at a professional bar.

## Why

AI-generated UI tends to drift: every session invents new colors, new spacing, new radii. This plugin freezes a project's design language into a versionable file the agent must follow, giving you **UI consistency across sessions** — replicate your old project's style, match a client's brand site, or mirror an open-source design system.

## Installation

Prerequisites: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) with the **web** profile.

**From a local checkout** (recommended for development):

```bash
git clone https://github.com/<owner>/dsh-ui-style.git
dsh plugin --profile web add /path/to/dsh-ui-style
```

**From GitHub** (once published):

```bash
dsh plugin --profile web add github:<owner>/dsh-ui-style
```

**From npm** (once published):

```bash
dsh plugin --profile web add dsh-ui-style
```

Then **restart DeepSeek Harness** (`dsh web`). Plugin changes only load at boot.

Verify the installation: open the DSH Web GUI → *Settings* → the **UI Styles** section should appear in the sidebar.

## Usage

### Capture a style

1. Open *Settings → UI Styles*.
2. Paste a URL — a website (`https://linear.app`) or a GitHub repo (`https://github.com/shadcn-ui/ui`) — and press **Capture style**.
3. The plugin fetches, parses, and saves `ui-style-<name>` into its `skills/` directory. The card list shows color swatches, detected frameworks, and the source link; expand **View skill** to inspect the generated `SKILL.md`.

Capturing the same site again overwrites (refreshes) its skill.

### Use a style in a session

In any conversation, name the style — the model's skill catalog already contains it:

> 用 `ui-style-shadcn-ui` 的风格给我做一个仪表盘页面。
> *Build me a dashboard page in the `ui-style-shadcn-ui` style.*

The model loads the skill, maps the captured tokens into your stack (CSS variables, Tailwind theme, component-library overrides), and builds UI that matches the source. For the full professional pass it can also load `ui-design-craft`.

Captured bundles are portable: copy any `skills/ui-style-*/` directory into a project's `.dsh/skills/` (project-scoped) or `~/.dsh/skills/` (user-scoped) and DSH's built-in filesystem provider picks it up unchanged.

## Configuration

| Option | Where | Default | Meaning |
|---|---|---|---|
| `skillsDir` | plugin config in your profile's `cordis.patch.yml` | `<plugin>/skills` | Where captured skill bundles are stored and scanned. |
| `GITHUB_TOKEN` | host environment | — | Raises the GitHub API rate limit (60 req/h unauthenticated) for repository captures. |
| `DSH_UI_STYLE_ALLOW_PRIVATE=1` | host environment | off | Opt in to capturing loopback/intranet pages (self-hosted tools, local dev servers). |

Config example (`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert: []
- patch:
    dsh-ui-style:
      skillsDir: /Users/me/design-skills
```

## How it works

```
┌─ browser (client/client.js) ─────────────────────────────┐
│ Settings "UI Styles" page → capture form, style library  │
└──────────────┬───────────────────────────────────────────┘
               │ fetch /dsh-ui-style/*
┌──────────────▼───────────────────────────────────────────┐
│ host (lib/index.js)                                      │
│  POST /extract ──► captureWebsite / captureRepository    │
│                    ──► design-token harvester (tokens.js)│
│                    ──► SKILL.md + tokens.json (skill.js) │
│                    ──► plugin skills/ directory (store)  │
│  ctx.skills provider ──► captured styles appear in the   │
│  model's skill catalog immediately                       │
└──────────────────────────────────────────────────────────┘
```

- **No headless browser, zero runtime dependencies** — tolerant regex/Scanner-based CSS analysis; works offline from any saved HTML/CSS as well.
- **Skill-native output** — bundles follow the exact `SKILL.md` frontmatter contract (`name`, `description`, `whenToUse`, `metadata`) that `dsh-skill-filesystem` parses.
- **Safe by default** — mutation routes accept same-origin loopback requests only; private/loopback fetch targets are refused unless explicitly enabled; GitHub access is read-only and token-optional.

## Limitations

- Capture is static analysis, not a rendered-DOM measurement: styles injected at runtime by JS, values behind `calc()`/`var()` indirection, and imagery/iconography style are approximated or noted as "not detected" rather than measured.
- Color *roles* without semantic variable names are heuristic inferences and are labeled as such in the generated skill.
- Styles saved into an npm/GitHub-installed copy live inside the package directory; reinstalling or upgrading the package removes them. Set `skillsDir` to a durable path, or install from a local checkout (a pnpm link), to keep your library forever.
- GitHub captures need the repo's style files to be on the default branch and publicly readable.

## Development

```bash
node --test "test/*.test.js"   # 16 unit + integration tests
npm pack --dry-run             # verify the published file set
```

Project layout:

```
client/client.js      settings-page UI (lazy-CJS client bundle)
lib/index.js          cordis host plugin + HTTP routes
lib/extract.js        website capture (HTML + stylesheets)
lib/github.js         GitHub repository capture
lib/tokens.js         CSS design-token harvester
lib/skill.js          SKILL.md / tokens.json rendering
lib/store.js          skill-bundle storage
lib/provider.js       ctx.skills provider for the plugin skills dir
skills/ui-design-craft/SKILL.md   built-in professional UI skill
```

## License

[MIT](LICENSE)
