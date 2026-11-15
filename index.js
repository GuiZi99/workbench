// @local/dsh-workbench —— Host 半：把工作台的数据以 HTTP 暴露给浏览器页面。
// 所有读写都走同一个 CLI（scripts/wb.mjs），保证 UI / CLI / 模型看到的是同一份逻辑。
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const CLI = path.join(ROOT, 'scripts', 'wb.mjs');
const UI = path.join(ROOT, 'ui', 'index.html');
const MAX_BODY = 256 * 1024;

export const inject = ['webServer'];

/** 运行 CLI，返回 { code, stdout, stderr }。 */
function run(args) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { cwd: ROOT, timeout: 20000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      }),
    );
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return reject(new Error('请求体必须是 JSON 对象'));
        resolve(value);
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** 只接受标量，统一转成字符串，避免把对象塞进命令行。 */
const s = (v) => (v === undefined || v === null ? '' : String(v)).trim();

/** 组装只含非空项的 CLI 参数，统一用 --key=value 形式。 */
function args(...pairs) {
  const out = [];
  for (const [k, v] of pairs) {
    const str = s(v);
    if (str !== '') out.push(`--${k}=${str}`);
  }
  return out;
}

async function api(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const route = url.pathname.replace(/^\/workbench\/api/, '').replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'GET' && route === '/state') {
      const query = url.searchParams.get('date');
      const r = await run(['state', '--json', ...args(['date', query || ''])]);
      if (r.code !== 0) return send(res, 500, { ok: false, message: r.stderr || 'state 失败' });
      return send(res, 200, r.stdout, 'application/json; charset=utf-8');
    }
    if (req.method === 'GET' && route === '/search') {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return send(res, 200, []);
      const r = await run(['search', q, '--json', ...args(['limit', url.searchParams.get('limit') || '30'])]);
      if (r.code !== 0) return send(res, 500, { ok: false, message: r.stderr || 'search 失败' });
      return send(res, 200, r.stdout, 'application/json; charset=utf-8');
    }
    if (req.method !== 'POST') return send(res, 405, { ok: false, message: '方法不允许' });

    const body = await readJson(req);
    let cliArgs = null;
    if (route === '/event') {
      if (!s(body.title)) return send(res, 400, { ok: false, message: '缺少标题' });
      cliArgs = ['add', 'event', `--title=${s(body.title)}`, ...args(['date', body.date], ['start', body.start], ['end', body.end], ['category', body.category], ['tag', body.tags], ['note', body.note])];
    } else if (route === '/note') {
      if (!s(body.text)) return send(res, 400, { ok: false, message: '缺少内容' });
      cliArgs = ['add', 'note', `--text=${s(body.text)}`, ...args(['kind', body.kind], ['tag', body.tags], ['source', body.source])];
    } else if (route === '/goal') {
      if (!s(body.title)) return send(res, 400, { ok: false, message: '缺少标题' });
      cliArgs = ['add', 'goal', `--title=${s(body.title)}`, ...args(['horizon', body.horizon], ['target', body.target], ['unit', body.unit], ['due', body.due], ['area', body.area], ['why', body.why])];
    } else if (route === '/progress') {
      if (!s(body.id)) return send(res, 400, { ok: false, message: '缺少目标 id' });
      const add = s(body.add);
      const set = s(body.set);
      if (!add && !set) return send(res, 400, { ok: false, message: '需要 add 或 set' });
      cliArgs = ['log', s(body.id), ...(add ? [`--add=${add}`] : [`--set=${set}`])];
    } else if (route === '/done') {
      if (!s(body.id)) return send(res, 400, { ok: false, message: '缺少日程 id' });
      cliArgs = ['done', s(body.id)];
    } else if (route === '/review') {
      const kind = ['week', 'month', 'year'].includes(s(body.kind)) ? s(body.kind) : 'week';
      cliArgs = ['review', kind, '--write', ...args(['date', body.date])];
    } else {
      return send(res, 404, { ok: false, message: '未知接口' });
    }

    const r = await run(cliArgs);
    const message = (r.code === 0 ? r.stdout : r.stderr || r.stdout).trim();
    return send(res, r.code === 0 ? 200 : 400, { ok: r.code === 0, message });
  } catch (err) {
    return send(res, 400, { ok: false, message: String(err?.message || err) });
  }
}

function serveUi(req, res) {
  fs.readFile(UI, 'utf8', (err, html) => {
    if (err) return send(res, 500, `无法读取界面文件: ${err.message}`, 'text/plain; charset=utf-8');
    send(res, 200, html, 'text/html; charset=utf-8');
  });
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/workbench', handler: serveUi }));
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/workbench/api', handler: api }));
  ctx.logger?.info?.('workbench: UI 在 /workbench，API 在 /workbench/api');
}
