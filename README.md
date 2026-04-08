# weread-import

将微信读书的划线与想法导出为 Markdown 文件，可直接写入 Obsidian vault 或任意本地目录。

## 特性

- API 优先的导出方式，支持单本或批量导出
- 支持手动传入 cookie 或从浏览器自动提取
- 增量同步：基于 ID 跟踪新增 / 更新 / 保留 / 删除
- 已删除内容自动归档至 `## 已删除`，不会丢失
- 输出 Obsidian 友好的 YAML frontmatter，支持自定义 tags

## 安装

### 作为 CLI 工具

```bash
git clone https://github.com/gnixner/weread-import.git
cd weread-import
npm install
```

### 作为 Clawhub Skill

将仓库克隆到 skill 目录即可。首次执行 `scripts/run.sh` 时会自动安装依赖。

## 快速开始

### 导入单本书

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser-managed --output "/path/to/Reading"
```

### 导入全部书

```bash
node ./src/cli.mjs --all --mode api --cookie-from browser-managed --output "/path/to/Reading"
```

### 强制重新渲染已有文件

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser-managed --output "/path/to/Reading" --force
```

### 覆盖 frontmatter tags

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser-managed --output "/path/to/Reading" --tags "reading/weread,book"
```

## 配置

所有环境变量均可参考 `env.example.md`，复制为 `.env` 后按需修改：

```bash
cp env.example.md .env
```

### 输出目录

默认输出到工作目录下的 `./out/weread`。可通过环境变量覆盖：

```bash
WEREAD_OUTPUT="/path/to/Reading"
```

### Cookie 配置

#### 手动传入 cookie

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie '完整 cookie 字符串'
```

或通过环境变量：

```bash
WEREAD_COOKIE='完整 cookie 字符串' node ./src/cli.mjs --book "自卑与超越" --mode api
```

#### 从浏览器自动提取

前提：已在开启远程调试端口的 Chrome 中登录微信读书，或使用本项目拉起的独立受管浏览器完成微信读书登录。

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser-managed
```

自定义调试端口（默认 `http://127.0.0.1:9222`）：

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser-live --cdp http://127.0.0.1:9222
```

说明：

- `browser-live`：复用一个已经开启远程调试端口的外部 Chrome，不会自动拉起受管浏览器
- `browser-managed`：启动一个独立的受管 Chrome profile，并打开微信读书登录页
- 默认受管 profile 目录为 `~/.weread-import-profile-isolated`
- `browser` 仍可用，但仅作为 `browser-managed` 的兼容别名
- `browser-managed` 默认不会再同步默认 Chrome 的整份登录态，以避免影响其他站点的 web 登录
- 如需保留旧的整份 profile 同步行为，可显式设置 `WEREAD_PROFILE_SYNC_MODE=legacy`

#### 手动获取 cookie

1. 在浏览器中打开 <https://weread.qq.com/> 并登录
2. 打开开发者工具 (F12)
3. 找到任一 `weread.qq.com` 请求
4. 复制请求头中完整的 `Cookie` 值

### Frontmatter tags

默认值为 `reading,weread`，可通过环境变量或命令行参数覆盖：

```bash
WEREAD_TAGS="reading/weread,book"
```

## 命令行参数

| 参数 | 说明 |
|------|------|
| `--all` | 导出全部书籍 |
| `--book <标题>` | 按标题模糊匹配导出 |
| `--book-id <ID>` | 按书籍 ID 导出 |
| `--output <目录>` | 自定义输出目录 |
| `--cookie <cookie>` | 直接传入 cookie |
| `--cookie-from <manual\|browser-live\|browser-managed>` | cookie 来源方式，`browser` 为 `browser-managed` 兼容别名 |
| `--mode <api>` | 导出模式，默认 `api` |
| `--cdp <url>` | Chrome 远程调试地址，默认 `http://127.0.0.1:9222` |
| `--limit <n>` | 最多处理的书籍数量 |
| `--force` | 跳过增量检查，强制重新渲染 |
| `--tags <a,b,c>` | 覆盖 frontmatter 中的 tags |

## 同步机制

输出目录中会维护 `.weread-import-state.json` 文件，用于增量同步：

- 基于 `lastNoteUpdate` 跳过无变化的书籍
- 基于 `bookmarkId` / `reviewId` 追踪每条记录的状态
- 合并结果按新增 / 更新 / 保留 / 删除分类统计
- 被远端删除的内容会归档到 `## 已删除`，而非直接丢弃
- 兼容旧版输出目录：无状态文件时回退解析现有 Markdown

当微信读书 API 返回业务错误（如登录过期）时，CLI 会直接报错退出，不会静默导出空结果。

模式选择建议：

- 已有外部 Chrome CDP，并希望复用当前浏览器微信读书登录态：优先用 `browser-live`
- 希望完全隔离，不影响主浏览器其他站点 web 登录：用 `browser-managed`

升级影响：

- 旧的 `--cookie-from browser` 仍可继续使用，但其语义现在等同于 `browser-managed`
- 从旧版本升级到默认隔离模式后，首次运行 `browser-managed` 可能需要在独立窗口中重新登录一次微信读书
- `browser-live` 不会自动启动浏览器；如果外部 CDP 未运行，会直接失败并提示改用 `browser-managed`

## 输出格式

每本书导出为一个 Markdown 文件，结构如下：

- **YAML frontmatter**：`title`、`author`、`bookId`、`source`、`lastNoteUpdate`、`highlightCount`、`reviewCount`、`tags`
- **`# 书名`**
- **`## 划线`**（按章节分组，仅在有划线时出现）
- **`## 想法`**（按章节分组，仅在有想法时出现）
- **`## 已删除`**（仅在有被删除内容时出现）

格式约定：

- 元信息由 frontmatter 承载，正文不重复
- 划线与想法按章节名分组为 `### 章节名`
- 已删除内容按 `### 划线/想法` → `#### 章节名` 组织
- `bookmarkId`、`reviewId`、`time`、`chapterUid` 以 HTML 注释嵌入，兼顾可读性与 diff 友好
- 空内容不输出，空章节自动跳过

示例输出见 `examples/sample-output.md`。

## 项目结构

```
src/
  cli.mjs              ← CLI 入口
  index.mjs            ← 编程接口导出
  api.mjs              ← 微信读书 API 请求
  cookie.mjs           ← Cookie 提取与获取
  entries.mjs          ← 条目构建与分组
  render.mjs           ← Markdown 渲染
  merge.mjs            ← 增量合并与统计
  markdown-parser.mjs  ← Markdown 解析
  state.mjs            ← 同步状态管理
  errors.mjs           ← 错误类型定义
  utils.mjs            ← 通用工具函数
scripts/
  run.sh               ← Skill 入口（首次自动安装依赖）
  open-chrome-debug.sh ← 启动隔离的 Chrome 远程调试
  prepare-staging-skill.sh ← 生成隔离的 staging skill 目录
tests/                 ← 单元测试（node:test）
references/
  workflows.md         ← 常用工作流参考
SKILL.md               ← Clawhub Skill 描述
TEMPLATE.md            ← 输出模板参考
```

## 测试

```bash
npm test
```

## 开发与发版流程

发版前不要把 GitHub release / ClawHub / OpenClaw bot 当成验证环境。

推荐顺序：

1. 本地开发
2. 自动测试
3. 本地真机验证
4. 本地 staging 安装态验证
5. 提交 / 打 tag / 发 release

### 1. 自动测试

至少执行：

```bash
node --test
```

### 2. 本地真机验证

目的：确认当前 repo 代码在真实 Chrome CDP 和真实微信读书会话下可用。

规则：

- 验证阶段一律输出到 `/tmp/...`
- 不要直接写正式 Reading 目录
- 至少覆盖 API 探针和一次完整导出
- 若验证浏览器模式路径，书籍详情接口应按浏览器上下文链路验证，而不是只测手动 cookie 的 Node 请求

### 3. 本地 staging 安装态验证

目的：确认当前修复在“安装后的 skill 目录”里也可用，而不是只在 repo 工作树里可用。

规则：

- 先从当前 repo 生成一个隔离的临时 staging skill 目录
- 在这个 staging 目录里复现真实运行命令
- 输出目录仍然使用 `/tmp/...`
- 不要直接覆盖正在服役的 skill 安装目录

推荐做法：

```bash
STAGING_DIR="$(bash ./scripts/prepare-staging-skill.sh)"
OUT="$(mktemp -d /tmp/weread-staging-verify.XXXXXX)"
bash "$STAGING_DIR/scripts/run.sh" --all --mode api --cookie-from browser-managed --output "$OUT"
```

如果你在某个 agent 平台里还有真实安装态，也可以在 staging 验证通过后再补一轮平台内 smoke test；但发版门槛默认只要求隔离的 staging 安装态验证通过。

### 4. 发版门槛

只有同时满足以下条件，才允许发版：

- `node --test` 通过
- 本地真机验证通过
- 本地 staging 安装态验证通过

如果上述任一项失败，不要发 GitHub release，不要上传 ClawHub。
