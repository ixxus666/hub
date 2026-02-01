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


client.login(process.env.TOKEN);
