require('dotenv').config();

const int = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value, fallback) =>
  value === undefined || value === null || value === '' ? fallback : String(value).toLowerCase() === 'true';

const list = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const config = {
  token: process.env.TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildIds: list(process.env.GUILD_IDS),
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',

  host: process.env.HOST || '0.0.0.0',
  port: int(process.env.PORT, 3000),

  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionTtlMs: int(process.env.ADMIN_SESSION_MINUTES, 60 * 24) * 60 * 1000,

  maxQueueSize: int(process.env.MAX_QUEUE, 250),
  maxPreviousSongs: int(process.env.MAX_PREVIOUS_SONGS, 50),
  emptyCooldownMs: int(process.env.EMPTY_COOLDOWN_SECONDS, 30) * 1000,

  logLevel: process.env.LOG_LEVEL || 'info',
  logMode: process.env.LOG_MODE || (process.send ? 'json' : 'pretty'),
  logFile: process.env.LOG_FILE || 'data/logs/app.log',
  logMaxBytes: int(process.env.LOG_MAX_BYTES, 5 * 1024 * 1024),
  logKeepFiles: int(process.env.LOG_KEEP_FILES, 3),

  restartBaseDelayMs: int(process.env.RESTART_BASE_DELAY_MS, 1000),
  restartMaxDelayMs: int(process.env.RESTART_MAX_DELAY_MS, 15000),
};

module.exports = config;
