require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

// Bot Commands Registration 
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

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        const guildIds = (process.env.GUILD_IDS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (guildIds.length === 0) {
            console.error('No guild IDs configured. Set GUILD_IDS in your .env file.');
            process.exit(1);
        }
        console.log(`Registering commands for ${guildIds.length} guild(s)...`);

        for (const guildId of guildIds) {
            console.log(`Registering commands for guild ID: ${guildId}`);
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands }
            );
            console.log(`Commands registered for guild ID: ${guildId}`);
        }

        console.log('All commands registered ✅');
    } catch (error) {
        console.error(`Error registering commands: ${error}`);
    }
})();
