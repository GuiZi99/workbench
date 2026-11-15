# 工作台

一个给一个人用的工作台：今天的安排、正在推进的目标、随手记下的东西、全部内容的检索，
以及按周/月/年统计的时间分布。数据不是存在某个应用里，而是存在这个仓库的文本文件里。

## 怎么打开

DSH 运行中时，在浏览器打开：

```
http://127.0.0.1:51049/workbench
```

也可以在 DSH 侧栏的浏览器标签里打开同一个地址。页面是单文件，刷新即是最新数据。

## 四个页签

- **今日**：当天日程（点"完成"归档）、右侧快速加日程、下方进行中目标的 +1/+5。
- **目标**：新建目标（季度/年度/月度、目标值、单位、截止、动机），卡片显示进度条。
- **记录**：写一条 note / idea / link / quote，带标签。
- **检索**：一个输入框搜遍日程、记录、目标。
- **统计**：本周 / 本月 / 今年切换，总投入、日程数、完成率、活跃天数、日均，
  分类投入条形图、每日分布、标签投入，一键生成当期复盘 Markdown。

## 数据在哪

```
data/events.jsonl    日程，一行一条，git diff 可读
data/notes.jsonl     记录，一行一条
data/goals.json      目标数组
data/reviews/*.md    生成的复盘
```

想换机器：`git clone` 这个私有仓库就行。想回滚：`git revert`。
想批量改：直接编辑文本或跑 `node scripts/wb.mjs`。

## 命令行

```powershell
node scripts/wb.mjs today
node scripts/wb.mjs stats week
node scripts/wb.mjs search 周报 --json
node scripts/wb.mjs review week --write
```

全部命令见仓库根的 `AGENTS.md`。CLI 也是 agent 维护这个工作台时唯一需要读的业务文件。

## 设计取向

- **不引依赖**：`wb.mjs` 零依赖，界面零构建，整仓 `git clone` 后立即可用。
- **不给 agent 加工具**：只注册 HTTP 路由，不新增 tool schema，长期使用不额外烧 token。
- **一页交接**：`docs/STATE.md` 记录当前状态与下一步，续做时不用重新摸索。
