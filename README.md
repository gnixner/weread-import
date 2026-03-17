# weread-import

把微信读书中的划线和想法导出为 Markdown，写入任意本地目录（包括 Obsidian vault 中的某个目录）。

## Features

- API-first 导出微信读书划线与想法
- 支持单本 / 多本导出
- 支持手动 cookie 与浏览器自动提取 cookie
- 支持增量同步与 merge 统计（新增 / 更新 / 保留 / 删除）
- 已删除内容归档到 `## 已删除`
- 输出 Obsidian-friendly frontmatter
- 支持自定义 frontmatter tags

## Install

```bash
cd ~/.openclaw/workspace/tools/weread-import
npm install
```

## Quick Start

### Import one book

```bash
cd ~/.openclaw/workspace/tools/weread-import
node ./src/weread-import.mjs --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading"
```

### Import all books

```bash
cd ~/.openclaw/workspace/tools/weread-import
node ./src/weread-import.mjs --all --mode api --cookie-from browser --output "/path/to/Reading"
```

### Force re-render an existing file

```bash
cd ~/.openclaw/workspace/tools/weread-import
node ./src/weread-import.mjs --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading" --force
```

### Override frontmatter tags

```bash
cd ~/.openclaw/workspace/tools/weread-import
node ./src/weread-import.mjs --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading" --tags "reading/weread,book"
```

## Configuration

### Output directory

默认输出到当前命令目录下：

```bash
./out/weread
```

也可以通过环境变量指定：

```bash
WEREAD_OUTPUT="/path/to/Reading"
```

### Cookie options

#### Manual cookie

```bash
WEREAD_COOKIE='完整 cookie' node ./src/weread-import.mjs --book "自卑与超越" --mode api
```

或：

```bash
node ./src/weread-import.mjs --book "自卑与超越" --mode api --cookie '完整 cookie'
```

#### Browser cookie extraction

前提：你已经在带远程调试端口的 Chrome 中登录了微信读书。

```bash
node ./src/weread-import.mjs --book "自卑与超越" --mode api --cookie-from browser
```

如果远程调试端口不是默认值：

```bash
node ./src/weread-import.mjs --book "自卑与超越" --mode api --cookie-from browser --cdp http://127.0.0.1:9222
```

#### Guided manual retrieval

- 登录 <https://weread.qq.com/>
- 打开开发者工具
- 找到任一 `weread.qq.com` 请求
- 复制完整 `Cookie` request header

### Frontmatter tags

默认值：

```bash
WEREAD_TAGS=reading,weread
```

也可以覆盖：

```bash
WEREAD_TAGS="reading/weread,book"
```

## Common Parameters

- `--all`：抓取全部书
- `--book <标题>`：只抓取匹配标题的一本书
- `--book-id <ID>`：按书籍 ID 导入
- `--output <目录>`：自定义输出目录
- `--cookie <cookie>`：命令行直接传 cookie
- `--cookie-from <manual|browser>`：cookie 来源策略
- `--mode <auto|api|dom>`：抓取模式，默认 `auto`
- `--cdp <url>`：CDP 地址，默认 `http://127.0.0.1:9222`
- `--limit <n>`：最多处理多少本书
- `--force`：即使远端数据未变化，也强制重渲染当前文件
- `--tags <a,b,c>`：覆盖 frontmatter 里的 tags 列表

## Sync Behavior

当前会在输出目录中维护 `.weread-import-state.json`，用于增量同步。

已支持：

- 基于 `lastNoteUpdate` 的跳过逻辑
- 基于 `bookmarkId` / `reviewId` 的状态跟踪
- merge 结果分类：新增 / 更新 / 保留 / 删除
- 删除内容归档到 `## 已删除`
- 对旧输出目录回退解析现有 Markdown，兼容更新检测

如果微信读书 API 返回业务错误（例如登录超时），CLI 会直接失败，而不会静默导出空结果。

## Output Structure

导出结果包含：

- YAML frontmatter
  - `title`
  - `author`
  - `bookId`
  - `source`
  - `lastNoteUpdate`
  - `highlightCount`
  - `reviewCount`
  - `tags`
- `# 书名`
- `## 划线`（仅当存在划线时生成）
- `## 想法`（仅当存在想法时生成）
- `## 已删除`（仅当存在已删除内容时生成）

细节约定：

- frontmatter 承担结构化元信息，正文不再重复 `## 元信息`
- `划线` / `想法` 按章节名组织
- 已删除内容按 `### 划线/想法 -> #### 章节名` 组织
- `bookmarkId` / `reviewId` / `time` / `chapterUid` 使用隐藏注释，兼顾阅读与 diff / merge
- 空内容不输出占位文本，空块自动跳过

示例输出见：`examples/sample-output.md`

## Files

- `src/weread-import.mjs`：主 CLI
- `scripts/open-chrome-debug.sh`：启动带远程调试端口的 Chrome
- `TEMPLATE.md`：当前目标输出模板
- `examples/sample-output.md`：公开示例输出
- `docs/DESIGN.md`：公开设计说明
- `PLAN.md`：简短项目规划锚点
- `skills/weread-import/`：AgentSkill 封装

## Roadmap

### Current focus

- 持续回归验证不同书籍上的划线获取稳定性

### Next

- 输出样式继续打磨
- skill 继续完善
- 开源整理继续收尾（目录、示例、说明）
