# dsh-ui-style

[English](README.md) | 中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件:**抓取任意网站或 GitHub 项目的 UI 设计风格,提炼成可复用的 Agent Skill** —— 让以后的每一次 UI 开发都能保持和你喜欢的项目一致的视觉语言。

![license](https://img.shields.io/badge/license-MIT-blue)

## 功能

1. **独立页面**:DSH Web 设置里的 *设置 → UI 风格* 页面,粘贴网址或 GitHub 仓库地址即可。
2. **深度提取**:抓取页面样式表,或仓库里的 `tailwind.config.*`、主题文件、`globals.css`、`components.json`、`package.json`,解析为**设计令牌**:调色板与语义角色、字体排印阶梯、间距阶梯、圆角、阴影、边框宽度、版心容器宽度、响应式断点、动效时长、暗色模式支持、**组件蓝图**(`button`、`.card`、`input`、标题、表格等组件的实测声明),以及框架识别(Tailwind、shadcn/ui、MUI、Ant Design、Bootstrap、Chakra……)。
3. **设计思路总结**:不止于原始令牌,插件还会推导*设计语言* —— 圆角性格、投影层级、密度、色彩情绪、字体性格、边框与动效特征,每项都附实测依据,让模型在没有精确令牌覆盖的地方也能做出忠于原作的决定。
4. **沉淀为 Skill**:全部内容总结成标准的 DSH **skill 包**(`ui-style-<名称>/SKILL.md` + `references/tokens.json`),**保存在插件自己的 `skills/` 目录下**。
5. **主题实时预览**:每个已保存的风格都能在设置页直接渲染出一个模拟应用(顶栏、主视觉、按钮、卡片、输入框、徽章),全部用捕获的令牌着色 —— 看着预览选主题,不用猜。
6. **聊天框里直接调用**:捕获的风格注册进 DSH skill 注册表,每个会话都能调用 ——
   - 在输入框输入 **`@`**,从 **style** 分组里选择风格;
   - 或点击输入栏的 **🎨 Style** 按钮弹出选择器;
   - 或在设置页**设为当前风格**,输入框上方会出现一键调用的快捷胶囊;
   - 或直接说:*"用 `ui-style-acme-com` 的风格做 UI"*。
7. **专业质量校验**:内置专业 UI 设计 skill **`ui-design-craft`**(视觉层级、WCAG 对比度、状态覆盖、响应式纪律、动效克制、反 AI 套路清单),与每个捕获风格配合使用,把输出拉到专业水准。

## 为什么需要它

AI 生成的 UI 容易"漂移":每个会话都会发明新颜色、新间距、新圆角。这个插件把一个项目的设计语言冻结成可版本化的文件,让 Agent 必须遵守,从而获得**跨会话的 UI 一致性** —— 复刻旧项目的风格、匹配客户品牌站,或对齐某个开源设计系统。

## 安装

前置条件:已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`),使用 **web** profile。

**本地源码安装**(开发推荐):

```bash
git clone https://github.com/MeguruForever/dsh-ui-style.git
dsh plugin --profile web add /path/to/dsh-ui-style
```

**从 GitHub 安装**(发布后可用):

```bash
dsh plugin --profile web add github:MeguruForever/dsh-ui-style
```

**从 npm 安装**(发布后可用):

```bash
dsh plugin --profile web add dsh-ui-style
```

然后**重启 DeepSeek Harness**(`dsh web`)。插件只在启动时加载。

验证安装:打开 DSH Web 界面 → *设置* → 侧栏应出现 **UI 风格** 板块。

## 使用

### 捕获风格

1. 打开 *设置 → UI 风格*。
2. 粘贴链接 —— 网站(`https://linear.app`)或 GitHub 仓库(`https://github.com/shadcn-ui/ui`)—— 点击 **提取风格**。
3. 插件完成抓取、解析并把 `ui-style-<名称>` 保存到插件的 `skills/` 目录。卡片列表展示色板、识别到的框架和来源链接;展开 **预览主题** 可看到用捕获令牌实时渲染的模拟应用,展开 **查看 Skill** 可检查生成的 `SKILL.md`。
4. 点击 **设为当前风格** 把它固定为输入框快捷方式。

对同一站点再次捕获会覆盖(刷新)对应的 skill。

### 在会话中使用风格

四种方式,随场景选用:

- **输入框选择器** —— 在聊天输入框输入 `@`,从 *style* 分组中选择(或点击输入栏的 **🎨 Style** 按钮弹出同一个选择器),选中后草稿自动变为 `/ui-style-<名称>`。
- **当前风格胶囊** —— 固定的风格会以胶囊形式出现在输入框上方,点击即填入调用指令,`×` 取消固定。
- **斜杠命令** —— 直接输入 `/ui-style-<名称>`,这是原生的用户可调 skill 命令。
- **自然语言** —— 直接说 *"用 `ui-style-shadcn-ui` 的风格给我做一个仪表盘页面"*,模型的技能目录里已经有它。

模型会加载该 skill,把捕获的令牌映射到你的技术栈(CSS 变量、Tailwind 主题、组件库主题覆盖),产出与源项目一致的 UI。需要完整专业校验时,它还可以加载 `ui-design-craft`。

捕获的 skill 包是可移植的:把任意 `skills/ui-style-*/` 目录复制到项目的 `.dsh/skills/`(项目级)或 `~/.dsh/skills/`(用户级),DSH 内置的文件系统 provider 会原样识别。

## 配置

| 选项 | 位置 | 默认值 | 含义 |
|---|---|---|---|
| `skillsDir` | profile 的 `cordis.patch.yml` 中的插件配置 | `<插件>/skills` | skill 包的存储与扫描目录。 |
| `GITHUB_TOKEN` | 主机环境变量 | — | 提高 GitHub API 速率限制(未认证为 60 次/小时)。 |
| `DSH_UI_STYLE_ALLOW_PRIVATE=1` | 主机环境变量 | 关闭 | 显式允许抓取内网/本机页面(自托管工具、本地开发服务器)。 |

配置示例(`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert: []
- patch:
    dsh-ui-style:
      skillsDir: /Users/me/design-skills
```

## 工作原理

```
┌─ 浏览器 (client/client.js) ──────────────────────────────┐
│ 设置页 "UI 风格" → 抓取表单、风格库管理                   │
└──────────────┬───────────────────────────────────────────┘
               │ fetch /dsh-ui-style/*
┌──────────────▼───────────────────────────────────────────┐
│ 主机 (lib/index.js)                                      │
│  POST /extract ──► captureWebsite / captureRepository    │
│                    ──► 设计令牌提取器 (tokens.js)        │
│                    ──► SKILL.md + tokens.json (skill.js) │
│                    ──► 插件 skills/ 目录 (store)         │
│  ctx.skills provider ──► 捕获的风格立即进入              │
│  模型的技能目录                                          │
└──────────────────────────────────────────────────────────┘
```

- **无头浏览器依赖为零、运行时零依赖**:基于容错的正则/扫描式 CSS 分析。
- **原生 Skill 输出**:bundle 严格遵循 `SKILL.md` frontmatter 契约(`name`、`description`、`whenToUse`、`metadata`),与 `dsh-skill-filesystem` 完全一致。
- **默认安全**:变更类路由只接受同环回来源请求;默认拒绝抓取内网/环回地址;GitHub 访问只读,token 可选。

## 已知限制

- 捕获是静态分析而非渲染后测量:JS 运行时注入的样式、`calc()`/`var()` 间接值、图像与图标风格只能近似或标注"未检测到"。
- 没有语义变量名时的颜色*角色*是启发式推断,生成的 skill 中会明确标注。
- 保存进 npm/GitHub 安装副本里的风格位于包目录内,重装或升级会清除。设置 `skillsDir` 到持久路径,或用本地源码安装(pnpm link),即可永久保留风格库。
- GitHub 捕获要求样式文件在默认分支且公开可读。

## 开发

```bash
node --test "test/*.test.js"   # 23 个单元 + 集成测试
npm pack --dry-run             # 检查发布文件集
```

目录结构:

```
client/client.js      设置页 UI(lazy-CJS 客户端 bundle)
lib/index.js          cordis 主机插件 + HTTP 路由
lib/extract.js        网站抓取(HTML + 样式表)
lib/github.js         GitHub 仓库抓取
lib/tokens.js         CSS 设计令牌提取器
lib/skill.js          SKILL.md / tokens.json 渲染
lib/store.js          skill 包存储
lib/provider.js       插件 skills 目录的 ctx.skills provider
skills/ui-design-craft/SKILL.md   内置专业 UI 设计 skill
```

## 许可证

[MIT](LICENSE)
