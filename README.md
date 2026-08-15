# Musica - Discord Music Bot

A Discord music bot with automatic crash-restart supervision and a web control panel. Built with `discord.js`, `DisTube`, and `yt-dlp`.

## Architecture

```
src/
  manager.js            Supervisor + web/WS management server
  bot/
    index.js            Discord bot process (spawned by the manager)
    handlers.js         Slash commands + button interactions
    state.js            Builds the player/guild state sent to the dashboard
    embeds.js           Discord embeds and control buttons
    extractor.js        DisTube extractor backed by the bundled yt-dlp binary
  lib/
    config.js           .env-driven configuration
    logger.js           Pretty + JSON log output, parses child log lines
    ipc.js              Message contracts between manager and bot
  register-commands.js  Register slash commands for your guilds
  unregister-commands.js Remove registered slash commands
public/                 Web dashboard (static, served by the manager)
```

The **manager** runs the HTTP server + WebSocket hub, keeps the **bot** alive with exponential-backoff restarts, rotates log files, and streams live state/logs to connected dashboard clients.

## Features

- Play via URL or search query (YouTube and 900+ sites through `yt-dlp`, plus Spotify links)
- Queue with skip / previous / shuffle / repeat / jump / remove / clear
- Pause, resume, stop, volume control
- Slash commands with interactive now-playing buttons
- Auto-leave when the voice channel is empty
- Web dashboard: live now-playing, queue management, search-and-play, live logs
- Supervisor: auto-restarts the bot on crash with backoff, log rotation, health endpoint

## Setup

1. Install dependencies (Node 18+ recommended):
   ```sh
   npm install
   ```

2. Create `.env` from `.env.example`:
   ```env
   TOKEN=your-discord-bot-token
   CLIENT_ID=your-bot-client-id
   GUILD_IDS=your-server-id,your-other-server-id
   SPOTIFY_CLIENT_ID=
   SPOTIFY_CLIENT_SECRET=

   HOST=0.0.0.0
   PORT=11234
   ADMIN_PASSWORD=choose-a-strong-password
   ```

3. Register the slash commands:
   ```sh
   npm run register
   ```

4. Start everything (manager + bot + dashboard):
   ```sh
   npm start
   ```

5. Open the dashboard at `http://localhost:11234` and sign in with `ADMIN_PASSWORD`.

## Commands

| Command | Description |
| --- | --- |
| `/play <query>` | Play a song, playlist, or search result |
| `/pause` | Pause the current track |
| `/resume` | Resume playback |
| `/skip` | Skip to the next track |
| `/stop` | Stop and disconnect |
| `/now-playing` | Show the current track with control buttons |

The now-playing message includes buttons for **repeat**, **stop**, **pause/resume**, **skip**, **shuffle**, and **previous**.

## Docker

The image is published to **GHCR** (GitHub Container Registry) by a GitHub
Actions workflow, so the server only ever pulls a prebuilt image — no Node.js
or build step needed on the host, exactly like Jellyfin and friends. Images are
built for both `linux/amd64` and `linux/arm64`.

The image build downloads the **latest** `yt-dlp` and `ffmpeg-static` binaries
automatically, so the stale-binary YouTube issue cannot occur.

1. Make sure `.env` exists in this folder (copy from `.env.example` and fill in
   `TOKEN`, `CLIENT_ID`, `GUILD_IDS`, `ADMIN_PASSWORD`).

2. Pull and start (dashboard on host port `11234`):

   ```sh
   docker compose pull
   docker compose up -d
   ```

3. Register the slash commands (one time only):

   ```sh
   docker compose run --rm musica node src/register-commands.js
   ```

4. Open `http://<server-ip>:11234` and sign in with `ADMIN_PASSWORD`.

### Publishing a new image

The image is built from the code in this GitHub repo. After any code change:

1. Commit and push to `main` (or push a `v*` tag). GitHub Actions builds and
   publishes `ghcr.io/kirollos-nedaa/musica`.
2. On the server, update the running container:

   ```sh
   docker compose pull && docker compose up -d
   ```

You can also trigger a rebuild manually from the **Actions** tab of the repo.

### Notes

- Logs persist in the named volume `musica-data` (mounted at `/app/data`).
- To keep logs in a host folder instead, create `./data` owned by UID 1000
  (`mkdir -p data && sudo chown -R 1000:1000 data`) and change the volume to
  `./data:/app/data`.
- The container runs as user `node` (UID 1000) and includes a built-in
  healthcheck against `/healthz`.
- If the repo is set to private, log in once on the server
  (`docker login ghcr.io -u <your-github-username>` and use a
  [PAT with `read:packages`](https://github.com/settings/tokens)).
- To change the dashboard port, edit the left side of `11234:3000` in
  `docker-compose.yml` (e.g. `8080:3000`).

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `11234` | Dashboard/API port |
| `HOST` | `0.0.0.0` | Bind address |
| `ADMIN_PASSWORD` | - | Dashboard password |
| `ADMIN_SESSION_MINUTES` | `1440` | Session TTL |
| `MAX_QUEUE` | `250` | Max queued songs per guild |
| `MAX_PREVIOUS_SONGS` | `50` | Max saved previous tracks |
| `EMPTY_COOLDOWN_SECONDS` | `30` | Auto-leave delay when empty |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `LOG_FILE` | `data/logs/app.log` | Log file path |
| `LOG_MAX_BYTES` | `5MB` | Log rotation size |
| `RESTART_BASE_DELAY_MS` | `1000` | Initial restart delay |
| `RESTART_MAX_DELAY_MS` | `15000` | Max restart backoff |

## Development

Run the bot without the manager (for direct testing):

```sh
npm run bot
```
