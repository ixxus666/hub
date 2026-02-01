const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} = require("@discordjs/voice");
const ytdl = require("ytdl-core");
const ytSearch = require("yt-search"); // For search by name

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const prefix = "/";
const queue = new Map(); // per-guild queue
const players = new Map(); // per-guild audio player

client.once("ready", () => console.log(`${client.user.tag} is online!`));

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const voiceChannel = message.member.voice.channel;

  if (command === "play") {
    if (!voiceChannel)
      return message.reply("You need to be in a voice channel to play music!");
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("Connect") || !permissions.has("Speak"))
      return message.reply("I need permission to join and speak in your VC!");

    const query = args.join(" ");
    if (!query) return message.reply("Provide a song name or YouTube/Spotify URL!");

    let song;

    // If it's a YouTube URL
    if (ytdl.validateURL(query)) {
      const songInfo = await ytdl.getInfo(query);
      song = { title: songInfo.videoDetails.title, url: songInfo.videoDetails.video_url };
    } else {
      // Otherwise, search on YouTube by name (also works for Spotify track names)
      const result = await ytSearch(query);
      if (!result || !result.videos.length)
        return message.reply("No song found for that query!");
      const video = result.videos[0];
      song = { title: video.title, url: video.url };
    }

    // Add to queue
    if (!queue.has(message.guild.id)) queue.set(message.guild.id, []);
    queue.get(message.guild.id).push(song);
    message.reply(`🎶 Added **${song.title}** to the queue!`);

    if (queue.get(message.guild.id).length === 1)
      playSong(message.guild, voiceChannel, queue.get(message.guild.id)[0]);
  }

  if (command === "skip") {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue || !serverQueue.length) return message.reply("Nothing to skip!");
    serverQueue.shift();
    if (serverQueue.length > 0) playSong(message.guild, voiceChannel, serverQueue[0]);
    else message.reply("Queue ended!");
  }

  if (command === "stop") {
    queue.set(message.guild.id, []);
    const player = players.get(message.guild.id);
    if (player) player.stop();
    message.reply("Stopped playback and cleared queue.");
  }

  if (command === "pause") {
    const player = players.get(message.guild.id);
    if (!player) return message.reply("Nothing is playing!");
    player.pause();
    message.reply("⏸ Paused the music.");
  }

  if (command === "resume") {
    const player = players.get(message.guild.id);
    if (!player) return message.reply("Nothing is playing!");
    player.unpause();
    message.reply("▶ Resumed the music.");
  }

  if (command === "queue") {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue || !serverQueue.length) return message.reply("Queue is empty!");
    const queueMsg = serverQueue.map((s, i) => `${i + 1}. ${s.title}`).join("\n");
    message.reply(`🎵 **Current Queue:**\n${queueMsg}`);
  }
});

async function playSong(guild, voiceChannel, song) {
  if (!song) return;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  const stream = ytdl(song.url, { filter: "audioonly", quality: "highestaudio" });
  const resource = createAudioResource(stream);

  let player = players.get(guild.id);
  if (!player) {
    player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    players.set(guild.id, player);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      const serverQueue = queue.get(guild.id);
      serverQueue.shift();
      if (serverQueue.length > 0) playSong(guild, voiceChannel, serverQueue[0]);
      else {
        connection.destroy();
        players.delete(guild.id);
      }
    });

    player.on("error", (err) => {
      console.error(err);
      const serverQueue = queue.get(guild.id);
      serverQueue.shift();
      if (serverQueue.length > 0) playSong(guild, voiceChannel, serverQueue[0]);
      else {
        connection.destroy();
        players.delete(guild.id);
      }
    });
  }

  player.play(resource);
}

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(process.env.DISCORD_TOKEN);
