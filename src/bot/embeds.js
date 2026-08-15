const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const controls1 = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('pause').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary)
);

const controls2 = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('stop').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('repeat').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
);

const pausedRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('resume').setEmoji('▶️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary)
);

const trackQueuedEmbed = (queue, song) =>
  new EmbedBuilder()
    .setColor('Blue')
    .addFields(
      { name: 'Track Queued:', value: `**#\`${queue.songs.length}\`** - [\`${song.name}\`](${song.url})`, inline: true },
      { name: 'Requested by:', value: `<@${song.user.id}>`, inline: true },
      { name: 'Duration:', value: `\`${song.formattedDuration}\``, inline: true }
    )
    .setTimestamp()
    .setFooter({
      text: `${song.user.tag}`,
      iconURL: song.user.displayAvatarURL({ dynamic: true }),
    });

const nowPlayingEmbed = (song) =>
  new EmbedBuilder()
    .setTitle('🎶 Now Playing')
    .setColor('Green')
    .setThumbnail(song.thumbnail)
    .addFields(
      { name: 'Track:', value: `[\`${song.name}\`](${song.url})` },
      { name: 'Requested By:', value: `<@${song.user.id}>`, inline: true },
      { name: 'Duration:', value: `\`${song.formattedDuration}\``, inline: true }
    )
    .setImage('https://c.tenor.com/fdHXQgnfQGUAAAAC/tenor.gif')
    .setTimestamp()
    .setFooter({ text: `${song.user.tag}`, iconURL: song.user.displayAvatarURL({ dynamic: true }) });

const queueEmbed = (queue) => {
  const songs = queue?.songs || [];
  const current = songs[0];

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('🎶 Queue')
    .setTimestamp();

  if (!current) {
    return embed.setDescription('**Queue is empty.**');
  }

  embed.setThumbnail(current.thumbnail || null);
  embed.addFields(
    { name: 'Now Playing:', value: `**#\`1\`** - [\`${current.name}\`](${current.url})`, inline: true },
    { name: 'Requested by:', value: `<@${current.user?.id || 'unknown'}>`, inline: true },
    { name: 'Duration:', value: `\`${current.formattedDuration}\``, inline: true }
  );

  const rest = songs.slice(1);
  if (!rest.length) {
    embed.addFields({ name: 'Up Next:', value: 'No more songs in the queue.' });
  } else {
    const lines = rest.map(
      (song, i) => `#\`${i + 2}\` - [\`${song.name}\`](${song.url}) - \`${song.formattedDuration}\``
    );
    const MAX_CHUNKS = 21;
    const chunks = [];
    let buf = [];
    let len = 0;
    for (const line of lines) {
      if (buf.length && len + line.length + 1 > 1024) {
        chunks.push(buf);
        buf = [];
        len = 0;
        if (chunks.length >= MAX_CHUNKS) break;
      }
      buf.push(line);
      len += line.length + 1;
    }
    if (buf.length) chunks.push(buf);
    chunks.forEach((chunk, idx) => {
      embed.addFields({ name: idx === 0 ? 'Up Next:' : 'Up Next (continued):', value: chunk.join('\n').slice(0, 1024) });
    });
    const shown = chunks.reduce((acc, c) => acc + c.length, 0);
    if (shown < lines.length) {
      embed.addFields({ name: 'Up Next (continued):', value: `...and ${lines.length - shown} more songs in the queue.` });
    }
  }

  if (current.user) {
    embed.setFooter({ text: current.user.tag, iconURL: current.user.displayAvatarURL({ dynamic: true }) });
  }
  return embed;
};

const queueFinishedEmbed = () =>
  new EmbedBuilder().setColor('Green').setDescription('**Queue finished.**').setTimestamp();

const errorEmbed = (title, message) =>
  new EmbedBuilder().setColor('Red').setTitle(title).setDescription(message).setTimestamp();

const repeatEmbed = (mode) =>
  new EmbedBuilder().setDescription(`🔁 Repeat mode set to: **${mode}**`).setColor('Blue').setTimestamp();

const stoppedEmbed = (userId) =>
  new EmbedBuilder().setDescription(`<@${userId}> **stopped** the queue.`).setColor('Red').setTimestamp();

const noSongsLeftEmbed = () =>
  new EmbedBuilder().setDescription('No more **songs** in the **queue** to skip to.').setColor('Red').setTimestamp();

const playlistAddedEmbed = (playlist, count) =>
  new EmbedBuilder()
    .setColor('Blue')
    .setTitle('🎵 Playlist added')
    .setDescription(`[**${playlist.name}**](${playlist.url})`)
    .addFields({ name: 'Songs:', value: `\`${count}\``, inline: true })
    .setThumbnail(playlist.thumbnail || null)
    .setTimestamp();

module.exports = {
  controls1,
  controls2,
  pausedRow,
  trackQueuedEmbed,
  nowPlayingEmbed,
  queueEmbed,
  queueFinishedEmbed,
  errorEmbed,
  repeatEmbed,
  stoppedEmbed,
  noSongsLeftEmbed,
  playlistAddedEmbed,
};
