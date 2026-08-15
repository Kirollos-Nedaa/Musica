const { RepeatMode } = require('distube');
const embeds = require('./embeds');

const isQueue = (queue) => Boolean(queue && queue.songs && queue.songs.length > 0);

function registerHandlers({ client, distube, config, logger }) {
  const attempt = async (interaction, fn) => {
    try {
      await fn(interaction);
    } catch (err) {
      logger.error(`Interaction failed (${interaction.customId || interaction.commandName})`, {
        guildId: interaction.guildId,
        userId: interaction.user?.id,
        error: err.stack || err.message,
      });
      try {
        const reply = { embeds: [embeds.errorEmbed('❌ An error occurred', `\`\`\`${(err.message || err).toString().slice(0, 1000)}\`\`\``)] };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(reply);
        } else if (interaction.isButton()) {
          await interaction.update(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch {
        // interaction is gone or already replied; nothing more we can do
      }
    }
  };

  client.on('interactionCreate', (interaction) => {
    if (interaction.isCommand()) {
      attempt(interaction, async (it) => {
        const { commandName } = it;
        const queue = distube.getQueue(it.guild.id);

        if (commandName === 'play') {
          await handlePlay(it, queue);
        } else if (commandName === 'pause') {
          if (!isQueue(queue)) return it.reply('🚫 No song is currently playing.');
          queue.pause();
          await it.reply('⏸️ Paused.');
        } else if (commandName === 'resume') {
          if (!isQueue(queue)) return it.reply('🚫 No song is currently playing.');
          queue.resume();
          await it.reply('▶️ Resumed.');
        } else if (commandName === 'stop') {
          await it.deferReply();
          if (!isQueue(queue)) return it.editReply('🚫 Not connected to any voice channel.');
          const requesterId = queue.songs[0].user?.id || it.user.id;
          queue.stop();
          await it.editReply({ embeds: [embeds.stoppedEmbed(requesterId)], components: [] });
        } else if (commandName === 'skip') {
          await it.deferReply();
          if (queue && queue.songs.length > 1) {
            queue.skip();
            const song = queue.songs[0];
            await it.editReply({ embeds: [embeds.nowPlayingEmbed(song)], components: [embeds.controls1, embeds.controls2] });
          } else {
            await it.editReply({ embeds: [embeds.noSongsLeftEmbed()], components: [embeds.controls1, embeds.controls2] });
          }
        } else if (commandName === 'now-playing') {
          if (!isQueue(queue)) return it.reply('🚫 No song is currently playing.');
          await it.reply({
            embeds: [embeds.nowPlayingEmbed(queue.songs[0])],
            components: [embeds.controls1, embeds.controls2],
          });
        }
      });
    } else if (interaction.isButton()) {
      attempt(interaction, async (it) => {
        const queue = distube.getQueue(it.guild.id);
        await handleButton(it, queue);
      });
    }
  });

  const handlePlay = async (interaction, existingQueue) => {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply('🚫 You need to be in a voice channel to play music!');
    }
    const query = interaction.options.getString('query');
    if (!query) {
      return interaction.reply('🚫 Please provide a song name or URL!');
    }

    await interaction.deferReply();
    logger.info(`Playing request in ${interaction.guild.name}: ${query}`, {
      guildId: interaction.guildId,
      query,
      voiceChannel: voiceChannel.name,
    });

    await distube.play(voiceChannel, query, {
      member: interaction.member,
      textChannel: interaction.channel,
      playlist: true,
    });

    const queue = distube.getQueue(interaction.guild.id);
    if (!queue) {
      return interaction.editReply('🚫 Could not create a queue.');
    }

    if (queue.songs.length > config.maxQueueSize) {
      const removed = queue.songs.splice(config.maxQueueSize).length;
      logger.warn(`Queue trimmed, removed ${removed} songs (max ${config.maxQueueSize})`, { guildId: interaction.guildId });
    }

    const song = queue.songs[queue.songs.length - 1];
    await interaction.editReply({ embeds: [embeds.trackQueuedEmbed(queue, song)] });
  };

  const handleButton = async (interaction, queue) => {
    const { customId } = interaction;

    if (customId === 'repeat') {
      if (!isQueue(queue)) return interaction.reply('🚫 No song is currently playing.');
      const repeatModes = [RepeatMode.DISABLED, RepeatMode.SONG, RepeatMode.QUEUE];
      queue.setRepeatMode((queue.repeatMode + 1) % 3);
      const currentMode = ['Off', 'Song', 'Queue'][queue.repeatMode];
      await interaction.reply({ embeds: [embeds.repeatEmbed(currentMode)] });
      return;
    }

    if (customId === 'stop') {
      await interaction.deferReply();
      if (!isQueue(queue)) return interaction.editReply('🚫 Not connected to any voice channel.');
      const requesterId = queue.songs[0].user?.id || interaction.user.id;
      queue.stop();
      await interaction.editReply({ embeds: [embeds.stoppedEmbed(requesterId)], components: [] });
      return;
    }

    if (customId === 'pause') {
      if (!isQueue(queue)) return interaction.reply('🚫 No song is currently playing.');
      queue.pause();
      await interaction.update({ components: [embeds.pausedRow, embeds.controls2] });
      return;
    }

    if (customId === 'resume') {
      if (!isQueue(queue)) return interaction.reply('🚫 No song is currently playing.');
      queue.resume();
      await interaction.update({ components: [embeds.controls1, embeds.controls2] });
      return;
    }

    if (customId === 'skip') {
      await interaction.deferReply();
      if (queue && queue.songs.length > 1) {
        queue.skip();
        const song = queue.songs[0];
        await interaction.editReply({ embeds: [embeds.nowPlayingEmbed(song)], components: [embeds.controls1, embeds.controls2] });
      } else {
        await interaction.editReply({ embeds: [embeds.noSongsLeftEmbed()], components: [embeds.controls1, embeds.controls2] });
      }
      return;
    }

    if (customId === 'shuffle') {
      if (!isQueue(queue)) return interaction.reply('🚫 No song is currently playing.');
      queue.shuffle();
      await interaction.reply('🔀 Queue shuffled!');
      return;
    }

    if (customId === 'previous') {
      if (!isQueue(queue)) return interaction.reply('🚫 No song is currently playing.');
      queue.previous();
      await interaction.reply('⏮️ Playing previous track.');
    }
  };
}

module.exports = { registerHandlers };
