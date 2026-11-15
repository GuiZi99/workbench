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

## 已安装 / 已验证（2026-11-15）

- 安装方式：`install_bundle` 以 `link:` 指向本目录，profile `desktop` 的 `dsh.profile.bundles`
  末尾追加了 `@local/dsh-workbench`；pnpm 建立符号链接 `profiles/desktop/node_modules/@local/dsh-workbench`。
- 验证：`GET /workbench` → 200（19875 字节）；`GET /workbench/api/state` → 200；
  `/event`、`/goal`、`/note`、`/progress`、`/done`、`/review`、`/search` 全部 200 且数据正确写入。
- 链接安装意味着**改本目录文件即时生效**（`ui/index.html`、`scripts/wb.mjs` 无需重启；
  `index.js` 需要重启 DSH）。
- seed 数据已清空，仓库首条提交是干净状态。

## 下一步

1. GitHub 私有仓库（SSH）推送：需先在 GitHub 添加 `~/.ssh/id_ed25519.pub` 公钥并建空仓库。
2. 日常使用后按周生成复盘（`review week --write`），看是否需要在界面里加趋势图。
3. 目标周检查提醒：用 DSH 内置 `schedule_create` 每周一推一条消息进会话，不写进本仓库。

## 备份 / 待办

- v2 候选：日程重复规则、目标周检查提醒（可用 `schedule_create` 定时提醒）、
  原生 DSH 侧栏面板（需要 Typert codegen，成本高）、导出为周报 Markdown 汇总。
- 已知限制：Host 半改动需重启 DSH；`/workbench` 无鉴权（仅绑定 127.0.0.1）。

## 坑

- 本机 `npm` 被执行策略拦（用 `npm.cmd`），但本仓库零依赖，不需要 npm。
- 写文件必须 UTF-8 无 BOM；PowerShell 5 的 `Set-Content -Encoding utf8` 会加 BOM。
