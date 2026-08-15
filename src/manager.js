require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const config = require('./lib/config');
const { Logger, parseLogLine } = require('./lib/logger');
const { IPC } = require('./lib/ipc');

const logger = new Logger({ level: config.logLevel, mode: 'pretty', name: 'manager' });
const ROOT = path.join(__dirname, '..');
const BOT_ENTRY = path.join(__dirname, 'bot', 'index.js');

/* ---------------------------------------------------------------- */
/*  In-memory log ring buffer                                        */
/* ---------------------------------------------------------------- */

const LOG_RING_LIMIT = 1000;
const logRing = [];

function pushToRing(entry) {
  logRing.push(entry);
  if (logRing.length > LOG_RING_LIMIT) logRing.splice(0, logRing.length - LOG_RING_LIMIT);
}

/* ---------------------------------------------------------------- */
/*  Log file writer with size-based rotation                         */
/* ---------------------------------------------------------------- */

const logFile = {
  size: 0,
  init() {
    if (!config.logFile) return;
    try {
      fs.mkdirSync(path.dirname(config.logFile), { recursive: true });
      this.size = fs.statSync(config.logFile).size;
    } catch {
      this.size = 0;
    }
  },
  rotate() {
    if (!config.logFile) return;
    try {
      for (let i = config.logKeepFiles; i >= 1; i--) {
        const from = i === 1 ? config.logFile : `${config.logFile}.${i - 1}`;
        const to = `${config.logFile}.${i}`;
        if (fs.existsSync(from)) fs.renameSync(from, to);
      }
      this.size = 0;
    } catch (err) {
      logger.error('Log rotation failed', { error: err.message });
    }
  },
  write(line) {
    if (!config.logFile) return;
    this.size += Buffer.byteLength(line) + 1;
    if (this.size > config.logMaxBytes) this.rotate();
    try {
      fs.appendFileSync(config.logFile, line + '\n');
    } catch (err) {
      logger.error('Failed to write log file', { error: err.message });
    }
  },
};
logFile.init();

/* ---------------------------------------------------------------- */
/*  Bot process supervision                                          */
/* ---------------------------------------------------------------- */

const status = {
  botRunning: false,
  botReady: false,
  pid: null,
  restarts: 0,
  lastExit: null,
  stopping: false,
};

let child = null;
let restartDelay = config.restartBaseDelayMs;
let stableSince = null;
let shuttingDown = false;

const prettyLine = (entry) => {
  const d = new Date(entry.ts);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  const meta = entry.meta && Object.keys(entry.meta).length ? ` ${JSON.stringify(entry.meta)}` : '';
  return `[${time}] ${entry.level.toUpperCase()} ${entry.name} ${entry.msg}${meta}`;
};

function handleLogEntry(entry) {
  const normalized = {
    ts: entry.ts || Date.now(),
    level: entry.level || 'info',
    name: entry.name || 'bot',
    msg: String(entry.msg || ''),
    meta: entry.meta || {},
  };
  pushToRing(normalized);
  logFile.write(prettyLine(normalized));
  broadcast({ type: 'log', entry: normalized });
  const echo = logger[normalized.level] || logger.info;
  echo.call(logger, `[${normalized.name}] ${normalized.msg}`, normalized.meta || {});
}

function handleChildOutput(stream, chunk) {
  const text = chunk.toString();
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parseLogLine(line);
    if (parsed && parsed.type === 'log') {
      handleLogEntry(parsed.entry);
    } else if (parsed) {
      handleLogEntry({
        ts: Date.now(),
        level: stream === 'stderr' ? 'error' : 'info',
        name: 'bot',
        msg: parsed.text,
        meta: { stream },
      });
    }
  }
}

function onChildMessage(message) {
  if (!message || typeof message !== 'object') return;
  if (message.type === IPC.BOT_STATE && message.state) {
    status.botReady = true;
    broadcast({ type: 'state', state: message.state });
    return;
  }
  if (message.type === IPC.BOT_READY) {
    status.botReady = true;
    restartDelay = config.restartBaseDelayMs;
    stableSince = Date.now();
    logger.info(`Bot logged in as ${message.tag}`);
    broadcast({ type: 'status', status: snapshotStatus() });
    return;
  }
  if (message.type === 'control:result' || message.type === 'search:results') {
    broadcast({ type: message.type, ...message });
    return;
  }
}

function onChildExit(code, signal) {
  const wasRunning = status.botRunning;
  status.botRunning = false;
  status.botReady = false;
  status.pid = null;
  status.lastExit = { code, signal, ts: Date.now() };
  child = null;

  logger.error(`Bot process exited (code=${code}, signal=${signal})`);
  broadcast({ type: 'status', status: snapshotStatus() });

  if (shuttingDown || status.stopping) {
    logger.info('Not restarting (shutdown requested)');
    if (shuttingDown) gracefulExit();
    return;
  }

  if (stableSince && Date.now() - stableSince > 60000) {
    restartDelay = config.restartBaseDelayMs;
    status.restarts = 0;
  }
  status.restarts += 1;

  const delay = Math.min(restartDelay, config.restartMaxDelayMs);
  restartDelay = Math.min(restartDelay * 2, config.restartMaxDelayMs);
  logger.warn(`Restarting bot in ${delay}ms (attempt #${status.restarts})`);
  setTimeout(spawnBot, delay);
}

function spawnBot() {
  if (shuttingDown || status.stopping) return;
  logger.info('Spawning bot process');
  child = spawn(process.execPath, [BOT_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, LOG_MODE: 'json', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  status.botRunning = true;
  status.botReady = false;
  status.pid = child.pid;
  broadcast({ type: 'status', status: snapshotStatus() });

  child.stdout.on('data', (chunk) => handleChildOutput('stdout', chunk));
  child.stderr.on('data', (chunk) => handleChildOutput('stderr', chunk));
  child.on('message', onChildMessage);
  child.on('exit', onChildExit);
  child.on('error', (err) => {
    logger.error('Failed to spawn bot process', { error: err.message });
    status.botRunning = false;
    status.botReady = false;
    status.pid = null;
    child = null;
    broadcast({ type: 'status', status: snapshotStatus() });
    setTimeout(spawnBot, config.restartBaseDelayMs);
  });
}

function sendControl(action, payload = {}, requestId) {
  if (!child || !child.connected) {
    throw new Error('Bot process is not running');
  }
  child.send({ type: IPC.CONTROL, action, payload, requestId });
}

function snapshotStatus() {
  return {
    botRunning: status.botRunning,
    botReady: status.botReady,
    pid: status.pid,
    restarts: status.restarts,
    lastExit: status.lastExit,
  };
}

/* ---------------------------------------------------------------- */
/*  HTTP + WebSocket server                                          */
/* ---------------------------------------------------------------- */

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));

const sessions = new Map(); // token -> expiry ts

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + config.sessionTtlMs);
  return token;
}

function isAuthenticated(token) {
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

app.get('/healthz', (req, res) => {
  res.json({ ok: true, status: snapshotStatus(), uptime: process.uptime() });
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!config.adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD is not configured in .env' });
  }
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(config.adminPassword));
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    return res.json({ token: createSession() });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

app.post('/api/logout', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/status', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!isAuthenticated(token)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ status: snapshotStatus(), botReady: status.botReady });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

let latestState = null;

function broadcast(message) {
  if (message.type === 'state' && message.state) latestState = message.state;
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.authenticated) {
      try {
        client.send(data);
      } catch {
        // ignore individual send failures
      }
    }
  }
}

wss.on('connection', (ws) => {
  ws.authenticated = false;
  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!ws.authenticated) {
      if (message.type === 'auth' && isAuthenticated(message.token)) {
        ws.authenticated = true;
        ws.send(
          JSON.stringify({
            type: 'hello',
            status: snapshotStatus(),
            state: latestState,
            logs: logRing.slice(-300),
          })
        );
      } else {
        ws.close(4001, 'Unauthorized');
      }
      return;
    }

    if (message.type === 'control') {
      const { action, payload = {}, requestId } = message;
      try {
        sendControl(action, payload, requestId);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'control:result', action, ok: false, error: err.message, requestId }));
      }
      return;
    }

    if (message.type === 'status') {
      ws.send(JSON.stringify({ type: 'status', status: snapshotStatus() }));
    }
  });
});

function gracefulExit() {
  logger.info('Manager shutting down');
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGTERM', () => {
  logger.info('Manager received SIGTERM');
  shuttingDown = true;
  if (child) child.kill('SIGTERM');
  setTimeout(gracefulExit, 2000).unref();
});

process.on('SIGINT', () => {
  logger.info('Manager received SIGINT');
  shuttingDown = true;
  if (child) child.kill('SIGTERM');
  setTimeout(gracefulExit, 2000).unref();
});

process.on('uncaughtException', (err) => {
  logger.error('Manager uncaught exception', { error: err.stack || err.message });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Manager unhandled rejection', { error: reason instanceof Error ? reason.stack : reason });
});

server.listen(config.port, config.host, () => {
  logger.info(`Management UI listening on http://${config.host}:${config.port}`);
  spawnBot();
});
