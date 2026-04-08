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
import { createWereadBrowserFetcher, wereadFetchJson } from './src/api.mjs';
const cookie = await extractCookieFromBrowser('http://127.0.0.1:9222');
const notebook = await wereadFetchJson('https://weread.qq.com/api/user/notebook', cookie);
const fetcher = await createWereadBrowserFetcher('http://127.0.0.1:9222');
const bookmark = await fetcher.fetchJson('https://weread.qq.com/web/book/bookmarklist?bookId=33628204');
const review = await fetcher.fetchJson('https://weread.qq.com/web/review/list?bookId=33628204&listType=4&syncKey=0&mine=1');
console.log({
  books: Array.isArray(notebook.books) ? notebook.books.length : null,
  bookmarkUpdated: Array.isArray(bookmark.updated) ? bookmark.updated.length : null,
  reviewCount: Array.isArray(review.reviews) ? review.reviews.length : null,
});
await fetcher.close();
"
```

说明：

- `api/user/notebook` 这类接口可直接用 Node 请求 + cookie 验证
- `bookmarklist`、`review/list` 这类书籍详情接口，在 `--cookie-from browser` 场景下应复用浏览器上下文验证

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

### 0.4 本地 staging 安装态验证

目的：确认当前修复在“安装后的 skill 目录”里也可用，而不是只在 repo 工作树里可用。

规则：

- 先从当前 repo 生成一个隔离的 staging skill 目录
- 在 staging 目录中执行，与真实运行命令尽量保持一致
- 输出目录仍然使用 `/tmp/...`
- 不要直接覆盖正在服役的正式 skill 安装目录

示例：

```bash
STAGING_DIR="$(bash ./scripts/prepare-staging-skill.sh)"
OUT=$(mktemp -d /tmp/weread-staging-verify.XXXXXX)
bash "$STAGING_DIR/scripts/run.sh" \
  --all \
  --mode api \
  --cookie-from browser \
  --output "$OUT"
```

如果你还需要验证某个具体 agent 平台的安装态，可以在 staging 验证通过后，再额外补一轮该平台的 smoke test；但默认发版门槛不依赖某一个特定 agent。

### 0.5 只有全部通过后才发版

发版前必须同时满足：

1. `node --test` 通过
2. 本地真机 API 探针通过
3. 本地真机完整导出通过
4. 本地 staging 安装态验证通过

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
4. 若仍失败，先按 `0.2` 的 API 探针区分是 cookie 问题、浏览器上下文问题，还是 CDP/环境问题

### 避免影响正式笔记

先输出到 `/tmp/...` 临时目录验证，确认格式无误后再写入正式目录。
