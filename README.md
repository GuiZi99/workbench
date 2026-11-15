# 工作台 Workbench

个人工作台：日程、目标、记录、检索、年/月/周时间统计。数据是仓库里的 JSONL 与 Markdown，
不需要数据库，跟着 git 一起版本化。

打开方式：DSH 运行中时访问 <http://127.0.0.1:51049/workbench>。

## 快速开始

```powershell
# 命令行看看今天
node scripts/wb.mjs today

# 加一条日程
node scripts/wb.mjs add event --title "写周报" --start 20:00 --end 20:40 --category work

# 本周统计
node scripts/wb.mjs stats week

# 数据自检
node scripts/wb.mjs check
```

## 目录

| 路径 | 作用 |
| --- | --- |
| `scripts/wb.mjs` | 全部业务逻辑（零依赖 CLI） |
| `index.js` | DSH Host 半：注册 `/workbench` 与 `/workbench/api` |
| `ui/index.html` | 浏览器单页，无构建 |
| `data/` | 日程 / 记录 / 目标 / 复盘 |
| `docs/ARCHITECTURE.md` | 设计取舍、数据模型、接口 |
| `docs/STATE.md` | 交接单：当前状态与下一步 |
| `AGENTS.md` | 给 agent 的约定与命令速查 |

## 安装到 DSH

本仓库同时是一个 DSH bundle（`dsh.bundle.patch` → `cordis.patch.yml`）。在 profile 里安装：

```
dsh plugin --profile desktop add link:<本目录绝对路径>
```

安装后重启 DSH，插件行 `workbench` 会在 Host 侧注册路由。

## 设计要点

- 文件即数据库：`git diff` 就是审计与备份。
- 只加 HTTP 路由、不加 agent 工具：长期使用不额外消耗 token。
- 一份逻辑：统计口径只在 `wb.mjs` 实现，界面和命令行共用。

## 许可

MIT。自用项目，不承诺稳定 API。
