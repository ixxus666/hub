const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require("@discordjs/voice");

const playdl = require("play-dl");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const queues = new Map();
const players = new Map();
const loops = new Map();

function getQueue(guildId) {
  if (!queues.has(guildId)) queues.set(guildId, []);
  return queues.get(guildId);
}


/* ---------------- AUTOMOD CONFIG ---------------- */

const bannedWords = [
  "nigger",
  "nigga",
  "fuck",
  "scam",
  "free nitro"
];

const spamMap = new Map();
const SPAM_LIMIT = 5;      // messages
const SPAM_TIME = 4000;    // ms

const blockLinks = true;

/* ---------------- AUTOMOD HANDLER ---------------- */

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.toLowerCase();

  /* 🚫 BAD WORD FILTER */
  if (bannedWords.some(word => content.includes(word))) {
    await message.delete().catch(() => {});
    return message.channel.send(
      `⚠️ ${message.author}, that language is not allowed.`
    );
  }

  /* 🔗 LINK BLOCKER */
  if (blockLinks && /(discord\.gg|https?:\/\/)/i.test(content)) {
    await message.delete().catch(() => {});
    return message.channel.send(
      `🔗 ${message.author}, links are not allowed here.`
    );
  }

  /* 🔁 SPAM DETECTION */
  const now = Date.now();
  const userData = spamMap.get(message.author.id) || { count: 0, last: now };

  if (now - userData.last < SPAM_TIME) {
    userData.count++;
    if (userData.count >= SPAM_LIMIT) {
      await message.delete().catch(() => {});
      spamMap.set(message.author.id, { count: 0, last: now });
      return message.channel.send(
        `⛔ ${message.author}, stop spamming.`
      );
    }
  } else {
    userData.count = 1;
  }

  userData.last = now;
  spamMap.set(message.author.id, userData);
});

/* ---------------- SLASH COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder().setName("play").setDescription("Play a song")
    .addStringOption(o => o.setName("query").setDescription("Song or URL").setRequired(true)),

  new SlashCommandBuilder().setName("pause").setDescription("Pause playback"),
  new SlashCommandBuilder().setName("resume").setDescription("Resume playback"),
  new SlashCommandBuilder().setName("skip").setDescription("Skip current song"),
  new SlashCommandBuilder().setName("stop").setDescription("Stop music"),
  new SlashCommandBuilder().setName("leave").setDescription("Leave voice channel"),
  new SlashCommandBuilder().setName("queue").setDescription("Show queue"),
  new SlashCommandBuilder().setName("nowplaying").setDescription("Now playing"),
  new SlashCommandBuilder().setName("loop").setDescription("Toggle loop"),
  new SlashCommandBuilder().setName("clear").setDescription("Clear queue"),
  new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle queue"),
  new SlashCommandBuilder().setName("ping").setDescription("Bot latency"),
  new SlashCommandBuilder().setName("help").setDescription("Show commands")
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log("Slash commands registered");
});

/* ---------------- PLAYER ---------------- */

async function playNext(interaction) {
  const queue = getQueue(interaction.guild.id);
  if (!queue.length) return;

  const song = queue[0];
  const stream = await playdl.stream(song.url);

  const resource = createAudioResource(stream.stream, { inputType: stream.type });
  const player = createAudioPlayer();

  players.set(interaction.guild.id, player);

  const connection = joinVoiceChannel({
    channelId: interaction.member.voice.channel.id,
    guildId: interaction.guild.id,
    adapterCreator: interaction.guild.voiceAdapterCreator
  });

  connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    if (!loops.get(interaction.guild.id)) queue.shift();
    playNext(interaction);
  });
}

/* ---------------- HANDLER ---------------- */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const queue = getQueue(interaction.guild.id);
  const vc = interaction.member.voice.channel;

  switch (interaction.commandName) {
    case "play": {
      if (!vc) return interaction.reply({ content: "Join a voice channel first.", ephemeral: true });

      const query = interaction.options.getString("query");
      const info = await playdl.search(query, { limit: 1 });
      if (!info.length) return interaction.reply("No results found.");

      queue.push({ title: info[0].title, url: info[0].url });
      await interaction.reply(`🎶 Added **${info[0].title}**`);

      if (queue.length === 1) playNext(interaction);
      break;
    }

    case "pause":
      players.get(interaction.guild.id)?.pause();
      interaction.reply("⏸ Paused");
      break;

    case "resume":
      players.get(interaction.guild.id)?.unpause();
      interaction.reply("▶️ Resumed");
      break;

    case "skip":
      players.get(interaction.guild.id)?.stop();
      interaction.reply("⏭ Skipped");
      break;

    case "stop":
      queue.length = 0;
      players.get(interaction.guild.id)?.stop();
      interaction.reply("⏹ Stopped");
      break;

    case "queue":
      if (!queue.length) return interaction.reply("Queue is empty");
      interaction.reply(queue.map((s, i) => `${i + 1}. ${s.title}`).join("\n"));
      break;

    case "nowplaying":
      if (!queue.length) return interaction.reply("Nothing playing");
      interaction.reply(`🎶 Now playing **${queue[0].title}**`);
      break;

    case "loop":
      loops.set(interaction.guild.id, !loops.get(interaction.guild.id));
      interaction.reply(`🔁 Loop ${loops.get(interaction.guild.id) ? "enabled" : "disabled"}`);
      break;

    case "clear":
      queue.length = 0;
      interaction.reply("🧹 Queue cleared");
      break;

    case "shuffle":
      queue.sort(() => Math.random() - 0.5);
      interaction.reply("🔀 Queue shuffled");
      break;

    case "ping":
      interaction.reply(`🏓 Pong: ${client.ws.ping}ms`);
      break;

    case "help":
      interaction.reply("🎵 Rhythm-style commands: /play /pause /resume /skip /queue /loop /nowplaying");
      break;
  }
});

const warnings = {}; // Format: { userId: count }

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// --- Utility Functions ---
async function logToModChannel(guild, title, description, color = 0xff0000) {
    const channel = guild.channels.cache.find(c => c.name === config.logChannel);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
    channel.send({ embeds: [embed] });
}

// --- Message Monitoring (Auto-Mod) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Bypass for Mod Role
    if (message.member.roles.cache.some(r => r.name === config.bypassRole)) return;

    // 1. Scam Phrase Detection
    if (config.settings.scamFilter) {
        const isScam = config.scamPhrases.some(phrase => message.content.toLowerCase().includes(phrase));
        if (isScam) {
            await message.delete();
            await message.member.timeout(600000, 'Sending scam links'); // 10 mins
            return logToModChannel(message.guild, '❌ Scam Detected', `${message.author.tag} was timed out for 10m for scam content.`);
        }
    }

    // 2. Caps Lock Detection (More than 70% caps and length > 10)
    if (config.settings.capsFilter && message.content.length > 10) {
        const caps = message.content.replace(/[^A-Z]/g, "").length;
        if (caps / message.content.length > 0.7) {
            await message.delete();
            message.channel.send(`${message.author}, please stop using all caps!`).then(m => setTimeout(() => m.delete(), 3000));
            return;
        }
    }

    // 3. Auto Slowmode (Triggered by rapid messages)
    if (config.settings.autoSlowmode) {
        // Simple logic: if 5 messages arrive in 3 seconds (advanced version requires a message cache)
        // For this demo, we'll keep it simple: manual check or reactive.
    }
});

// --- Interaction Handler (Commands) ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    // /warnings command
    if (commandName === 'warnings') {
        const target = options.getUser('user');
        const count = warnings[target.id] || 0;
        await interaction.reply(`${target.username} has **${count}** warnings.`);
    }

    // /config command (Toggle settings)
    if (commandName === 'config') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: "Admin only!", ephemeral: true });
        }
        const setting = options.getString('setting');
        const state = options.getBoolean('state');
        config.settings[setting] = state;
        await interaction.reply(`Setting **${setting}** is now **${state ? 'Enabled' : 'Disabled'}**.`);
    }
});

client.login(process.env.TOKEN);
