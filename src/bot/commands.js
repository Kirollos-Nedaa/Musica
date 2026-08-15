const { ApplicationCommandOptionType } = require('discord.js');

const commands = [
  {
    name: 'play',
    description: 'Insert a Youtube URL or a search query to play a song',
    options: [
      {
        name: 'query',
        description: 'Name or URL of track to play',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  { name: 'pause', description: 'Pause the Song' },
  { name: 'resume', description: 'Resume the Song' },
  { name: 'stop', description: 'Stop the Song' },
  { name: 'skip', description: 'Skips the current Song' },
  { name: 'now-playing', description: 'Shows you what is playing' },
  { name: 'queue', description: 'Shows the full queue' },
];

module.exports = { commands };
