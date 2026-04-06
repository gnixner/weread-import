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
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading"
```

### 导入全部书

```bash
node ./src/cli.mjs --all --mode api --cookie-from browser --output "/path/to/Reading"
```

### 强制重新渲染已有文件

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading" --force
```

### 覆盖 frontmatter tags

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading" --tags "reading/weread,book"
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

前提：已在开启远程调试端口的 Chrome 中登录微信读书。

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser
```

自定义调试端口（默认 `http://127.0.0.1:9222`）：

```bash
node ./src/cli.mjs --book "自卑与超越" --mode api --cookie-from browser --cdp http://127.0.0.1:9222
```

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
| `--cookie-from <manual\|browser>` | cookie 来源方式 |
| `--mode <auto\|api\|dom>` | 导出模式，默认 `auto` |
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
  dom.mjs              ← DOM 模式（浏览器抓取）
  errors.mjs           ← 错误类型定义
  utils.mjs            ← 通用工具函数
scripts/
  run.sh               ← Skill 入口（首次自动安装依赖）
  open-chrome-debug.sh ← 启动 Chrome 远程调试
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
