---
name: weread-import
description: Export WeRead highlights and notes into Markdown files, usually into an Obsidian Reading folder. Use when the user asks to import or sync WeRead books, re-render exported notes after template or merge changes, verify deleted/archive behavior, update frontmatter tags, or run WeRead export with browser cookie extraction or manual cookie input.
---

# weread-import

通过 `scripts/run.sh` 运行 CLI。首次执行时会自动安装依赖。

## 默认策略

1. 优先使用 `--mode api`，API 数据完整（author、bookId、highlightCount 等元数据齐全）。
2. 有 Chrome 远程调试会话时，优先使用 `--cookie-from browser`，cookie 过期自动刷新。
3. 无浏览器时，通过环境变量 `WEREAD_COOKIE` 提供 Cookie。
4. 定时任务 / 自动执行场景禁止使用 DOM 模式 — DOM 输出缺少结构化元数据、依赖页面结构易碎、速度慢、有垃圾风险。
5. DOM 模式仅作手动兜底：某本书 API 无法获取时，用户主动指定 `--mode dom`。
6. 修改模板、合并逻辑或 frontmatter 后，先输出到临时目录验证。
7. 验证通过后，再对真实目录执行。
8. 目的是重新渲染或验证时，加上 `--force` 跳过增量检查。

详细命令模板见 `references/workflows.md`。

## 推荐命令

```bash
# 导入单本书
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading"

# 导入全部书
bash ./scripts/run.sh --all --mode api --cookie-from browser --output "/path/to/Reading"

# 强制重新渲染
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading" --force

# 覆盖 frontmatter tags
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading" --tags "reading/weread,book"
```

## 可用参数

- `--all`
- `--book <title>`
- `--book-id <id>`
- `--output <dir>`
- `--mode <auto|api|dom>`
- `--cookie <cookie>`
- `--cookie-from <manual|browser>`
- `--force`
- `--tags <a,b,c>`

## 运行须知

- `run.sh` 会自动检测并启动 Chrome CDP，无需手动启动浏览器。
- Chrome 146+ 要求非默认 `--user-data-dir` 才能开启远程调试，`open-chrome-debug.sh` 会自动处理。
- 首次使用 `open-chrome-debug.sh` 时会从默认 Chrome Profile 同步登录态，也可通过 `SYNC_PROFILE=1` 强制重新同步。
- 浏览器 cookie 提取使用 `disconnect()` 而非 `close()`，不会关闭用户的 Chrome。
- API 请求自动附加时间戳防缓存，减少因 CDN 缓存导致的鉴权失败。
- auto 模式下，API 鉴权失败会自动从浏览器刷新 cookie 重试；无浏览器时直接报错，不回退 DOM 产生垃圾。
- DOM 模式写文件前会校验内容有效性，垃圾内容（cookie 字符串、UI 噪音）会被跳过。
- 合并统计支持新增 / 更新 / 保留 / 删除四种分类。
- 被删除的条目会归档到 `## 已删除`，而非直接丢弃。
- 元信息由 YAML frontmatter 承载，正文中不重复。
- Skill 在脚本层面自包含，但运行环境需提供 Node.js 和 Playwright。

## 环境变量

参见 `env.example.md`。

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WEREAD_COOKIE` | 手动 Cookie | - |
| `WEREAD_IMPORT_MODE` | 导出模式 | `auto` |
| `WEREAD_CDP_URL` | Chrome CDP 地址 | `http://127.0.0.1:9222` |
| `WEREAD_OUTPUT` | 输出目录 | `./out/weread` |
| `WEREAD_TAGS` | Frontmatter tags | `reading,weread` |
| `WEREAD_USER_AGENT` | 自定义 UA | Chrome 146 |

## 资源

- GitHub: https://github.com/gnixner/weread-import

### scripts/
- `scripts/run.sh`：Skill 执行入口（首次自动安装依赖，自动启动 Chrome CDP）
- `scripts/open-chrome-debug.sh`：启动 Chrome 远程调试（自动同步默认 Profile 登录态）

### references/
- `references/workflows.md`：推荐工作流、验证流程与常见问题处理
