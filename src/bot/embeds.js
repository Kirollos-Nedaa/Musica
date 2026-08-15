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
  queueFinishedEmbed,
  errorEmbed,
  repeatEmbed,
  stoppedEmbed,
  noSongsLeftEmbed,
  playlistAddedEmbed,
};
