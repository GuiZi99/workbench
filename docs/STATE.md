# STATE — 交接单

> 每次改动结束前更新这一页。下一轮会话只读 `AGENTS.md` + 本页即可继续。

## 当前版本

- v1.5.0 —— 2026-11-19（手机访问：装进 `web` profile + Tailscale 绑定 + 登录自启）
- v1.4.0 —— 2026-11-16（统计口径：只有「已完成」的日程才计入投入工时）
- v1.3.0 —— 2026-11-16（新增「日程」历史页：跨日期查看 / 检索 / 改 / 删）
- v1.2.0 —— 2026-11-15（日程可改可删；时间改为小时/分钟下拉选择）
- v1.1.0 —— 2026-11-15（UI 改版：玻璃拟态仪表盘风格）
- 形态：DSH bundle `@local/dsh-workbench`（host 半注册 HTTP 路由）+ 浏览器单页 + CLI 数据层。
- 入口：`http://127.0.0.1:51049/workbench`（DSH Web 已启动时）。

## 已完成

- CLI `scripts/wb.mjs`：today / state / stats(week|month|year) / review / add(event|note|goal) /
  edit / del / log / done / list / search / check。零依赖，原子写，去 BOM，ISO 周。
  - `edit <id> [--title --date --start --end --category --tag --note --status]`：
    时间用 `HH:MM` 校验（越界/非法直接报错），`--end` 早于 `--start` 报错，空字符串表示清空。
  - `del <id>`：日程软删除（`deleted`+`deletedAt`，统计与检索自动跳过）、记录物理删除、
    目标改 `status='dropped'`（UI 目标列表只显示 active）。
  - `list events [--from D] [--to D] [--q 词] [--limit N | --all] [--json]`（默认 20 条，
  `--all` 不限；`--q` 匹配标题/备注/标签/分类）；`list goals|notes [--json]`。
  id 支持前缀/后缀匹配。
- 数据层：`data/events.jsonl`、`data/notes.jsonl`、`data/goals.json`、`data/reviews/*.md`。
- **统计口径（v1.4.0 起）**：只有 `status === 'done'` 的日程计入投入工时
  （`summarize()` 里 `doneEvents` 过滤后算 `total` / `byCat` / `byTag` / `byDay`）；
  `count` 仍是该周期全部日程数，`done` 是已完工数。KPI、统计页、复盘 Markdown、
  日程历史页的每日合计都用这个口径，未点「完成」的日程只占数、不计时。
- Host 半 `index.js`：`/workbench`（页面）、`/workbench/api/{state,search,event,event/update,event/delete,note,goal,progress,done,review}`。
- UI `ui/index.html`：左侧图标导航（今日/目标/记录/检索/统计）+ 顶部 KPI 卡片行 +
  右侧内容区；玻璃卡片、柔和渐变背景、浅色深色跟随系统。统计页含 SVG 折线趋势、
  conic-gradient 分类环图、每日条形分布、标签投入。
- 日程编辑：今日列表每条带「改 / 删」按钮，「改」打开 `#evModal` 弹窗（标题、日期、
  起止时间、分类、标签、备注），Esc / 点遮罩可关闭；时间输入是小时 + 分钟两个 `<select>`
  （`fillTimeSelects()` 生成 24 小时 × 5 分钟步进，`readTime()` 读值，`setTime()` 回填）。
  「删」走 `confirm()` 后软删除。
- 日程历史页（tab `schedule`，`#pane-schedule`）：起止日期 + 关键词 + 预设
  （本周 / 本月 / 上月 / 近 30 天 / 全部）+「回到今天」；结果按日期倒序分组，每组显示
  条数与合计时长，行内同样带「完成 / 改 / 删」。数据走 `GET /workbench/api/events`
  → `list events --json`。`openEdit()` / 删除确认用 `allEvents()`（今日 + 历史两份合并按 id 查），
  所以历史日程也能直接改（含改日期改到别的日子）。数据改动后统一走 `refreshAll()`。
- UI 设计变量集中在 `ui/index.html` 顶部 `:root`（`--card`、`--brand` `#3056d3`、
  `--radius: 18px`、`--shadow`；分类色 `CAT_COLORS` 在脚本里）。改配色只动这两处。
- 文档：`AGENTS.md`、`README.md`、`docs/ARCHITECTURE.md`、`docs/DETAIL.md`。
- 插件元数据：`package.json`、`cordis.patch.yml`、`locale/zh.json`、`locale/en.json`、`icon.svg`。

## 已安装 / 已验证（2026-11-15）

- 安装方式：`install_bundle` 以 `link:` 指向本目录，profile `desktop` 的 `dsh.profile.bundles`
  末尾追加了 `@local/dsh-workbench`；pnpm 建立符号链接 `profiles/desktop/node_modules/@local/dsh-workbench`。
- 验证：`GET /workbench` → 200（19875 字节）；`GET /workbench/api/state` → 200；
  `/event`、`/goal`、`/note`、`/progress`、`/done`、`/review`、`/search` 全部 200 且数据正确写入。
- 链接安装意味着**改本目录文件即时生效**：`ui/index.html`、`scripts/wb.mjs` 刷新页面即可。
  `index.js`（host 半）不会自动热重载，**也不必重启 DSH** —— 用
  `plugin_manager` `set_plugin` target=`include:workbench` 先 `enabled:false` 再 `enabled:true`
  （两次都返回 `application: "applied"`），新路由立刻生效。
- seed 数据已清空，仓库首条提交是干净状态。

## 远程仓库

- `origin` = `git@github.com:GuiZi99/workbench.git`（私有，SSH）。
- 分支 `main` 已跟踪 `origin/main`，2026-11-15 首次推送成功并验证远端 HEAD 一致。
- 提交身份：`GuiZi99 <GuiZi99@users.noreply.github.com>`（本机全局 git 配置已同步改为此）。
- 沙箱注意：`git push` 会调 ssh，在 workspace-write 模式下报
  `ssh.exe: fatal error - couldn't create signal pipe, Win32 error 5`，
  需要提权到 `danger-full-access` 才能推。

## 手机访问与自启（v1.5.0）

- 第二套入口：`web` profile（`C:\Users\SHmylike\.dsh\profiles\web`），已 link 本仓库并写进
  `dsh.profile.bundles`；它与桌面版（127.0.0.1:51049）**共用同一个 `data/`**（bundle 用 `link:` 指向本目录）。
- 监听：`dsh web --profile web --host 100.86.27.36 --port 3080 --no-open`，只绑 Tailscale IPv4
  （`dsh-desktop`，账号 `961831445@`）。手机装 Tailscale App 登录同账号后访问
  `http://100.86.27.36:3080/?token=...`；token 每次启动重新生成，写进 `logs/web.out.log`。
- 自启：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Workbench Web.vbs`
  → `workbench\scripts\start-web.vbs`（无窗口）→ `scripts\start-web.ps1`。
  脚本幂等（端口在听就退出）、自动取当前 Tailscale IPv4（最多等 90s）、日志超 2 MB 轮转。
  日志：`logs\web.log`（启动器）、`logs\web.out.log`（含 token，已 gitignore）。
- 前置条件：必须在**登录 Windows 之后**才启动（Startup 文件夹随登录触发），且 Tailscale 服务在跑。
- 卸掉自启：删除 Startup 里那个 `Workbench Web.vbs`。

## 下一步

1. 日常使用后按周生成复盘（`review week --write`）；界面趋势图已就绪，观察是否需要按月对比。
2. 目标周检查提醒：用 DSH 内置 `schedule_create` 每周一推一条消息进会话，不写进本仓库。
3. 改进流程：`git switch -c feat/xxx` → 改 → `node scripts/wb.mjs check` → 合并回 `main` → push。

## 备份 / 待办

- v2 候选：日程重复规则、目标周检查提醒（可用 `schedule_create` 定时提醒）、
  原生 DSH 侧栏面板（需要 Typert codegen，成本高）、导出为周报 Markdown 汇总。
- 已知限制：Host 半改动需重启 DSH；`/workbench` 无鉴权（桌面版绑 127.0.0.1，手机版绑 Tailscale
  IPv4，靠 tailnet 隔离）；`web` profile 里没有聊天会话数据（只用来跑工作台）。

## 坑

- 本机 `npm` 被执行策略拦（用 `npm.cmd`），但本仓库零依赖，不需要 npm。
- 写文件必须 UTF-8 无 BOM；PowerShell 5 的 `Set-Content -Encoding utf8` 会加 BOM。
- **用 PowerShell 调 API 时中文会变 `?`**：`Invoke-WebRequest -Body $json` 默认不走 UTF-8。
  必须 `[System.Text.Encoding]::UTF8.GetBytes($json)` 作 `-Body`，或写临时 `.json` 用 `-InFile`。
  脚本返回的中文也要用 `New-Object IO.StreamReader($resp.GetResponseStream(),[Text.Encoding]::UTF8)` 读。
  （本条是 2026-11-15 误改一条真实日程后加的：调试写接口时别拿 `state.today.events[0]` 当靶子。）
