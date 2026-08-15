const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL_NAMES = Object.keys(LEVELS);

const pad = (n, len = 2) => String(n).padStart(len, '0');

function formatTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function colorFor(level) {
  switch (level) {
    case 'debug':
      return '\x1b[90m';
    case 'warn':
      return '\x1b[33m';
    case 'error':
      return '\x1b[31m';
    default:
      return '\x1b[36m';
  }
}

const RESET = '\x1b[0m';

class Logger {
  constructor({ level = 'info', mode = 'pretty', name = 'app' } = {}) {
    this.level = LEVELS[level] ?? LEVELS.info;
    this.mode = mode;
    this.name = name;
  }

  child(name) {
    const levelName = Object.entries(LEVELS).find(([, value]) => value === this.level)?.[0] || 'info';
    return new Logger({ level: levelName, mode: this.mode, name: name || this.name });
  }

  _write(level, msg, meta = {}) {
    if ((LEVELS[level] ?? 0) < this.level) return;
    const entry = { __log: true, ts: Date.now(), level, name: this.name, msg, meta };
    if (this.mode === 'json') {
      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      const colored = process.stderr.isTTY || process.stdout.isTTY;
      const time = formatTime(entry.ts);
      const levelTag = colored ? `${colorFor(level)}${level.toUpperCase()}${RESET}` : level.toUpperCase();
      const nameTag = colored ? `\x1b[35m${this.name}${RESET}` : this.name;
      const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      process.stdout.write(`[${time}] ${levelTag} ${nameTag} ${msg}${metaStr}\n`);
    }
  }

  debug(msg, meta) {
    this._write('debug', msg, meta);
  }
  info(msg, meta) {
    this._write('info', msg, meta);
  }
  warn(msg, meta) {
    this._write('warn', msg, meta);
  }
  error(msg, meta) {
    this._write('error', msg, meta);
  }
}

function parseLogLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && parsed.__log === true) {
      return { type: 'log', entry: parsed };
    }
    return { type: 'raw', text: trimmed };
  } catch {
    return { type: 'raw', text: trimmed };
  }
}

module.exports = { Logger, parseLogLine, LEVELS, LEVEL_NAMES };
