const songSummary = (song) => {
  if (!song) return null;
  return {
    id: song.id,
    name: song.name,
    url: song.url,
    thumbnail: song.thumbnail || null,
    duration: song.duration || 0,
    formattedDuration: song.formattedDuration,
    isLive: Boolean(song.isLive),
    source: song.source,
    requestedBy: song.user ? { id: song.user.id, tag: song.user.tag } : null,
  };
};

const voiceChannelSummary = (channel) => {
  if (!channel) return null;
  return {
    id: channel.id,
    name: channel.name,
    memberCount: channel.members?.size ?? 0,
  };
};

function buildState(client, distube) {
  const guilds = [];
  const players = [];

  for (const guild of client.guilds.cache.values()) {
    const queue = distube.getQueue(guild.id);
    const voice = guild.members.me?.voice?.channel || null;

    const voiceChannels = [...guild.channels.cache.filter((c) => c.isVoiceBased()).values()]
      .map((c) => ({
        id: c.id,
        name: c.name,
        memberCount: c.members?.size ?? 0,
        userLimit: c.userLimit ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    guilds.push({
      id: guild.id,
      name: guild.name,
      iconURL: guild.iconURL({ dynamic: true, size: 128 }) || null,
      memberCount: guild.memberCount,
      voiceChannel: voiceChannelSummary(voice),
      voiceChannels,
      playing: queue ? songSummary(queue.songs?.[0]) : null,
    });

    if (queue) {
      players.push({
        guildId: guild.id,
        guildName: guild.name,
        current: songSummary(queue.songs?.[0]),
        position: queue.currentTime || 0,
        duration: queue.songs?.[0]?.duration || 0,
        paused: queue.paused,
        repeatMode: queue.repeatMode ?? 0,
        volume: queue.volume ?? 50,
        queue: (queue.songs || []).slice(0, 100).map(songSummary),
        queueLength: queue.songs?.length || 0,
        voiceChannel: voiceChannelSummary(queue.voiceChannel),
        textChannel: queue.textChannel ? { id: queue.textChannel.id, name: queue.textChannel.name } : null,
      });
    }

    if (voice && !queue) {
      players.push({
        guildId: guild.id,
        guildName: guild.name,
        current: null,
        position: 0,
        duration: 0,
        paused: false,
        repeatMode: 0,
        volume: 50,
        queue: [],
        queueLength: 0,
        voiceChannel: voiceChannelSummary(voice),
        textChannel: null,
      });
    }
  }

  const me = client.user;

  return {
    bot: {
      id: me?.id || null,
      tag: me?.tag || null,
      avatarURL: me?.avatarURL({ dynamic: true, size: 128 }) || null,
      ready: client.isReady(),
      uptime: client.uptime || 0,
      ping: client.ws.ping,
      guildCount: client.guilds.cache.size,
    },
    guilds,
    players,
    voiceChannels: guilds.map((g) => g.voiceChannel).filter(Boolean),
  };
}

module.exports = { buildState, songSummary };
