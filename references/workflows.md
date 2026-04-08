# weread-import 工作流

## 0. 发版前验证流程

适用场景：准备提交、打 tag、发 GitHub release 或上传 ClawHub 之前。

这是默认流程，不是可选流程。发版前必须先完成验证。

### 0.1 自动测试

```bash
node --test
```

### 0.2 本地真机 API 探针

目的：确认当前 repo 代码在真实 Chrome CDP 和真实微信读书会话下可用。

只读验证示例：

```bash
node --input-type=module -e "
import { extractCookieFromBrowser } from './src/cookie.mjs';
import { wereadFetchJson } from './src/api.mjs';
const cookie = await extractCookieFromBrowser('http://127.0.0.1:9222');
const notebook = await wereadFetchJson('https://weread.qq.com/api/user/notebook', cookie);
const bookmark = await wereadFetchJson('https://weread.qq.com/web/book/bookmarklist?bookId=33628204', cookie);
const review = await wereadFetchJson('https://weread.qq.com/web/review/list?bookId=33628204&listType=4&syncKey=0&mine=1', cookie);
console.log({
  books: Array.isArray(notebook.books) ? notebook.books.length : null,
  bookmarkUpdated: Array.isArray(bookmark.updated) ? bookmark.updated.length : null,
  reviewCount: Array.isArray(review.reviews) ? review.reviews.length : null,
});
"
```

### 0.3 本地真机完整导出

目的：确认当前 repo 代码跑完整导出时没有真实环境问题。

规则：

- 输出目录必须使用 `/tmp/...`
- 不要直接写正式 Reading 目录

示例：

```bash
OUT=$(mktemp -d /tmp/weread-verify.XXXXXX)
bash ./scripts/run.sh --all --mode api --cookie-from browser --output "$OUT"
```

### 0.4 OpenClaw 本地安装态验证

目的：确认 bot 实际运行的 skill 安装态和当前修复一致。

规则：

- 在 OpenClaw 的 skill workspace 中执行
- 命令尽量与 bot 实际执行命令保持一致
- 输出目录仍然使用 `/tmp/...`

示例：

```bash
OUT=$(mktemp -d /tmp/weread-openclaw-verify.XXXXXX)
bash "<openclaw-skill-workspace>/scripts/run.sh" \
  --all \
  --mode api \
  --cookie-from browser \
  --output "$OUT"
```

其中 `<openclaw-skill-workspace>` 表示 OpenClaw 当前安装的 `weread-import` skill 工作目录。

### 0.5 只有全部通过后才发版

发版前必须同时满足：

1. `node --test` 通过
2. 本地真机 API 探针通过
3. 本地真机完整导出通过
4. OpenClaw 本地安装态验证通过

只有这 4 项都通过，才允许：

1. 提交代码
2. bump 版本号
3. 打 tag
4. 发 GitHub release
5. 上传 ClawHub

## 1. 首次导入

适用场景：已确定输出目录，将微信读书笔记导入到 Obsidian 或其他目录。

```bash
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading"
```

## 2. 临时验证后再写入正式目录

适用场景：修改了模板、合并逻辑、frontmatter 或 tags，需要先确认输出格式。

先输出到临时目录：

```bash
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser --output /tmp/weread-verify --force
```

确认无误后，写入正式目录：

```bash
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading" --force
```

## 3. 重新渲染已有文件

适用场景：模板、frontmatter、tags 或删除归档逻辑发生变化后，需要重新生成。

```bash
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading" --force
```

## 4. 自定义 frontmatter tags

通过命令行参数：

```bash
bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading" --tags "reading/weread,book"
```

或通过环境变量：

```bash
WEREAD_TAGS="reading/weread,book" bash ./scripts/run.sh --book "自卑与超越" --mode api --cookie-from browser --output "/path/to/Reading"
```

## 5. 定时同步

适用场景：通过 cron 或 agent 定时任务自动同步全部书籍。

```bash
bash ./scripts/run.sh --all --mode api --cookie-from browser --output "/path/to/Reading"
```

注意事项：
- 不加 `--force`，依赖增量机制跳过无变化的书籍
- 必须使用 `--cookie-from browser`，不要硬编码 cookie
- 前提是 Chrome CDP 运行中且已登录微信读书
- 失败时直接报告错误，不要重试或变更参数

## 6. 常见问题

### 登录过期 / 业务错误

表现：CLI 报错，提示业务错误、登录过期或浏览器中无可用 cookie。

处理步骤：
1. 确认 Chrome 远程调试实例仍在运行
2. 确认该实例中已登录微信读书
3. 重新执行 `--cookie-from browser`
4. 若仍失败，改用 `--cookie '...'` 手动传入

### 避免影响正式笔记

先输出到 `/tmp/...` 临时目录验证，确认格式无误后再写入正式目录。
