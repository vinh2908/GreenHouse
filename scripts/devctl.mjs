#!/usr/bin/env node
// HomeMate dev control panel — start/stop/status MongoDB, Redis, API, Admin, Mobile.
//
//   node scripts/devctl.mjs ui                 -> web dashboard at http://localhost:5050
//   node scripts/devctl.mjs start [svc...]     -> start all (or listed) services
//   node scripts/devctl.mjs stop [svc...]      -> stop all (or listed) services
//   node scripts/devctl.mjs restart [svc...]
//   node scripts/devctl.mjs status
//   node scripts/devctl.mjs logs <svc>
//
// Services run detached with hidden windows, so closing the dashboard does not stop them.
// Logs: data/log/<svc>.log   PIDs: data/run/<svc>.pid

import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(ROOT, 'data', 'log');
const RUN_DIR = path.join(ROOT, 'data', 'run');
const DB_DIR = path.join(ROOT, 'data', 'db');
const UI_PORT = Number(process.env.DEVCTL_PORT || 5050);
const ADB = path.join(
  process.env.LOCALAPPDATA || '',
  'Android',
  'Sdk',
  'platform-tools',
  'adb.exe',
);

for (const d of [LOG_DIR, RUN_DIR, DB_DIR]) fs.mkdirSync(d, { recursive: true });

const firstExisting = (...candidates) =>
  candidates.find(c => (c.includes(path.sep) ? fs.existsSync(c) : true));

const SERVICES = {
  mongodb: {
    label: 'MongoDB',
    port: 27017,
    group: 'infra',
    command: () => ({
      file: firstExisting(
        path.join(
          ROOT,
          'tools',
          'mongodb70',
          'mongodb-win32-x86_64-windows-7.0.18',
          'bin',
          'mongod.exe',
        ),
        'mongod',
      ),
      args: [
        '--dbpath',
        DB_DIR,
        '--port',
        '27017',
        '--bind_ip',
        '127.0.0.1',
        '--setParameter',
        'diagnosticDataCollectionEnabled=false',
      ],
    }),
  },
  redis: {
    label: 'Redis',
    port: 6379,
    group: 'infra',
    command: () => ({
      file: firstExisting(path.join(ROOT, 'tools', 'redis', 'redis-server.exe'), 'redis-server'),
      args: ['--port', '6379', '--requirepass', 'password', '--loglevel', 'notice'],
    }),
  },
  api: {
    label: 'API (NestJS)',
    port: 3000,
    url: 'http://localhost:3000/api/docs',
    group: 'app',
    cwd: 'apps/api',
    pnpm: ['dev'],
  },
  admin: {
    label: 'Admin (Next.js)',
    port: 3001,
    url: 'http://localhost:3001',
    group: 'app',
    cwd: 'apps/admin',
    pnpm: ['dev'],
  },
  mobile: {
    label: 'Mobile (Expo Metro)',
    port: 8081,
    url: 'http://localhost:8081',
    group: 'app',
    cwd: 'apps/mobile',
    pnpm: ['exec', 'expo', 'start', '--lan'],
  },
};
const NAMES = Object.keys(SERVICES);

// ─── Process helpers ──────────────────────────────────────────────────────────

// Detached cmd.exe does not pass its stdout down to child processes, so we run
// pnpm's JS entry with node directly instead of going through pnpm.cmd.
function findPnpmJs() {
  const dirs = [
    path.join(process.env.APPDATA || '', 'npm'),
    ...(process.env.PATH || '').split(path.delimiter),
  ];
  for (const dir of dirs) {
    for (const rel of ['node_modules/pnpm/bin/pnpm.cjs', '../lib/node_modules/pnpm/bin/pnpm.cjs']) {
      const p = path.join(dir, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
const PNPM_JS = findPnpmJs();

const run = (file, args) =>
  new Promise(resolve =>
    execFile(file, args, { windowsHide: true }, (err, stdout) => resolve(err ? '' : stdout)),
  );

async function listeningPorts() {
  const out = await run('netstat', ['-ano', '-p', 'TCP']);
  const out6 = await run('netstat', ['-ano', '-p', 'TCPv6']);
  const map = new Map();
  for (const line of (out + out6).split(/\r?\n/)) {
    const m = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
    if (m && !map.has(Number(m[1]))) map.set(Number(m[1]), Number(m[2]));
  }
  return map;
}

const pidFile = name => path.join(RUN_DIR, `${name}.pid`);
const logFile = name => path.join(LOG_DIR, `${name}.log`);

function readPid(name) {
  try {
    return Number(fs.readFileSync(pidFile(name), 'utf8')) || null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

async function status() {
  const ports = await listeningPorts();
  return NAMES.map(name => {
    const svc = SERVICES[name];
    const pid = readPid(name);
    const listening = ports.has(svc.port);
    const state = listening ? 'running' : isAlive(pid) ? 'starting' : 'stopped';
    return {
      name,
      label: svc.label,
      port: svc.port,
      url: svc.url,
      state,
      pid: listening ? ports.get(svc.port) : pid,
    };
  });
}

async function startService(name) {
  const svc = SERVICES[name];
  const ports = await listeningPorts();
  if (ports.has(svc.port)) return `${name}: already running on :${svc.port}`;
  if (isAlive(readPid(name))) return `${name}: already starting`;

  if (svc.pnpm && process.platform === 'win32' && PNPM_JS) {
    return startHiddenWindows(name, svc);
  }

  const out = fs.openSync(logFile(name), 'w');
  fs.writeSync(out, `[devctl] ${new Date().toISOString()} starting ${name}\n`);
  let child;
  const opts = {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, FORCE_COLOR: '0' },
  };
  if (svc.pnpm) {
    const cwd = path.join(ROOT, svc.cwd);
    child = PNPM_JS
      ? spawn(process.execPath, [PNPM_JS, ...svc.pnpm], { ...opts, cwd })
      : spawn('cmd.exe', ['/d', '/s', '/c', ['pnpm', ...svc.pnpm].join(' ')], { ...opts, cwd });
  } else {
    const { file, args } = svc.command();
    child = spawn(file, args, { ...opts, cwd: ROOT });
  }
  child.on('error', e =>
    fs.appendFileSync(logFile(name), `[devctl] failed to start: ${e.message}\n`),
  );
  child.unref();
  fs.closeSync(out);
  if (child.pid) fs.writeFileSync(pidFile(name), String(child.pid));
  return `${name}: started (pid ${child.pid}) -> ${path.relative(ROOT, logFile(name))}`;
}

// A detached process has no console, so when pnpm runs its script through cmd.exe
// Windows opens a new, visible (and empty) console window for it. Start-Process
// -WindowStyle Hidden instead gives the service its own hidden console that every
// child process shares, and cmd redirects the whole tree's output into the log.
async function startHiddenWindows(name, svc) {
  fs.writeFileSync(logFile(name), `[devctl] ${new Date().toISOString()} starting ${name}\n`);
  const q = s => `"${s}"`;
  const cmdLine = [q(process.execPath), q(PNPM_JS), ...svc.pnpm].join(' ');
  const inner = `/d /s /c "${cmdLine} >> ${q(logFile(name))} 2>&1"`;
  const ps = s => `'${s.replace(/'/g, "''")}'`;
  const script =
    `$p = Start-Process -FilePath cmd.exe -ArgumentList ${ps(inner)} ` +
    `-WorkingDirectory ${ps(path.join(ROOT, svc.cwd))} -WindowStyle Hidden -PassThru; $p.Id`;
  const pid = await new Promise(resolve =>
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, env: { ...process.env, FORCE_COLOR: '0' } },
      (err, stdout) => {
        if (err) fs.appendFileSync(logFile(name), `[devctl] failed to start: ${err.message}\n`);
        resolve(Number(String(stdout).trim()) || null);
      },
    ),
  );
  if (pid) fs.writeFileSync(pidFile(name), String(pid));
  return `${name}: started (pid ${pid ?? '?'}) -> ${path.relative(ROOT, logFile(name))}`;
}

async function stopService(name) {
  const svc = SERVICES[name];
  const pids = new Set();
  const tracked = readPid(name);
  // A stale pid file may point to a PID Windows has reused for an unrelated program.
  if (isAlive(tracked)) {
    const image = (await run('tasklist', ['/FI', `PID eq ${tracked}`, '/FO', 'CSV', '/NH'])).split(
      ',',
    )[0];
    if (/^"(node|cmd|mongod|redis-server)\.exe"$/i.test(image)) pids.add(tracked);
  }
  const portPid = (await listeningPorts()).get(svc.port);
  if (portPid) pids.add(portPid);
  for (const pid of pids) await run('taskkill', ['/PID', String(pid), '/T', '/F']);
  fs.rmSync(pidFile(name), { force: true });
  for (let i = 0; i < 10 && (await listeningPorts()).has(svc.port); i++) {
    await new Promise(r => setTimeout(r, 500));
  }
  return pids.size ? `${name}: stopped` : `${name}: was not running`;
}

async function waitForPort(port, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if ((await listeningPorts()).has(port)) return true;
    if (Date.now() >= end) return false;
    await new Promise(r => setTimeout(r, 1000));
  }
}

async function adbReverse() {
  if (!fs.existsSync(ADB)) return 'adb: Android SDK not found, skipped';
  for (const p of [3000, 8081]) await run(ADB, ['reverse', `tcp:${p}`, `tcp:${p}`]);
  return 'adb: reverse tcp:3000 & tcp:8081 done';
}

async function start(names) {
  const msgs = [];
  const infra = names.filter(n => SERVICES[n].group === 'infra');
  const apps = names.filter(n => SERVICES[n].group === 'app');
  for (const n of infra) msgs.push(await startService(n));
  // API needs the databases; wait for them before launching apps.
  if (apps.includes('api')) {
    for (const n of ['mongodb', 'redis']) {
      const timeout = infra.includes(n) || isAlive(readPid(n)) ? 20000 : 0;
      if (!(await waitForPort(SERVICES[n].port, timeout)))
        msgs.push(`warning: ${n} is not listening, API may fail`);
    }
  }
  for (const n of apps) msgs.push(await startService(n));
  if (apps.includes('mobile') || apps.includes('api')) msgs.push(await adbReverse());
  return msgs;
}

async function stop(names) {
  return Promise.all(names.map(stopService));
}

function tailLog(name, lines = 200) {
  try {
    const text = fs.readFileSync(logFile(name), 'utf8').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    return text.split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '(no log yet)';
  }
}

// ─── Web UI ───────────────────────────────────────────────────────────────────

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>HomeMate Dev</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#1c1f24;--mut:#6b7280;--bd:#e3e6ea;--ok:#16a34a;--warn:#d97706;--off:#9ca3af;--pri:#2563eb;--err:#dc2626;--log:#0f172a;--logfg:#e2e8f0}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--fg:#e5e7eb;--mut:#9ca3af;--bd:#262b35;--log:#0b0d11}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,sans-serif}
main{max-width:1000px;margin:0 auto;padding:20px 16px}
header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:16px}
h1{font-size:20px;margin:0}.row{display:flex;gap:8px;flex-wrap:wrap}
button{border:1px solid var(--bd);background:var(--card);color:var(--fg);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit}
button:hover{border-color:var(--pri)}button.pri{background:var(--pri);border-color:var(--pri);color:#fff}button.danger{color:var(--err)}
button:disabled{opacity:.5;cursor:wait}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:10px;overflow:hidden}
td,th{padding:10px 12px;border-bottom:1px solid var(--bd);text-align:left}th{font-size:12px;color:var(--mut);font-weight:600}
tr:last-child td{border-bottom:0}tr.sel{outline:2px solid var(--pri);outline-offset:-2px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
.running .dot{background:var(--ok)}.starting .dot{background:var(--warn)}.stopped .dot{background:var(--off)}
.mut{color:var(--mut)}a{color:var(--pri)}
.wrap{overflow-x:auto}
pre{background:var(--log);color:var(--logfg);padding:12px;border-radius:10px;height:380px;overflow:auto;font:12px/1.4 Consolas,monospace;white-space:pre-wrap;word-break:break-all;margin:8px 0 0}
#msg{min-height:20px;color:var(--mut);margin:10px 0;white-space:pre-line}
</style></head><body><main>
<header><h1>HomeMate Dev Control</h1><div class="row">
<button class="pri" onclick="act('start','all')">▶ Start all</button>
<button class="danger" onclick="act('stop','all')">■ Stop all</button>
<button onclick="act('restart','all')">↻ Restart all</button>
<button onclick="act('adb','all')">adb reverse</button></div></header>
<div class="wrap"><table><thead><tr><th>Service</th><th>Trạng thái</th><th>Port</th><th>PID</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
<div id="msg"></div>
<div class="row" style="justify-content:space-between;align-items:center"><strong id="logtitle">Log</strong><span class="mut">click một dòng để xem log</span></div>
<pre id="log"></pre>
</main><script>
let sel='api',busy=false;
const $=id=>document.getElementById(id);
async function refresh(){
  try{
    const s=await (await fetch('/api/status')).json();
    $('rows').innerHTML=s.map(x=>'<tr class="'+x.state+(x.name===sel?' sel':'')+'" onclick="pick(\\''+x.name+'\\')">'+
      '<td><b>'+x.label+'</b>'+(x.url&&x.state==='running'?' <a href="'+x.url+'" target="_blank" onclick="event.stopPropagation()">mở ↗</a>':'')+'</td>'+
      '<td><span class="dot"></span>'+x.state+'</td><td>'+x.port+'</td><td class="mut">'+(x.pid||'')+'</td>'+
      '<td><div class="row" onclick="event.stopPropagation()">'+
      (x.state==='stopped'?'<button onclick="act(\\'start\\',\\''+x.name+'\\')">Start</button>':'<button class="danger" onclick="act(\\'stop\\',\\''+x.name+'\\')">Stop</button>')+
      '<button onclick="act(\\'restart\\',\\''+x.name+'\\')">Restart</button></div></td></tr>').join('');
    const log=$('log'),atBottom=log.scrollTop+log.clientHeight>=log.scrollHeight-20;
    log.textContent=await (await fetch('/api/logs/'+sel)).text();
    if(atBottom)log.scrollTop=log.scrollHeight;
    $('logtitle').textContent='Log: '+sel;
  }catch(e){$('msg').textContent='Mất kết nối tới devctl — cửa sổ dashboard đã bị đóng?'}
}
function pick(n){sel=n;$('log').scrollTop=1e9;refresh()}
async function act(a,n){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  $('msg').textContent=a+' '+n+'…';
  try{$('msg').textContent=(await (await fetch('/api/'+a+'/'+n,{method:'POST'})).json()).join('\\n')}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);refresh()}
}
refresh();setInterval(()=>{if(!busy)refresh()},2000);
</script></body></html>`;

function serveUi() {
  const server = http.createServer(async (req, res) => {
    const [, api, action, target] = req.url.split('?')[0].split('/');
    const json = data => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    try {
      if (!api) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(PAGE);
      }
      if (action === 'status') return json(await status());
      if (action === 'logs' && SERVICES[target]) {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end(tailLog(target, 300));
      }
      if (req.method === 'POST') {
        const names = target === 'all' ? NAMES : SERVICES[target] ? [target] : [];
        if (action === 'start') return json(await start(names));
        if (action === 'stop') return json(await stop(names));
        if (action === 'restart') return json([...(await stop(names)), ...(await start(names))]);
        if (action === 'adb') return json([await adbReverse()]);
      }
      res.writeHead(404).end();
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.log(`Dashboard đã chạy sẵn: http://localhost:${UI_PORT}`);
      process.exit(0);
    }
    throw e;
  });
  server.listen(UI_PORT, '127.0.0.1', () => {
    console.log(`HomeMate Dev Control: http://localhost:${UI_PORT}`);
    console.log('Đóng cửa sổ này KHÔNG dừng các service. Dùng nút Stop all để dừng.');
    if (process.argv.includes('--open'))
      spawn('cmd.exe', ['/c', 'start', '', `http://localhost:${UI_PORT}`], { windowsHide: true });
  });
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const [cmd = 'status', ...rest] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const names = rest.length ? rest : NAMES;
  const bad = names.filter(n => !SERVICES[n]);
  if (bad.length && cmd !== 'logs') {
    console.error(`Unknown service: ${bad.join(', ')}. Valid: ${NAMES.join(', ')}`);
    process.exit(1);
  }
  switch (cmd) {
    case 'ui':
      return serveUi();
    case 'start':
      return (await start(names)).forEach(m => console.log(m));
    case 'stop':
      return (await stop(names)).forEach(m => console.log(m));
    case 'restart':
      (await stop(names)).forEach(m => console.log(m));
      return (await start(names)).forEach(m => console.log(m));
    case 'logs':
      return console.log(tailLog(rest[0] || 'api', 200));
    case 'status':
      for (const s of await status()) {
        console.log(
          `${s.state.padEnd(9)} ${s.name.padEnd(8)} :${String(s.port).padEnd(6)} ${s.pid ?? ''} ${s.url ?? ''}`,
        );
      }
      return;
    default:
      console.log(
        'Usage: node scripts/devctl.mjs <ui|start|stop|restart|status|logs> [service...]',
      );
  }
}

main();
