#!/usr/bin/env node
// wb.mjs — workbench CLI. 文件即数据库；零依赖；输出保持精简，方便直接喂给模型。
// 用法: node scripts/wb.mjs <command> [options]   （help 看全部命令）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = process.env.WB_DATA ? path.resolve(process.env.WB_DATA) : path.join(ROOT, 'data');
const F = {
  events: path.join(DATA, 'events.jsonl'),
  notes: path.join(DATA, 'notes.jsonl'),
  goals: path.join(DATA, 'goals.json'),
  reviews: path.join(DATA, 'reviews'),
};

const CATS = ['work', 'study', 'health', 'life', 'rest', 'other'];
const CAT_CN = { work: '工作', study: '学习', health: '健康', life: '生活', rest: '休息', other: '其他' };

/* ---------- 基础工具 ---------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parseDate = (s) => {
  if (!s) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) die(`日期格式应为 YYYY-MM-DD: ${s}`);
  return new Date(+m[1], +m[2] - 1, +m[3]);
};
function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
// 容忍 Windows 记事本写入的 UTF-8 BOM
const readText = (file) => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return readText(file).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}
function appendLine(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8');
}
function writeLines(file, arr) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, arr.map((o) => JSON.stringify(o)).join('\n') + (arr.length ? '\n' : ''), 'utf8');
  fs.renameSync(tmp, file);
}
function readGoals() {
  if (!fs.existsSync(F.goals)) return { version: 1, goals: [] };
  const db = JSON.parse(readText(F.goals));
  if (Array.isArray(db)) return { version: 1, goals: db };
  return { version: db.version ?? 1, goals: Array.isArray(db.goals) ? db.goals : [] };
}
function writeGoals(db) {
  fs.mkdirSync(path.dirname(F.goals), { recursive: true });
  const tmp = `${F.goals}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, F.goals);
}
const newId = (p) => `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
const hours = (ev) => {
  if (!ev.start || !ev.end) return 0;
  const [h1, m1] = ev.start.split(':').map(Number);
  const [h2, m2] = ev.end.split(':').map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
};

/* ---------- ISO 周 ---------- */
function weekInfo(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // 周一=0
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.floor((thursday - yearStart) / 604800000) + 1;
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday, year: thursday.getFullYear(), week, key: `${thursday.getFullYear()}-W${pad(week)}` };
}
function rangeFor(kind, date) {
  const w = weekInfo(date);
  if (kind === 'week') return { from: iso(w.monday), to: iso(w.sunday), label: `${w.key}`, key: w.key, year: w.year, week: w.week, monday: iso(w.monday) };
  if (kind === 'month') {
    const from = iso(new Date(date.getFullYear(), date.getMonth(), 1));
    const to = iso(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    return { from, to, label: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`, key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`, year: date.getFullYear(), month: date.getMonth() + 1 };
  }
  if (kind === 'year') return { from: `${date.getFullYear()}-01-01`, to: `${date.getFullYear()}-12-31`, label: `${date.getFullYear()}`, key: `${date.getFullYear()}`, year: date.getFullYear() };
  die(`未知周期: ${kind}（用 week|month|year）`);
}

/* ---------- 参数解析 ---------- */
function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        opt[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[key] = true;
      else {
        opt[key] = next;
        i++;
      }
    } else pos.push(a);
  }
  return { pos, opt };
}
const tags = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

/* ---------- 统计 ---------- */
function summarize(events, from, to) {
  const inRange = events.filter((e) => e.date >= from && e.date <= to && !e.deleted);
  let total = 0;
  const byCat = {};
  const byTag = {};
  const byDay = {};
  for (const e of inRange) {
    const h = hours(e);
    total += h;
    const cat = e.category || 'work';
    byCat[cat] = (byCat[cat] || 0) + h;
    byDay[e.date] = (byDay[e.date] || 0) + h;
    for (const t of e.tags || []) byTag[t] = (byTag[t] || 0) + h;
  }
  const done = inRange.filter((e) => e.status === 'done').length;
  const sorted = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return { count: inRange.length, done, total, byCat: sorted(byCat), byTag: sorted(byTag), byDay, events: inRange };
}
const fmtH = (h) => (h >= 10 ? h.toFixed(1) : h.toFixed(1)) + 'h';
function bar(value, max, width = 12) {
  if (!max) return '';
  return '█'.repeat(Math.max(0, Math.round((value / max) * width)));
}

function printSummary(sum, r) {
  const lines = [];
  lines.push(`■ ${r.label}  ${r.from} ~ ${r.to}`);
  lines.push(`总时长 ${fmtH(sum.total)} / 日程 ${sum.count} 条 / 完成 ${sum.done} 条` + (sum.count ? ` (${Math.round((sum.done / sum.count) * 100)}%)` : ''));
  const max = sum.byCat.length ? sum.byCat[0][1] : 0;
  if (sum.byCat.length) {
    lines.push('· 分类');
    for (const [c, h] of sum.byCat) lines.push(`  ${(CAT_CN[c] || c).padEnd(4)} ${fmtH(h).padStart(5)} ${bar(h, max)} ${Math.round((h / sum.total) * 100 || 0)}%`);
  }
  if (sum.byTag.length) lines.push('· 标签 ' + sum.byTag.slice(0, 6).map(([t, h]) => `${t}:${fmtH(h)}`).join('  '));
  const days = Object.keys(sum.byDay).sort();
  if (days.length && !r.week) lines.push(`· 活跃 ${days.length} 天, 日均 ${fmtH(sum.total / days.length)}`);
  if (r.week) {
    const daily = [];
    const [yy, mm, dd] = r.monday.split('-').map(Number);
    for (let i = 0; i < 7; i++) {
      const d = new Date(yy, mm - 1, dd + i);
      const k = iso(d);
      const h = sum.byDay[k] || 0;
      daily.push(`${'一二三四五六日'[i]}${h ? fmtH(h) : '  - '}`);
    }
    lines.push('· 每日 ' + daily.join(' '));
  }
  console.log(lines.join('\n'));
}

/* ---------- 今日数据（CLI 与 UI 共用） ---------- */
function todayData(d) {
  const day = iso(d);
  const evs = readLines(F.events)
    .filter((e) => e.date === day && !e.deleted)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const db = readGoals();
  const active = db.goals
    .filter((g) => g.status === 'active')
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  return {
    date: day,
    weekday: '日一二三四五六'[d.getDay()],
    events: evs.map((e) => ({
      id: e.id,
      start: e.start || null,
      end: e.end || null,
      title: e.title,
      tags: e.tags || [],
      category: e.category || 'work',
      note: e.note || '',
      status: e.status || 'planned',
      hours: hours(e),
    })),
    goals: active.map((g) => ({
      id: g.id,
      title: g.title,
      progress: g.progress || 0,
      target: g.target ?? null,
      unit: g.unit || '',
      due: g.due ?? null,
      pct: g.target ? Math.min(100, Math.round(((g.progress || 0) / g.target) * 100)) : null,
      overdue: !!(g.due && g.due < day),
      area: g.area || '',
      horizon: g.horizon || '',
    })),
    notesToday: readLines(F.notes).filter((n) => (n.ts || '').startsWith(day)).length,
  };
}

/* ---------- 命令 ---------- */
const cmds = {
  help() {
    console.log(`wb — 工作台 CLI（数据: ${path.relative(ROOT, DATA) || 'data'}）

  今日/本周
    today [--date D] [--json]           今日日程 + 目标进度 + 最近记录
    state  [--date D] --json            UI 用：一次拿今日/周/月/年/目标/记录
    week|month|year [--date D]          周期概览（同 stats）
    stats <week|month|year> [--date D]  时间统计
    review <week|month|year> [--date D] [--write]   生成复盘 Markdown

  记录
    add event --title T [--date D] [--start HH:MM] [--end HH:MM] [--category C] [--tag a,b] [--note X]
    add note  --text T [--kind note|idea|link|quote] [--tag a,b] [--source S]
    add goal  --title T [--horizon year|quarter|month] [--target N] [--unit 次] [--due D] [--area A] [--why W]
    log <goal-id> --add N | --set N [--note X]       记录目标进度
    done <event-id>                                  标记日程完成
    list <events|goals|notes> [--from D] [--to D] [--limit N]
    search <关键词> [--limit N]
    check                               数据自检

  category: ${CATS.join(' | ')}`);
  },

  today({ opt }) {
    const d = parseDate(opt.date);
    const data = todayData(d);
    if (opt.json) return console.log(JSON.stringify(data));
    console.log(`■ 今日 ${data.date} (${data.weekday})`);
    if (!data.events.length) console.log('  （无日程）');
    for (const e of data.events) {
      console.log(`  ${e.status === 'done' ? '✓' : '·'} ${e.start || '--:--'}-${e.end || '--:--'} ${e.title}${e.tags.length ? '  #' + e.tags.join(' #') : ''}  [${e.id}]`);
    }
    if (data.goals.length) {
      console.log(`· 目标 ${data.goals.length} 个进行中`);
      for (const g of data.goals.slice(0, 6)) {
        console.log(`  ${g.title} ${g.progress}/${g.target ?? '?'}${g.unit}${g.pct !== null ? ` ${g.pct}%` : ''}${g.overdue ? ' !逾期' : ''}  [${g.id}]`);
      }
    }
    if (data.notesToday) console.log(`· 今日记录 ${data.notesToday} 条`);
  },

  // UI 一次性拿全部数据；文本模式等价于 today
  state({ opt }) {
    const d = parseDate(opt.date);
    const week = rangeFor('week', d);
    const month = rangeFor('month', d);
    const year = rangeFor('year', d);
    const events = readLines(F.events).filter((e) => !e.deleted);
    const pack = (r) => {
      const s = summarize(events, r.from, r.to);
      return { key: r.key, label: r.label, from: r.from, to: r.to, total: s.total, count: s.count, done: s.done, byCat: s.byCat, byTag: s.byTag.slice(0, 8), byDay: s.byDay };
    };
    const db = readGoals();
    const out = {
      today: todayData(d),
      week: pack(week),
      month: pack(month),
      year: pack(year),
      goals: db.goals,
      notes: readLines(F.notes).slice(-12).reverse(),
      todayDate: iso(d),
    };
    if (!opt.json) return cmds.today({ opt: { date: iso(d) } });
    console.log(JSON.stringify(out));
  },

  stats({ pos, opt }) {
    const kind = pos[0] || 'week';
    const r = rangeFor(kind, parseDate(opt.date));
    const sum = summarize(readLines(F.events), r.from, r.to);
    if (opt.json) return console.log(JSON.stringify({ key: r.key, label: r.label, from: r.from, to: r.to, total: sum.total, count: sum.count, done: sum.done, byCat: sum.byCat, byTag: sum.byTag, byDay: sum.byDay }));
    printSummary(sum, r);
  },

  review({ pos, opt }) {
    const kind = pos[0] || 'week';
    const r = rangeFor(kind, parseDate(opt.date));
    const sum = summarize(readLines(F.events), r.from, r.to);
    const db = readGoals();
    const goals = db.goals.filter((g) => g.status === 'active' || (g.updated || '').slice(0, 10) >= r.from);
    const notes = readLines(F.notes).filter((n) => (n.ts || '').slice(0, 10) >= r.from && (n.ts || '').slice(0, 10) <= r.to);
    const L = [];
    L.push(`# ${r.label} 复盘`, '', `> ${r.from} ~ ${r.to}`, '');
    L.push('## 时间', '', `- 总时长 ${fmtH(sum.total)}，日程 ${sum.count} 条，完成 ${sum.done} 条`);
    for (const [c, h] of sum.byCat) L.push(`- ${CAT_CN[c] || c}：${fmtH(h)}（${Math.round((h / sum.total) * 100 || 0)}%）`);
    if (sum.byTag.length) L.push(`- 标签：${sum.byTag.slice(0, 8).map(([t, h]) => `${t} ${fmtH(h)}`).join('、')}`);
    L.push('', '## 目标', '');
    if (!goals.length) L.push('- （无）');
    for (const g of goals) L.push(`- ${g.title}：${g.progress || 0}/${g.target || '?'}${g.unit || ''}${g.due ? `（截止 ${g.due}）` : ''}`);
    L.push('', '## 记录', '');
    if (!notes.length) L.push('- （无）');
    for (const n of notes.slice(-15)) L.push(`- ${(n.ts || '').slice(5, 16).replace('T', ' ')} [${n.kind || 'note'}] ${n.text}`);
    L.push('', '## 复盘', '', '- 做得好的：', '- 卡住的：', '- 下周调整：', '');
    const text = L.join('\n');
    if (opt.write) {
      fs.mkdirSync(F.reviews, { recursive: true });
      const file = path.join(F.reviews, `${kind}-${r.key}.md`);
      fs.writeFileSync(file, text, 'utf8');
      console.log(`✓ 已写入 ${path.relative(ROOT, file)}`);
    } else console.log(text);
  },

  add({ pos, opt }) {
    const kind = pos[0];
    if (kind === 'event') {
      const title = opt.title;
      if (!title || title === true) die('缺少 --title');
      const date = iso(parseDate(opt.date));
      const ev = {
        id: newId('ev-'),
        date,
        start: opt.start && opt.start !== true ? opt.start : null,
        end: opt.end && opt.end !== true ? opt.end : null,
        title: String(title),
        category: CATS.includes(opt.category) ? opt.category : 'work',
        tags: tags(opt.tag),
        note: opt.note && opt.note !== true ? String(opt.note) : '',
        status: 'planned',
        created: new Date().toISOString(),
      };
      if (ev.start && ev.end && ev.end < ev.start) die('结束时间早于开始时间');
      appendLine(F.events, ev);
      console.log(`✓ ${ev.id} ${ev.date} ${ev.start || ''}-${ev.end || ''} ${ev.title} (${fmtH(hours(ev))})`);
    } else if (kind === 'note') {
      if (!opt.text || opt.text === true) die('缺少 --text');
      const n = {
        id: newId('nt-'),
        ts: opt.date ? `${iso(parseDate(opt.date))}T${new Date().toTimeString().slice(0, 5)}` : new Date().toISOString().slice(0, 16),
        kind: ['note', 'idea', 'link', 'quote'].includes(opt.kind) ? opt.kind : 'note',
        text: String(opt.text),
        tags: tags(opt.tag),
        source: opt.source && opt.source !== true ? String(opt.source) : '',
      };
      appendLine(F.notes, n);
      console.log(`✓ ${n.id}`);
    } else if (kind === 'goal') {
      if (!opt.title || opt.title === true) die('缺少 --title');
      const db = readGoals();
      const g = {
        id: newId('gl-'),
        title: String(opt.title),
        horizon: ['year', 'quarter', 'month'].includes(opt.horizon) ? opt.horizon : 'quarter',
        area: opt.area && opt.area !== true ? String(opt.area) : '',
        target: opt.target && opt.target !== true ? Number(opt.target) : null,
        unit: opt.unit && opt.unit !== true ? String(opt.unit) : '',
        progress: 0,
        due: opt.due && opt.due !== true ? String(opt.due) : null,
        why: opt.why && opt.why !== true ? String(opt.why) : '',
        status: 'active',
        created: today(),
        updated: today(),
      };
      if (g.target !== null && !Number.isFinite(g.target)) die('--target 必须是数字');
      db.goals.push(g);
      writeGoals(db);
      console.log(`✓ ${g.id} ${g.title}`);
    } else die('add 需要 event|note|goal');
  },

  log({ pos, opt }) {
    const id = pos[0];
    if (!id) die('用法: log <goal-id> --add N | --set N');
    const db = readGoals();
    const g = db.goals.find((x) => x.id === id || x.id.startsWith(id) || x.id.endsWith(id));
    if (!g) die(`未找到目标 ${id}`);
    if (opt.add !== undefined && opt.add !== true) g.progress = Number(g.progress || 0) + Number(opt.add);
    else if (opt.set !== undefined && opt.set !== true) g.progress = Number(opt.set);
    else die('需要 --add 或 --set');
    if (!Number.isFinite(g.progress)) die('进度必须是数字');
    g.updated = today();
    if (g.target && g.progress >= g.target) g.status = 'done';
    writeGoals(db);
    const pct = g.target ? ` (${Math.round((g.progress / g.target) * 100)}%)` : '';
    console.log(`✓ ${g.title} ${g.progress}/${g.target ?? '?'}${g.unit || ''}${pct}`);
  },

  done({ pos }) {
    const id = pos[0];
    if (!id) die('用法: done <event-id>');
    const evs = readLines(F.events);
    const ev = evs.find((e) => e.id === id || e.id.startsWith(id) || e.id.endsWith(id));
    if (!ev) die(`未找到日程 ${id}`);
    ev.status = 'done';
    writeLines(F.events, evs);
    console.log(`✓ 完成 ${ev.date} ${ev.title}`);
  },

  list({ pos, opt }) {
    const kind = pos[0] || 'events';
    const limit = opt.limit ? Number(opt.limit) : 20;
    if (kind === 'events') {
      const evs = readLines(F.events)
        .filter((e) => !e.deleted)
        .filter((e) => (!opt.from || e.date >= opt.from) && (!opt.to || e.date <= opt.to))
        .sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')))
        .slice(0, limit);
      if (opt.json) return console.log(JSON.stringify(evs));
      console.log(evs.map((e) => `${e.date} ${e.start || '--:--'}-${e.end || '--:--'} ${e.status === 'done' ? '✓' : '·'} ${e.title} [${e.id}]`).join('\n') || '（空）');
    } else if (kind === 'notes') {
      const ns = readLines(F.notes).slice(-limit).reverse();
      if (opt.json) return console.log(JSON.stringify(ns));
      console.log(ns.map((n) => `${(n.ts || '').replace('T', ' ').slice(0, 16)} [${n.kind || 'note'}] ${n.text} [${n.id}]`).join('\n') || '（空）');
    } else if (kind === 'goals') {
      const db = readGoals();
      if (opt.json) return console.log(JSON.stringify(db.goals));
      console.log(db.goals.map((g) => `${g.status === 'done' ? '✓' : '·'} ${g.title} ${g.progress || 0}/${g.target ?? '?'}${g.unit || ''} ${g.horizon}${g.due ? ' due ' + g.due : ''} [${g.id}]`).join('\n') || '（空）');
    } else die('list 需要 events|goals|notes');
  },

  search({ pos, opt }) {
    const q = (pos[0] || '').toLowerCase();
    if (!q) die('用法: search <关键词>');
    const limit = opt.limit ? Number(opt.limit) : 20;
    const hits = [];
    for (const e of readLines(F.events)) {
      const hay = `${e.title} ${e.note || ''} ${(e.tags || []).join(' ')} ${e.category || ''}`.toLowerCase();
      if (hay.includes(q)) hits.push({ at: `${path.relative(DATA, F.events)}:${e.date}`, text: `${e.date} ${e.title}${e.note ? ' — ' + e.note : ''}`, id: e.id });
    }
    for (const n of readLines(F.notes)) {
      const hay = `${n.text} ${(n.tags || []).join(' ')} ${n.source || ''}`.toLowerCase();
      if (hay.includes(q)) hits.push({ at: `${path.relative(DATA, F.notes)}:${(n.ts || '').slice(0, 10)}`, text: `[${n.kind || 'note'}] ${n.text}`, id: n.id });
    }
    const db = readGoals();
    for (const g of db.goals) {
      const hay = `${g.title} ${g.why || ''} ${g.area || ''}`.toLowerCase();
      if (hay.includes(q)) hits.push({ at: path.relative(DATA, F.goals), text: `[goal] ${g.title} ${g.progress || 0}/${g.target ?? '?'}`, id: g.id });
    }
    if (!hits.length) return console.log(opt.json ? '[]' : '（无匹配）');
    if (opt.json) return console.log(JSON.stringify(hits.slice(0, limit)));
    console.log(`命中 ${hits.length} 条（显示前 ${Math.min(limit, hits.length)}）`);
    for (const h of hits.slice(0, limit)) console.log(`- ${h.at}  ${h.text}  [${h.id}]`);
  },

  check() {
    const issues = [];
    const evs = readLines(F.events);
    const ids = new Set();
    for (const e of evs) {
      if (!e.id || !e.date || !e.title) issues.push(`日程缺字段: ${JSON.stringify(e).slice(0, 80)}`);
      if (ids.has(e.id)) issues.push(`重复 id: ${e.id}`);
      ids.add(e.id);
      if (e.start && e.end && e.end < e.start) issues.push(`时间倒置: ${e.id} ${e.start}-${e.end}`);
    }
    let db;
    try {
      db = readGoals();
    } catch (err) {
      issues.push(`goals.json 解析失败: ${err.message}`);
      db = { goals: [] };
    }
    const gids = new Set();
    for (const g of db.goals || []) {
      if (gids.has(g.id)) issues.push(`重复目标 id: ${g.id}`);
      gids.add(g.id);
      if (!g.title) issues.push(`目标缺 title: ${g.id}`);
    }
    const notes = readLines(F.notes);
    console.log(`数据: 日程 ${evs.length} / 目标 ${(db.goals || []).length} / 记录 ${notes.length}`);
    console.log(issues.length ? `✗ 问题 ${issues.length}\n` + issues.map((i) => '  ' + i).join('\n') : '✓ 自检通过');
    if (issues.length) process.exitCode = 1;
  },
};

/* ---------- 入口 ---------- */
const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') cmds.help();
else if (cmds[cmd]) cmds[cmd](parseArgs(rest));
else {
  const alias = { week: 'stats', month: 'stats', year: 'stats' };
  if (alias[cmd]) cmds.stats(parseArgs([cmd, ...rest]));
  else die(`未知命令: ${cmd}（跑 help 看用法）`);
}
