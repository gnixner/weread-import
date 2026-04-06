# weread-import 工作流

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
