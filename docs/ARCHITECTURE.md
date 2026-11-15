# 架构与取舍

## 一句话

**文件即数据库，CLI 即业务层，HTTP 路由即界面。**

## 为什么不是数据库 / 不是现成笔记应用

- 数据要能被 `read` / `grep` / CLI 直接看，agent 才能低成本地读写；SQLite 或第三方 schema
  要么需要额外工具链，要么把数据锁在别人的模型里。
- `git diff` 天然就是审计日志和备份，不需要再写一套版本机制。
- 自建 bundle 不注册任何模型可见工具（tool schema 每轮都占上下文），只在 Host 侧加 HTTP 路由，
  对 token 预算零影响。

## 分层

```
ui/index.html  ──fetch──▶  index.js (Host 半)  ──execFile──▶  scripts/wb.mjs  ──▶  data/*
    浏览器                    DSH webServer                         唯一业务逻辑
```

- **数据层**：`data/*.jsonl`（一行一条，append 友好，diff 可读）、`data/goals.json`（整体重写）、
  `data/reviews/*.md`（人类可读产物）。
- **业务层**：`scripts/wb.mjs` 一个文件搞定读、算、写、渲染文本。统计口径只在这里实现一次，
  UI 和 agent 都调用它，避免"两套算法对不上"。
- **Host 半**：`index.js` 只做三件事——把请求翻译成 CLI 参数、把 stdout JSON 回传、把 HTML 文件吐出去。
  它不碰数据文件，所以不存在两处写逻辑打架的问题。
- **界面**：单文件 HTML + 原生 JS，无构建、无依赖。改完刷新即生效，这是"低 token 迭代"的关键：
  不需要 `pnpm build`，不需要重启。

## 关键取舍

| 需求 | 选择 | 放弃的方案及原因 |
| --- | --- | --- |
| 面板位置 | DSH Host 注册 `/workbench` 路由，浏览器打开 | 原生 `conversation.view` slot：需要 Typert codegen 的 snapshot/Location 装配，外部插件成本过高 |
| 数据格式 | JSONL + JSON + Markdown | SQLite：agent 读写要额外协议；YAML：缩进易错、diff 吵 |
| 统计 | CLI 现算，不缓存 | 预聚合表：多一份要维护的真相 |
| 周口径 | ISO 周（周四定年，`2026-W46`） | 自然周：跨年时统计会错位 |
| 写文件 | `.tmp` + `rename` 原子替换 | 直接 `writeFileSync`：崩溃会截断数据 |
| 时间 | 本地时间字符串 `HH:MM` + `YYYY-MM-DD` | UTC 时间戳：自用工作台不需要时区换算 |

## 接口

Host 注册两条路由（`ctx.webServer.register`，`kind` 为 `exact` / `prefix`）：

- `GET /workbench` → `ui/index.html`
- `/workbench/api/*`：
  - `GET  /state` 全量状态（today/week/month/year/goals/notes）
  - `GET  /search?q=` 全库检索
  - `POST /event | /note | /goal | /progress | /done | /review`

POST 必须用 `handler(req, res)` 形式；`resource()` 形式只服务 GET/HEAD。

## 数据模型

```ts
type Event = { id: string; date: string; start?: string; end?: string; title: string;
  category: 'work'|'study'|'health'|'life'|'rest'|'other'; tags: string[];
  note?: string; status: 'planned'|'done'; created: string }

type Note = { id: string; ts: string; kind: 'note'|'idea'|'link'|'quote';
  text: string; tags: string[]; source?: string }

type Goal = { id: string; title: string; horizon: 'year'|'quarter'|'month'; area?: string;
  target?: number; unit?: string; progress: number; due?: string; why?: string;
  status: 'active'|'done'|'dropped'; created: string; updated: string }
```

`id` = 前缀 + 36 进制时间戳（后 5 位）+ 3 位随机，例 `ev-fa35cyfu`。前缀/后缀匹配用于命令行输入。

## 扩展方向

1. 日程重复规则（每周/每天）：在 `wb.mjs` 里展开成虚拟实例，不落盘。
2. 周复盘提醒：用 DSH 内置 `schedule_create` 定时给会话发消息，不需要写进本仓库。
3. 原生侧栏面板：等 DSH 提供更简的外部 View 注册方式再做。
4. 与 GitHub Issues 同步：读 issues 生成 goal，仍是文件写入。
