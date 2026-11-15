# AGENTS.md — 工作台开发约定

这个仓库是一个**自用工作台**：日程、目标、记录、检索、时间统计。数据是仓库里的文件，
不需要数据库；`git` 既是备份也是审计。

## 省 token 的固定开局（必须遵守）

1. **只读三样东西**：本文件 `AGENTS.md`、`docs/STATE.md`、本次要改的 1–2 个文件。
   不要 ls 全仓、不要读 `data/*.jsonl` 全文。
2. **交接靠 `docs/STATE.md`**：每次改动结束都要更新它（当前状态 / 下一步 / 坑），
   下一轮会话只读它就知道进展。
3. **别在大脑里算**：统计、周归属、检索都调 CLI，只看十几行 stdout。
   `node scripts/wb.mjs stats week` 而不是读全部日程。
4. **检索用 CLI**：`node scripts/wb.mjs search 关键词 --json`，不要 grep data/ 再拼接。
5. **一次改进一条分支**：`git switch -c feat/xxx`，改完 merge 回 `main` 再 push。
6. **UI 是纯文件**：`ui/index.html` 单文件、无构建步骤。改完刷新 `/workbench` 即生效。
7. **不新增模型可见工具**：这个 bundle 只注册 HTTP 路由，不给 agent 加 tool schema。

## 结构

```
workbench/
  AGENTS.md              本文件（约定 + 命令速查）
  README.md              给人看的说明
  docs/ARCHITECTURE.md   设计取舍与数据模型
  docs/STATE.md          交接单（每次改动必须更新）
  docs/DETAIL.md         插件详情页内容
  scripts/wb.mjs         唯一的业务逻辑（CLI，零依赖）
  index.js               Host 半：注册 /workbench 与 /workbench/api
  ui/index.html          浏览器端单页（今日/目标/记录/检索/统计）
  data/events.jsonl      日程，一行一条
  data/notes.jsonl       记录，一行一条
  data/goals.json        目标数组
  data/reviews/*.md      复盘 Markdown
```

## 命令速查

```powershell
node scripts/wb.mjs today                 # 今日安排 + 进行中目标
node scripts/wb.mjs today --json          # 同上，机器可读
node scripts/wb.mjs stats week            # 本周统计（也支持 month / year）
node scripts/wb.mjs stats month --json
node scripts/wb.mjs search 周报 --json    # 全库检索
node scripts/wb.mjs review week --write   # 生成 data/reviews/week-<key>.md
node scripts/wb.mjs add event --title "写方案" --start 09:00 --end 10:30 --category work
node scripts/wb.mjs add note --text "想法" --kind idea --tags 工作台
node scripts/wb.mjs add goal --title "跑完 500 公里" --target 500 --unit km --due 2026-12-31
node scripts/wb.mjs log <id前缀> --add 5  # 目标推进；--set 覆盖
node scripts/wb.mjs done <id前缀>         # 日程标记完成
node scripts/wb.mjs list goals
node scripts/wb.mjs check                 # 数据自检（JSON 可解析、字段齐全）
```

参数既支持 `--key value` 也支持 `--key=value`；id 支持前缀/后缀匹配。

## 数据模型

- event：`{id,date,start,end,title,category,tags[],note,status:'planned'|'done',created}`
- note：`{id,ts,kind:'note'|'idea'|'link'|'quote',text,tags[],source}`
- goal：`{id,title,horizon:'year'|'quarter'|'month',area,target,unit,progress,due,why,status,created,updated}`
- 分类固定：`work|study|health|life|rest|other`（中文映射在 `wb.mjs` 的 `CAT_CN`）。
- 周归属用 ISO 周（`2026-W46`），周四定年。

## 改完必须验证

```powershell
node scripts/wb.mjs check                                   # 数据层
Invoke-WebRequest http://127.0.0.1:51049/workbench -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest 'http://127.0.0.1:51049/workbench/api/state' -UseBasicParsing | Select-Object StatusCode
```

Host 半改动（`index.js`）需要重启 DSH 才生效；`ui/index.html` 与 `scripts/wb.mjs` 改动即时生效。

## 已知的坑

- PowerShell 5 的 `Set-Content -Encoding utf8` 会写 BOM，`wb.mjs` 的 `readText` 已去 BOM；
  新写的文件请用 UTF-8 无 BOM。
- `npm` 在本机被执行策略拦，脚本里用 `npm.cmd`（本仓库不需要 npm，零依赖）。
- 写 JSONL 必须原子（`.tmp` + rename），并发读时不要截断文件。
- 不要手工编辑 `data/*.jsonl` 的时间戳字段，`created` 只写一次。
