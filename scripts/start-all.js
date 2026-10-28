'use strict';
/**
 * Starts the monolith (Node) and the evaluation service (FastAPI) together:  npm run start:all
 * Automatically sets up .env, Python .venv or Docker fallback if run for the first time.
 * Ctrl+C stops both. No extra dependencies.
 */
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVICE_DIR = path.join(ROOT, '..', 'servicio_evaluacion', 'backend');
const DOCKER_COMPOSE_FILE = path.join(ROOT, '..', 'servicio_evaluacion', 'docker-compose.yml');
const venvPython = path.join(SERVICE_DIR, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

/** Auto-create .env from .env.example if missing */
function ensureEnvFiles() {
  const rootEnv = path.join(ROOT, '.env');
  const rootExample = path.join(ROOT, '.env.example');
  if (!fs.existsSync(rootEnv) && fs.existsSync(rootExample)) {
    fs.copyFileSync(rootExample, rootEnv);
    console.log('[setup] Created SOFTWARE_SPP/.env from .env.example');
  }

  const serviceEnv = path.join(SERVICE_DIR, '.env');
  const serviceExample = path.join(SERVICE_DIR, '.env.example');
  if (!fs.existsSync(serviceEnv) && fs.existsSync(serviceExample)) {
    fs.copyFileSync(serviceExample, serviceEnv);
    console.log('[setup] Created servicio_evaluacion/backend/.env from .env.example');
  }
}

function findSystemPython() {
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch { /* continue */ }
  }
  return null;
}

function isDockerAvailable() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function ensureEvaluationService() {
  if (fs.existsSync(venvPython)) {
    return { type: 'python', bin: venvPython };
  }

  const sysPython = findSystemPython();
  if (sysPython) {
    console.log(`[setup] Python virtual environment not found. Setting it up automatically with ${sysPython} ...`);
    try {
      execSync(`"${sysPython}" -m venv .venv`, { cwd: SERVICE_DIR, stdio: 'inherit' });
      if (fs.existsSync(venvPython)) {
        console.log('[setup] Installing Python dependencies (requirements.txt) ...');
        execSync(`"${venvPython}" -m pip install -r requirements.txt`, { cwd: SERVICE_DIR, stdio: 'inherit' });
        console.log('[setup] Python environment ready!');
        return { type: 'python', bin: venvPython };
      }
    } catch (err) {
      console.warn('[setup] Could not auto-install Python venv:', err.message);
    }
  }

  if (isDockerAvailable() && fs.existsSync(DOCKER_COMPOSE_FILE)) {
    console.log('[setup] Local Python not found. Starting evaluation service with Docker compose...');
    try {
      execSync(`docker compose -f "${DOCKER_COMPOSE_FILE}" up -d api`, { stdio: 'inherit' });
      return { type: 'docker' };
    } catch (err) {
      console.warn('[setup] Could not start Docker service:', err.message);
    }
  }

  console.error(`\n[ERROR] Python virtual environment not found: ${venvPython}\n` +
    'Create it with:  cd ../servicio_evaluacion/backend && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt\n' +
    'Or start Docker in ../servicio_evaluacion:  docker compose up -d\n');
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

ensureEnvFiles();
const evalRunner = ensureEvaluationService();

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
  if (evalRunner.type === 'docker') {
    try { execSync(`docker compose -f "${DOCKER_COMPOSE_FILE}" stop api`, { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (evalRunner.type === 'python') {
  run('evaluation', '36', evalRunner.bin, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], SERVICE_DIR);
}
run('monolith  ', '32', process.execPath, ['--watch', 'src/server.js'], ROOT);
