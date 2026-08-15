require('dotenv').config();

const path = require('path');
const fs = require('fs');
const os = require('os');
const { Client, GatewayIntentBits } = require('discord.js');
const { DisTube, RepeatMode } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');

const config = require('../lib/config');
const { Logger, parseLogLine } = require('../lib/logger');
const { IPC, send } = require('../lib/ipc');
const { SearchExtractor } = require('./extractor');
const { registerHandlers } = require('./handlers');
const { buildState } = require('./state');
const embeds = require('./embeds');

const logger = new Logger({ level: config.logLevel, mode: 'json', name: 'bot' });
const searchExtractor = new SearchExtractor();

function resolveFfmpegPath() {
  const { spawnSync } = require('child_process');

  const probe = (cmd) => {
    try {
      const r = spawnSync(cmd, ['-version'], { encoding: 'utf8', timeout: 5000 });
      if (r.status !== 0) return null;
      const line = (r.stdout || r.stderr).split(/\r?\n/)[0];
      return line || cmd;
    } catch {
      return null;
    }
  };

  const systemVersion = probe('ffmpeg');
  if (systemVersion) {
    logger.info(`Using system ffmpeg: ${systemVersion}`);
    return 'ffmpeg';
  }

  let pkgPath;
  try {
    pkgPath = require('ffmpeg-static');
  } catch {
    logger.warn('ffmpeg-static unavailable, falling back to PATH');
    return 'ffmpeg';
  }

  const copyToSpaceFree = (src) => {
    const destDir = path.join(os.tmpdir(), 'musica-ffmpeg');
    const dest = path.join(destDir, path.basename(src));
    fs.mkdirSync(destDir, { recursive: true });
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    return dest;
  };

  try {
    const finalPath = /\s/.test(pkgPath) ? copyToSpaceFree(pkgPath) : pkgPath;
    const version = probe(finalPath);
    if (version) {
      logger.info(`Using ffmpeg-static: ${finalPath} (${version})`);
    } else {
      logger.warn(`ffmpeg-static binary at ${finalPath} failed to run, using PATH lookup`);
      return 'ffmpeg';
    }
    return finalPath;
  } catch (err) {
    logger.warn('Failed to resolve ffmpeg-static path', { error: err.message });
    return pkgPath;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const distube = new DisTube(client, {
  emitNewSongOnly: true,
  savePreviousSongs: true,
  emitAddSongWhenCreatingQueue: true,
  emitAddListWhenCreatingQueue: true,
  ffmpeg: {
    path: resolveFfmpegPath(),
    args: {
      input: {
        headers:
          'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36\r\nAccept: */*\r\n',
      },
    },
  },
  plugins: [
    new SpotifyPlugin({
      api: {
        clientId: config.spotifyClientId,
        clientSecret: config.spotifyClientSecret,
      },
    }),
    searchExtractor,
  ],
});

const emptyTimers = new Map();

/* ---------------------------------------------------------------- */
/*  Crash-proofing                                                   */
/* ---------------------------------------------------------------- */

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.stack || err.message });
  setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { error: reason instanceof Error ? reason.stack : reason });
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down');
  process.exit(0);
});

/* ---------------------------------------------------------------- */
/*  Discord / DisTube events                                         */
/* ---------------------------------------------------------------- */

client.on('clientReady', () => {
  logger.info(`Logged in as ${client.user.tag}`, { userId: client.user.id });
  send(process, { type: IPC.BOT_READY, tag: client.user.tag });
  setInterval(pushState, 2000).unref();
});

client.on('error', (err) => {
  logger.error('Discord client error', { error: err.stack || err.message });
});

client.on('warn', (msg) => {
  logger.warn(`Discord warning: ${msg}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const guildId = newState.guild?.id || oldState.guild?.id;
  const queue = distube.getQueue(guildId);
  if (!queue) return;
  const channel = queue.voiceChannel;
  if (!channel) return;
  const humans = channel.members.filter((m) => !m.user.bot).size;

  if (humans === 0) {
    if (!emptyTimers.has(guildId)) {
      emptyTimers.set(
        guildId,
        setTimeout(async () => {
          emptyTimers.delete(guildId);
          const q = distube.getQueue(guildId);
          if (!q) return;
          const vc = q.voiceChannel;
          if (vc && vc.members.filter((m) => !m.user.bot).size === 0) {
            logger.info('Leaving empty voice channel', { guildId });
            await q.stop().catch(() => {});
          }
        }, config.emptyCooldownMs)
      );
    }
  } else if (emptyTimers.has(guildId)) {
    clearTimeout(emptyTimers.get(guildId));
    emptyTimers.delete(guildId);
  }
});

distube.on('playSong', (queue, song) => {
  pushState();
  queue.textChannel?.send({ embeds: [embeds.nowPlayingEmbed(song)], components: [embeds.controls1, embeds.controls2] }).catch(() => {});
});

distube.on('addList', (queue, playlist) => {
  pushState();
  if (queue.textChannel && queue.songs.length > 1) {
    const added = playlist.songs?.length || 0;
    queue.textChannel.send({ embeds: [embeds.playlistAddedEmbed(playlist, added)] }).catch(() => {});
  }
});

distube.on('finish', (queue) => {
  pushState();
  queue.textChannel?.send({ embeds: [embeds.queueFinishedEmbed()] }).catch(() => {});
});

distube.on('finishSong', (queue) => {
  if (queue.previousSongs.length > config.maxPreviousSongs) {
    queue.previousSongs.splice(0, queue.previousSongs.length - config.maxPreviousSongs);
  }
  pushState();
});

distube.on('initQueue', (queue) => {
  queue.setVolume(50);
});

distube.on('error', (error, queue, song) => {
  logger.error('DisTube error', {
    guildId: queue?.id,
    song: song?.name ?? queue?.songs?.[0]?.name,
    error: error?.stack || error?.message || String(error),
  });
  if (queue?.textChannel) {
    queue.textChannel.send(`❌ An error occurred: ${error.message || error}`).catch(() => {});
  }
});

distube.on('warn', (queue, warning) => {
  logger.warn('DisTube warning', { guildId: queue?.id, warning: String(warning) });
  if (queue?.textChannel) {
    queue.textChannel.send(`⚠️ Warning: ${warning}`).catch(() => {});
  }
});

distube.on('debug', (message) => {
  logger.debug(`[DisTube] ${message}`);
});

distube.on('ffmpegDebug', (message) => {
  logger.debug(`[ffmpeg] ${message}`);
});

registerHandlers({ client, distube, config, logger });

/* ---------------------------------------------------------------- */
/*  State + IPC with the manager                                     */
/* ---------------------------------------------------------------- */

function pushState() {
  try {
    send(process, { type: IPC.BOT_STATE, state: buildState(client, distube) });
  } catch (err) {
    logger.error('Failed to push state', { error: err.message });
  }
}

process.on('message', async (message) => {
  if (!message || message.type !== IPC.CONTROL) return;
  const { action, payload = {}, requestId } = message;

  try {
    await handleControl(action, payload, requestId);
  } catch (err) {
    logger.error(`Control action failed: ${action}`, { error: err.stack || err.message });
    send(process, { type: 'control:result', action, ok: false, error: err.message, requestId });
  }
});

if (!config.token) {
  logger.error('Missing TOKEN in environment. Check your .env file.');
  process.exit(1);
}

client.login(config.token).catch((err) => {
  logger.error('Failed to log in to Discord', { error: err.stack || err.message });
  process.exit(1);
});

async function resolveQuery(query) {
  const resolved = await searchExtractor.resolve(query);
  return Array.isArray(resolved?.songs) ? resolved.songs : [resolved];
}

async function handleControl(action, payload, requestId) {
  switch (action) {
    case 'shutdown': {
      logger.info('Shutdown requested by manager');
      setTimeout(() => process.exit(0), 200);
      return;
    }
    case 'status': {
      send(process, { type: IPC.BOT_STATE, state: buildState(client, distube) });
      return;
    }
    case 'search': {
      const query = String(payload.query || '').trim();
      const songs = /^https?:\/\/\S+$/i.test(query)
        ? await resolveQuery(query)
        : await searchExtractor.searchMulti(query, payload.limit || 5);
      send(process, {
        type: 'search:results',
        requestId: requestId ?? payload.requestId,
        results: songs.map((song) => ({
          id: song.id,
          name: song.name,
          url: song.url,
          thumbnail: song.thumbnail,
          duration: song.formattedDuration,
          source: song.source,
        })),
      });
      return;
    }
    case 'play':
    case 'add': {
      const guild = client.guilds.cache.get(payload.guildId);
      if (!guild) throw new Error('Bot is not in that guild');
      const voiceChannel = guild.channels.cache.get(payload.voiceChannelId);
      if (!voiceChannel || !voiceChannel.isVoiceBased()) throw new Error('Invalid voice channel');
      const textChannel = payload.textChannelId
        ? guild.channels.cache.get(payload.textChannelId)
        : undefined;
      if (textChannel && !textChannel.isTextBased()) throw new Error('Invalid text channel');
      const member = guild.members.me;
      await distube.play(voiceChannel, payload.query, {
        member,
        textChannel,
        playlist: true,
      });
      const queue = distube.getQueue(payload.guildId);
      if (queue && queue.songs.length > config.maxQueueSize) {
        queue.songs.splice(config.maxQueueSize);
      }
      if (textChannel && queue) {
        textChannel.send({ embeds: [embeds.queueEmbed(queue)] }).catch(() => {});
      }
      send(process, { type: 'control:result', action, ok: true, requestId });
      pushState();
      return;
    }
    case 'pause':
    case 'resume':
    case 'skip':
    case 'stop':
    case 'shuffle':
    case 'previous': {
      const queue = distube.getQueue(payload.guildId);
      if (!queue) throw new Error('No active queue in this guild');
      if (action === 'pause') queue.pause();
      else if (action === 'resume') queue.resume();
      else if (action === 'skip') queue.skip();
      else if (action === 'stop') queue.stop();
      else if (action === 'shuffle') queue.shuffle();
      else if (action === 'previous') queue.previous();
      send(process, { type: 'control:result', action, ok: true, requestId });
      pushState();
      return;
    }
    case 'volume': {
      const queue = distube.getQueue(payload.guildId);
      if (!queue) throw new Error('No active queue in this guild');
      const volume = Math.max(0, Math.min(200, Number(payload.volume) || 0));
      queue.setVolume(volume);
      send(process, { type: 'control:result', action, ok: true, requestId });
      pushState();
      return;
    }
    case 'repeat': {
      const queue = distube.getQueue(payload.guildId);
      if (!queue) throw new Error('No active queue in this guild');
      queue.setRepeatMode((queue.repeatMode + 1) % 3);
      send(process, { type: 'control:result', action, ok: true, repeatMode: queue.repeatMode, requestId });
      pushState();
      return;
    }
    case 'jump': {
      const queue = distube.getQueue(payload.guildId);
      if (!queue) throw new Error('No active queue in this guild');
      await queue.jump(payload.index);
      send(process, { type: 'control:result', action, ok: true, requestId });
      pushState();
      return;
    }
    case 'remove': {
      const queue = distube.getQueue(payload.guildId);
      if (!queue) throw new Error('No active queue in this guild');
      queue.songs.splice(payload.index, 1);
      send(process, { type: 'control:result', action, ok: true, requestId });
      pushState();
      return;
    }
    case 'clear': {
      const queue = distube.getQueue(payload.guildId);
      if (!queue) throw new Error('No active queue in this guild');
      queue.songs.splice(1);
      send(process, { type: 'control:result', action, ok: true, requestId });
      pushState();
      return;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}


