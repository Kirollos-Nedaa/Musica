FROM node:24-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

# Native build tools are only needed if an npm postinstall has to compile a
# fallback (@discordjs/opus). ca-certificates is required to download the
# yt-dlp and ffmpeg-static binaries during `npm ci`.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      python3 \
      make \
      g++ \
 && rm -rf /var/lib/apt/lists/*

# npm ci runs the postinstall scripts: @distube/yt-dlp downloads the latest
# yt-dlp binary and ffmpeg-static downloads the linux-x64 ffmpeg, so the image
# always ships a current yt-dlp (a stale binary breaks YouTube resolution).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public

# /app/data holds the logs (LOG_FILE=data/logs/app.log). Keep it writable by
# the non-root user; mount a volume here in docker-compose.
RUN mkdir -p /app/data/logs && chown -R node:node /app

USER node

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/manager.js"]
