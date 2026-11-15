# STATE — 交接单

> 每次改动结束前更新这一页。下一轮会话只读 `AGENTS.md` + 本页即可继续。

## 当前版本

- v1.0.0 —— 2026-11-15
- 形态：DSH bundle `@local/dsh-workbench`（host 半注册 HTTP 路由）+ 浏览器单页 + CLI 数据层。
- 入口：`http://127.0.0.1:51049/workbench`（DSH Web 已启动时）。

## 已完成

- CLI `scripts/wb.mjs`：today / state / stats(week|month|year) / review / add(event|note|goal) /
  log / done / list / search / check。零依赖，原子写，去 BOM，ISO 周。
- 数据层：`data/events.jsonl`、`data/notes.jsonl`、`data/goals.json`、`data/reviews/*.md`。
- Host 半 `index.js`：`/workbench`（页面）、`/workbench/api/{state,search,event,note,goal,progress,done,review}`。
- UI `ui/index.html`：今日 / 目标 / 记录 / 检索 / 统计五个页签，浅色深色跟随系统。
- 文档：`AGENTS.md`、`README.md`、`docs/ARCHITECTURE.md`、`docs/DETAIL.md`。
- 插件元数据：`package.json`、`cordis.patch.yml`、`locale/zh.json`、`locale/en.json`、`icon.svg`。

## 进行中 / 下一步

1. `git init` + 首次提交 + GitHub 私有仓库（SSH）推送。
2. 安装 bundle 到 desktop profile 并验证 `/workbench/api/state` 返回 200。
3. 清掉 seed 数据（`data/` 里的示例日程/目标/笔记），换成真实使用。

## 备份 / 待办

- v2 候选：日程重复规则、目标周检查提醒（可用 `schedule_create` 定时提醒）、
  原生 DSH 侧栏面板（需要 Typert codegen，成本高）、导出为周报 Markdown 汇总。
- 已知限制：Host 半改动需重启 DSH；`/workbench` 无鉴权（仅绑定 127.0.0.1）。

## 坑

- 本机 `npm` 被执行策略拦（用 `npm.cmd`），但本仓库零依赖，不需要 npm。
- 写文件必须 UTF-8 无 BOM；PowerShell 5 的 `Set-Content -Encoding utf8` 会加 BOM。
