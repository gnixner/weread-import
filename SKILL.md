---
name: weread-import
description: Export WeRead highlights and notes into Markdown files, usually into an Obsidian Reading folder. Use when the user asks to import or sync WeRead books, re-render exported notes after template or merge changes, verify deleted/archive behavior, update frontmatter tags, or run WeRead export with browser cookie extraction or manual cookie input.
---

# weread-import

通过 `scripts/run.sh` 运行 CLI。首次执行时会自动安装依赖。

## 默认策略

1. 优先使用 `--mode api`。
2. 有 Chrome 远程调试会话时，优先使用 `--cookie-from browser`。
3. 修改模板、合并逻辑或 frontmatter 后，先输出到临时目录验证。
4. 验证通过后，再对真实目录执行。
5. 目的是重新渲染或验证时，加上 `--force` 跳过增量检查。

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

- 浏览器 cookie 提取依赖运行中的 Chrome 远程调试会话（默认 `http://127.0.0.1:9222`）。
- 合并统计支持新增 / 更新 / 保留 / 删除四种分类。
- 被删除的条目会归档到 `## 已删除`，而非直接丢弃。
- 元信息由 YAML frontmatter 承载，正文中不重复。
- API 返回业务错误（如登录过期）时会直接报错，不会静默导出空结果。
- Skill 在脚本层面自包含，但运行环境需提供 Node.js 和 Playwright。

## 资源

### scripts/
- `scripts/run.sh`：Skill 执行入口（首次自动安装依赖）
- `scripts/open-chrome-debug.sh`：启动 Chrome 远程调试的辅助脚本

### references/
- `references/workflows.md`：推荐工作流、验证流程与常见问题处理
