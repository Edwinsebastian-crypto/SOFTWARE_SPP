'use strict';
/**
 * Starts the monolith (Node) and the evaluation service (FastAPI) together:  npm run start:all
 * Ctrl+C stops both. No extra dependencies.
 */
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVICE_DIR = path.join(ROOT, '..', 'servicio_evaluacion', 'backend');
const venvPython = path.join(SERVICE_DIR, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

if (!fs.existsSync(venvPython)) {
  console.error(`Python virtual environment not found: ${venvPython}\n` +
    'Create it with:  cd ../servicio_evaluacion/backend && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt');
  process.exit(1);
}

/** Libera un puerto si quedó un proceso huérfano de una ejecución previa (Windows). */
function freePort(port) {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8' });
    const matches = out.split(/\r?\n/).filter((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
    matches.forEach((line) => {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== '0' && pid !== String(process.pid)) {
        try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* ignore */ }
      }
    });
  } catch { /* ignore */ }
}

freePort(8000);
freePort(3000);

const children = [];
function run(label, color, command, args, cwd) {
  const child = spawn(command, args, { cwd, env: process.env });
  const prefix = `\x1b[${color}m[${label}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (chunk) => {
    String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => out.write(prefix + line + '\n'));
  });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stdout);
  child.on('exit', (code) => {
    console.log(`${prefix}exited (${code})`);
    shutdown(code || 0);
  });
  children.push(child);
}

function killChild(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch { /* ya terminado */ }
}

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  children.forEach(killChild);
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('evaluation', '36', venvPython, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], SERVICE_DIR);
run('monolith  ', '32', process.execPath, ['--watch', 'src/server.js'], ROOT);
