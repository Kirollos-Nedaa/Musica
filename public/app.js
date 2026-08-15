/* Musica dashboard client */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const S = {
    token: null,
    ws: null,
    retry: 0,
    retryTimer: null,
    state: null,
    status: null,
    seq: 0,
    lastStateAt: 0,
    statePosition: 0,
    selectedGuildId: null,
  };

  /* ---------- helpers ---------- */

  function toast(msg, isError) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function fmtUptime(ms) {
    if (!ms) return '-';
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function requestId() {
    return ++S.seq;
  }

  function sendControl(action, payload = {}) {
    if (!S.ws || S.ws.readyState !== WebSocket.OPEN) {
      toast('Not connected', true);
      return null;
    }
    const rid = requestId();
    S.ws.send(JSON.stringify({ type: 'control', action, payload, requestId: rid }));
    return rid;
  }

  /* ---------- auth / connection ---------- */

  async function login(password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Login failed');
    return data.token;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    S.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token: S.token }));
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      handleMessage(msg);
    };

    ws.onclose = (ev) => {
      setConn('offline', 'Disconnected');
      if (ev.code === 4001) {
        sessionStorage.removeItem('musica_token');
        showLogin();
        toast('Session expired - sign in again', true);
        return;
      }
      S.retry = Math.min(S.retry + 1, 6);
      const delay = 500 * Math.pow(2, S.retry);
      clearTimeout(S.retryTimer);
      S.retryTimer = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      setConn('offline', 'Error');
    };
  }

  function handleMessage(msg) {
    if (msg.type === 'hello') {
      setConn('online', 'Connected');
      S.retry = 0;
      S.status = msg.status;
      S.state = msg.state;
      for (const entry of msg.logs || []) renderLog(entry);
      renderStatus();
      renderAll();
      toast(`Connected - ${msg.status.botReady ? 'bot online' : 'bot offline'}`);
    } else if (msg.type === 'status') {
      S.status = msg.status;
      renderStatus();
    } else if (msg.type === 'state') {
      S.state = msg.state;
      const p = currentPlayer();
      S.lastStateAt = Date.now();
      S.statePosition = p?.position || 0;
      renderAll();
    } else if (msg.type === 'log') {
      renderLog(msg.entry);
    } else if (msg.type === 'control:result') {
      if (msg.ok) {
        if (msg.action !== 'shutdown') toast(`${label(msg.action)} done`);
      } else {
        toast(`${label(msg.action)} failed: ${msg.error || 'unknown error'}`, true);
      }
    } else if (msg.type === 'search:results') {
      renderSearchResults(msg.results || []);
    }
  }

  const LABELS = {
    play: 'Play',
    add: 'Add',
    search: 'Search',
    pause: 'Pause',
    resume: 'Resume',
    skip: 'Skip',
    stop: 'Stop',
    shuffle: 'Shuffle',
    previous: 'Previous',
    volume: 'Volume',
    repeat: 'Repeat',
    jump: 'Jump',
    remove: 'Remove',
    clear: 'Clear queue',
    shutdown: 'Shutdown',
    status: 'Status',
  };
  const label = (a) => LABELS[a] || a;

  /* ---------- rendering ---------- */

  function setConn(kind, text) {
    const el = $('conn-indicator');
    el.className = 'conn ' + kind;
    $('conn-text').textContent = text;
  }

  function renderStatus() {
    const st = S.status;
    if (!st) return;
    const run = $('srv-running');
    const ready = $('srv-ready');
    run.textContent = st.botRunning ? 'running' : 'stopped';
    run.className = 'pill ' + (st.botRunning ? 'ok' : 'bad');
    ready.textContent = st.botReady ? 'ready' : 'not ready';
    ready.className = 'pill ' + (st.botReady ? 'ok' : 'bad');
    $('srv-pid').textContent = st.pid ?? '-';
    $('srv-restarts').textContent = st.restarts ?? 0;
    const le = $('srv-lastexit');
    if (st.lastExit) {
      le.hidden = false;
      le.textContent = `last exit code=${st.lastExit.code ?? '-'} signal=${st.lastExit.signal ?? '-'}`;
    } else {
      le.hidden = true;
    }
  }

  function renderAll() {
    renderHeader();
    renderGuildSelect();
    renderGuildList();
    renderPlayer();
    renderQueue();
  }

  function renderHeader() {
    const bot = S.state?.bot;
    if (!bot) return;
    $('bot-avatar').src = bot.avatarURL || '';
    $('bot-name').textContent = bot.tag || 'Musica';
    $('bot-tag').textContent = bot.ready ? 'ready' : 'connecting...';
    $('bot-guilds').textContent = bot.guildCount ?? 0;
    $('bot-ping').textContent = Math.round(bot.ping ?? 0);
    $('bot-uptime').textContent = fmtUptime(bot.uptime);
  }

  function selectedGuild() {
    return (S.state?.guilds || []).find((g) => g.id === S.selectedGuildId) || null;
  }

  function renderGuildSelect() {
    const select = $('guild-select');
    const guilds = S.state?.guilds || [];
    if (!S.selectedGuildId || !guilds.some((g) => g.id === S.selectedGuildId)) {
      const withPlayer = S.state?.players?.find((p) => p.guildId);
      S.selectedGuildId = (withPlayer && withPlayer.guildId) || guilds[0]?.id || null;
    }
    select.innerHTML = guilds
      .map(
        (g) =>
          `<option value="${g.id}"${g.id === S.selectedGuildId ? ' selected' : ''}>${escapeHtml(g.name)}</option>`
      )
      .join('');
    select.disabled = guilds.length === 0;
    renderChannelSelect();
  }

  function renderChannelSelect() {
    const select = $('channel-select');
    const guild = selectedGuild();
    const channels = guild?.voiceChannels || [];
    let preferred = channels.find((c) => c.id === guild.voiceChannel?.id);
    if (!preferred) preferred = channels[0] || null;
    select.innerHTML = channels
      .map(
        (c) =>
          `<option value="${c.id}"${c.id === preferred?.id ? ' selected' : ''}>${escapeHtml(c.name)}${c.memberCount ? ` (${c.memberCount})` : ''}</option>`
      )
      .join('');
    select.disabled = channels.length === 0;
    if (channels.length === 0) {
      select.innerHTML = '<option value="">no voice channels</option>';
    }
  }

  function renderGuildList() {
    const ul = $('guild-list');
    const guilds = S.state?.guilds || [];
    ul.innerHTML = guilds
      .map((g) => {
        const inVoice = g.voiceChannel
          ? `<span class="guild-meta">\u266B ${escapeHtml(g.voiceChannel.name)}</span>`
          : `<span class="guild-meta">${g.memberCount}</span>`;
        return `<li class="${g.id === S.selectedGuildId ? 'active' : ''}" data-guild="${g.id}">
          ${g.iconURL ? `<img src="${g.iconURL}" alt="" />` : ''}
          <span class="guild-name">${escapeHtml(g.name)}</span>
          ${inVoice}
        </li>`;
      })
      .join('');
    for (const li of ul.querySelectorAll('li')) {
      li.addEventListener('click', () => {
        S.selectedGuildId = li.dataset.guild;
        renderGuildSelect();
        renderGuildList();
        renderPlayer();
      });
    }
  }

  function currentPlayer() {
    const guild = selectedGuild();
    return (S.state?.players || []).find((p) => p.guildId === guild?.id) ||
      (S.state?.players || [])[0] ||
      null;
  }

  function renderPlayer() {
    const p = currentPlayer();
    const title = $('np-title');
    const art = $('np-art');
    const empty = $('empty-hint');

    if (!p || !p.current) {
      title.textContent = 'Nothing playing';
      title.removeAttribute('href');
      art.src = '';
      $('np-source').textContent = p ? `${p.guildName} - connected` : 'No active player';
      $('np-requester').textContent = '';
      $('progress-pos').textContent = '0:00';
      $('progress-dur').textContent = '0:00';
      $('progress-fill').style.width = '0%';
      setControlState(false, false);
      $('volume').value = p ? p.volume : 50;
      $('volume-value').textContent = `${p ? p.volume : 50}%`;
      empty.hidden = false;
      empty.textContent = p
        ? 'In the voice channel - use Search above to play something.'
        : 'The bot is not in any voice channel. Pick a server and channel, then search.';
      $('btn-playpause').disabled = true;
      $('btn-stop').disabled = true;
      $('btn-skip').disabled = true;
      $('btn-shuffle').disabled = true;
      $('btn-repeat').disabled = true;
      $('btn-previous').disabled = true;
      return;
    }

    empty.hidden = true;
    S.lastStateAt = Date.now();
    S.statePosition = p.position || 0;

    title.textContent = p.current.name;
    title.href = p.current.url || '#';
    art.src = p.current.thumbnail || '';
    $('np-source').textContent = [p.guildName, p.current.source].filter(Boolean).join(' - ');
    $('np-requester').textContent = p.current.requestedBy ? `requested by ${p.current.requestedBy.tag}` : '';
    $('progress-dur').textContent = p.current.formattedDuration || fmtTime(p.duration);

    const total = p.current.duration || 0;
    if (p.paused) {
      $('progress-pos').textContent = fmtTime(p.position);
      $('progress-fill').style.width = total ? `${Math.min(100, (p.position / total) * 100)}%` : '0%';
    }

    setControlState(true, p.paused);
    updatePlayPauseIcon(p.paused);
    updateRepeat(p.repeatMode || 0);
    updateShuffle(p.shuffle ? true : false);
    $('volume').value = p.volume ?? 50;
    $('volume-value').textContent = `${p.volume ?? 50}%`;
    const play = $('btn-playpause');
    play.disabled = false;
    $('btn-stop').disabled = false;
    $('btn-skip').disabled = p.queue.length < 2;
    $('btn-shuffle').disabled = false;
    $('btn-repeat').disabled = false;
    $('btn-previous').disabled = false;
  }

  function setControlState(_enabled, paused) {
    updatePlayPauseIcon(paused);
  }

  function updatePlayPauseIcon(paused) {
    $('ic-play').hidden = !paused;
    $('ic-pause').hidden = paused;
  }

  function updateRepeat(mode) {
    const btn = $('btn-repeat');
    btn.classList.toggle('active', mode > 0);
    const badge = $('repeat-badge');
    badge.textContent = mode === 1 ? '1' : mode === 2 ? 'A' : '';
  }

  function updateShuffle(on) {
    $('btn-shuffle').classList.toggle('active', on);
  }

  function progressTick() {
    const p = currentPlayer();
    if (!p || !p.current || p.paused) return;
    const total = p.current.duration || 0;
    if (!total) {
      $('progress-pos').textContent = 'LIVE';
      $('progress-fill').style.width = '0%';
      return;
    }
    const elapsed = (Date.now() - S.lastStateAt) / 1000;
    const pos = Math.min(S.statePosition + elapsed, total);
    $('progress-pos').textContent = fmtTime(pos);
    $('progress-fill').style.width = `${Math.min(100, (pos / total) * 100)}%`;
  }

  function renderQueue() {
    const p = currentPlayer();
    const list = $('queue-list');
    const empty = $('queue-empty');
    const items = p?.queue || [];

    if (!items.length) {
      list.innerHTML = '';
      empty.hidden = false;
      $('btn-clear').disabled = true;
      return;
    }
    empty.hidden = true;
    $('btn-clear').disabled = items.length < 2;

    list.innerHTML = items
      .map((song, idx) => {
        const isCurrent = idx === 0 && p.current;
        const meta = [song.formattedDuration || fmtTime(song.duration), song.requestedBy?.tag || '']
          .filter(Boolean)
          .join(' - ');
        const actions = `<span class="q-actions">
          ${idx > 0 ? `<button data-act="jump" data-i="${idx}" title="Play now">&#9654;</button>` : ''}
          <button data-act="remove" data-i="${idx}" title="Remove">&times;</button>
        </span>`;
        return `<li class="${isCurrent ? 'current' : ''}">
          <span class="q-index">${idx + 1}</span>
          <span class="q-name">${escapeHtml(song.name)}</span>
          <span class="q-meta">${escapeHtml(meta)}</span>
          ${actions}
        </li>`;
      })
      .join('');

    for (const btn of list.querySelectorAll('button')) {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);
        if (btn.dataset.act === 'jump') sendControl('jump', { guildId: currentPlayer().guildId, index: i });
        else sendControl('remove', { guildId: currentPlayer().guildId, index: i });
      });
    }
  }

  function renderLog(entry) {
    const logs = $('logs');
    const li = document.createElement('li');
    const ts = new Date(entry.ts).toLocaleTimeString();
    const meta = entry.meta && Object.keys(entry.meta).length ? ' ' + JSON.stringify(entry.meta) : '';
    li.innerHTML =
      `<span class="ts">${ts}</span>` +
      `<span class="lv lv-${entry.level || 'info'}">${(entry.level || 'info').toUpperCase()}</span>` +
      `<span class="nm">${escapeHtml(entry.name || '')}</span>` +
      `<span class="msg">${escapeHtml(String(entry.msg || ''))}${escapeHtml(meta)}</span>`;
    logs.appendChild(li);
    while (logs.children.length > 500) logs.removeChild(logs.firstChild);
    if ($('auto-scroll').checked) logs.scrollTop = logs.scrollHeight;
  }

  function renderSearchResults(results) {
    const ul = $('search-results');
    ul.hidden = results.length === 0;
    ul.innerHTML = results
      .map(
        (r) => `<li data-url="${escapeHtml(r.url)}" title="Click to play">
          ${r.thumbnail ? `<img src="${r.thumbnail}" alt="" />` : ''}
          <span class="sr-name">${escapeHtml(r.name)}</span>
          <span class="sr-dur">${escapeHtml(r.duration || '')}</span>
        </li>`
      )
      .join('');
    for (const li of ul.querySelectorAll('li')) {
      li.addEventListener('click', playUrl(li.dataset.url));
    }
  }

  function playUrl(url) {
    return () => {
      const guild = selectedGuild();
      const channel = $('channel-select').value;
      if (!guild) return toast('No server selected', true);
      if (!channel) return toast('No voice channel available in this server', true);
      sendControl('play', { guildId: guild.id, voiceChannelId: channel, query: url });
      $('search-results').hidden = true;
    };
  }

  function doSearch() {
    const query = $('search-input').value.trim();
    if (!query) return;
    const rid = requestId();
    sendControl('search', { query, limit: 8, requestId: rid });
  }

  /* ---------- wire up ---------- */

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showApp() {
    $('login-screen').hidden = true;
    $('app').hidden = false;
  }

  function showLogin() {
    $('login-screen').hidden = false;
    $('app').hidden = true;
    $('password').focus();
    if (S.ws) {
      try {
        S.ws.close();
      } catch {}
      S.ws = null;
    }
  }

  function bindEvents() {
    $('login-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $('login-btn');
      const err = $('login-error');
      btn.disabled = true;
      err.hidden = true;
      try {
        S.token = await login($('password').value);
        sessionStorage.setItem('musica_token', S.token);
        showApp();
        connect();
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });

    $('logout-btn').addEventListener('click', async () => {
      try {
        await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${S.token}` } });
      } catch {}
      sessionStorage.removeItem('musica_token');
      showLogin();
    });

    $('search-btn').addEventListener('click', doSearch);
    $('search-input').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') doSearch();
    });

    $('btn-playpause').addEventListener('click', () => {
      const p = currentPlayer();
      if (!p) return;
      sendControl(p.paused ? 'resume' : 'pause', { guildId: p.guildId });
    });
    $('btn-stop').addEventListener('click', () => {
      const p = currentPlayer();
      if (p) sendControl('stop', { guildId: p.guildId });
    });
    $('btn-skip').addEventListener('click', () => {
      const p = currentPlayer();
      if (p) sendControl('skip', { guildId: p.guildId });
    });
    $('btn-previous').addEventListener('click', () => {
      const p = currentPlayer();
      if (p) sendControl('previous', { guildId: p.guildId });
    });
    $('btn-shuffle').addEventListener('click', () => {
      const p = currentPlayer();
      if (p) sendControl('shuffle', { guildId: p.guildId });
    });
    $('btn-repeat').addEventListener('click', () => {
      const p = currentPlayer();
      if (p) sendControl('repeat', { guildId: p.guildId });
    });
    $('btn-clear').addEventListener('click', () => {
      const p = currentPlayer();
      if (p) sendControl('clear', { guildId: p.guildId });
    });

    let volumeTimer = null;
    $('volume').addEventListener('input', () => {
      const p = currentPlayer();
      if (!p) return;
      clearTimeout(volumeTimer);
      const v = Number($('volume').value);
      $('volume-value').textContent = `${v}%`;
      volumeTimer = setTimeout(() => sendControl('volume', { guildId: p.guildId, volume: v }), 400);
    });

    $('guild-select').addEventListener('change', () => {
      S.selectedGuildId = $('guild-select').value;
      renderGuildSelect();
      renderGuildList();
      renderPlayer();
      renderQueue();
    });
  }

  function init() {
    bindEvents();
    const saved = sessionStorage.getItem('musica_token');
    if (saved) {
      S.token = saved;
      showApp();
      connect();
    } else {
      $('password').focus();
    }
    setInterval(progressTick, 500);
  }

  init();
})();
