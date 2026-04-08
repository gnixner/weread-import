---
name: weread-import
description: Export WeRead highlights and notes into Markdown files, usually into an Obsidian Reading folder. Use when the user asks to import or sync WeRead books, re-render exported notes after template or merge changes, verify deleted/archive behavior, update frontmatter tags, or run WeRead export with browser cookie extraction or manual cookie input.
---

# weread-import

通过 `scripts/run.sh` 运行 CLI。首次执行时会自动安装依赖。

## 默认策略

1. 使用 `--mode api`，API 数据完整（author、bookId、highlightCount 等元数据齐全）。
2. 已有外部 Chrome CDP 且已登录微信读书时，优先使用 `--cookie-from browser-live`。
3. 需要隔离会话、避免影响主浏览器其他站点 web 登录时，使用 `--cookie-from browser-managed`。
4. 无浏览器时，通过环境变量 `WEREAD_COOKIE` 提供 Cookie。
5. 修改模板、合并逻辑或 frontmatter 后，先输出到临时目录验证。
6. 验证通过后，再对真实目录执行。
7. 目的是重新渲染或验证时，加上 `--force` 跳过增量检查。

详细命令模板见 `references/workflows.md`。

## 推荐命令

```bash
# 导入单本书
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser-managed --output "/path/to/Reading"

# 导入全部书
bash ./scripts/run.sh --all --mode api --cookie-from browser-managed --output "/path/to/Reading"

# 强制重新渲染
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser-managed --output "/path/to/Reading" --force

# 覆盖 frontmatter tags
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser-managed --output "/path/to/Reading" --tags "reading/weread,book"
```

## 可用参数

- `--all`
- `--book <title>`
- `--book-id <id>`
- `--output <dir>`
- `--mode <api>`
- `--cookie <cookie>`
- `--cookie-from <manual|browser-live|browser-managed>`
- `--force`
- `--tags <a,b,c>`

## 定时任务

定时 / 自动执行场景下，必须严格遵守以下规则。

### 固定命令

```bash
bash ./scripts/run.sh --all --mode api --cookie-from browser-managed --output "/path/to/Reading"
```

原样执行，禁止修改参数。不要添加 `--force`、不要替换浏览器模式为硬编码 cookie、不要省略 `--output`。

### 前置条件

- `browser-live` 需要外部 Chrome CDP 已运行且已登录微信读书。
- `browser-managed` 会自动拉起隔离浏览器；首次需要用户在该独立窗口里登录微信读书。
- 如果 CDP 未运行或登录已过期，命令会以非零 exit code 退出 — 这是预期行为，不要尝试修复。

### 禁止事项

- 禁止加 `--force` — 增量跳过是定时场景的正确行为，不是 bug。
- 禁止用 `--cookie '...'` 硬编码 cookie — cookie 会过期，应优先使用浏览器模式。
- 禁止在失败后自行重试、变更参数、或尝试其他方式绕过错误。

### 错误处理

- exit code 0 = 成功，直接报告结果。
- exit code 非 0 = 失败，将完整错误输出报告给用户，不做任何额外操作。
- 鉴权失败时，不要立刻断言用户已退出登录。先按 `references/workflows.md` 的验证流程区分登录态、CDP 环境和浏览器上下文问题。

## 运行须知

- `run.sh` 在 `browser-managed` 下会自动拉起隔离 Chrome；`browser-live` 下只校验外部 CDP，不会自动拉起浏览器。
- Chrome 146+ 要求非默认 `--user-data-dir` 才能开启远程调试，`open-chrome-debug.sh` 会自动处理。
- `browser-managed` 默认使用 `~/.weread-import-profile-isolated`，不会同步默认 Chrome 的整份登录态。
- `browser` 仍然可用，但仅作为 `browser-managed` 的兼容别名。
- 如需保留旧的整份 profile 同步行为，显式设置 `WEREAD_PROFILE_SYNC_MODE=legacy`。
- 浏览器 cookie / 浏览器上下文请求在 CDP 会话结束后会正确关闭 Playwright 连接，不会关闭用户自己的 Chrome。
- API 请求自动附加时间戳防缓存，减少因 CDN 缓存导致的鉴权失败。
- API 鉴权失败会自动刷新当前 session 重试；浏览器模式下的书籍详情接口会复用浏览器上下文。
- 合并统计支持新增 / 更新 / 保留 / 删除四种分类。
- 被删除的条目会归档到 `## 已删除`，而非直接丢弃。
- 元信息由 YAML frontmatter 承载，正文中不重复。
- Skill 在脚本层面自包含，但运行环境需提供 Node.js 和 Playwright。

## 环境变量

参见 `env.example.md`。

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WEREAD_COOKIE` | 手动 Cookie | - |
| `WEREAD_IMPORT_MODE` | 导出模式 | `api` |
| `WEREAD_CDP_URL` | Chrome CDP 地址 | `http://127.0.0.1:9222` |
| `WEREAD_OUTPUT` | 输出目录 | `./out/weread` |
| `WEREAD_TAGS` | Frontmatter tags | `reading,weread` |
| `WEREAD_USER_AGENT` | 自定义 UA | Chrome 146 |

## 资源

- GitHub: https://github.com/gnixner/weread-import

### scripts/
- `scripts/run.sh`：Skill 执行入口（首次自动安装依赖；`browser-managed` 自动拉起隔离 Chrome，`browser-live` 只校验外部 CDP）
- `scripts/open-chrome-debug.sh`：启动隔离的 Chrome 远程调试；`legacy` 模式下才同步默认 Profile 登录态
- `scripts/prepare-staging-skill.sh`：生成隔离的 staging skill 目录，供发版前安装态验证使用

### references/
- `references/workflows.md`：推荐工作流、验证流程与常见问题处理
