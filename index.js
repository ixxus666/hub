const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require("@discordjs/voice");
const ytdlp = require("yt-dlp-core");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const queues = new Map();
const loops = new Map();

function getQueue(guildId) {
  if (!queues.has(guildId)) queues.set(guildId, []);
  return queues.get(guildId);
}

async function playNext(guild, voiceChannel, textChannel) {
  const queue = getQueue(guild.id);
  if (queue.length === 0) return;

  const song = queue.shift();
  const stream = ytdlp.stream(song, { filter: "audioonly" });

  const resource = createAudioResource(stream);
  const player = createAudioPlayer();

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator
  });

  connection.subscribe(player);
  player.play(resource);

  textChannel.send(`🎶 Now playing: **${song}**`);

  player.on(AudioPlayerStatus.Idle, () => {
    if (loops.get(guild.id)) queue.push(song);
    playNext(guild, voiceChannel, textChannel);
  });
}

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!") || message.author.bot) return;

  const args = message.content.slice(1).split(" ");
  const command = args.shift().toLowerCase();
  const voiceChannel = message.member.voice.channel;
  const queue = getQueue(message.guild.id);

  if (command === "play") {
    if (!voiceChannel) return message.reply("Join a voice channel first.");
    const query = args.join(" ");
    if (!query) return message.reply("Give a song name or link.");

    queue.push(query);
    message.reply("➕ Added to queue");

    if (queue.length === 1) {
      playNext(message.guild, voiceChannel, message.channel);
    }
  }

  if (command === "skip") {
    message.reply("⏭ Skipped");
    playNext(message.guild, voiceChannel, message.channel);
  }

  if (command === "stop") {
    queue.length = 0;
    message.guild.members.me.voice.disconnect();
    message.reply("⏹ Stopped");
  }

  if (command === "pause") {
    message.guild.members.me.voice.connection.state.subscription.player.pause();
    message.reply("⏸ Paused");
  }

  if (command === "resume") {
    message.guild.members.me.voice.connection.state.subscription.player.unpause();
    message.reply("▶️ Resumed");
  }

  if (command === "queue") {
    if (queue.length === 0) return message.reply("📭 Queue empty");
    message.reply(queue.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  }

  if (command === "loop") {
    const enabled = !loops.get(message.guild.id);
    loops.set(message.guild.id, enabled);
    message.reply(`🔁 Loop ${enabled ? "enabled" : "disabled"}`);
  }

  if (command === "leave") {
    message.guild.members.me.voice.disconnect();
    message.reply("👋 Left voice channel");
  }
});

client.login(process.env.TOKEN);
