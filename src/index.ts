import Discord = require("discord.js");
import Prism = require("prism-media");
import config from "./config";
import mpd, { Song } from "./mpd";

const client = new Discord.Client();

class Dispatch {
  mpd: mpd;
  broadcast: Discord.VoiceBroadcast | null = null;
  currentSong: Song | null = null;
  connections: Map<Discord.Guild, Discord.VoiceConnection> = new Map();
  channels: Map<Discord.Guild, Discord.VoiceChannel> = new Map();

  constructor(alwaysJoin: Discord.VoiceChannel[]) {
    for (let c of alwaysJoin) {
      this.channels.set(c.guild, c);
    }
    this.mpd = new mpd(config.mpd);

    this.mpd.on("stop", () => {
      this.currentSong = null;
      this.update();
    });

    this.mpd.on("play", (s: Song) => {
      this.currentSong = s;
      this.update();
    });

    this.mpd.on("pause", (s: Song) => {
      this.currentSong = s;
      this.update();
    });
  }

  async join(m: Discord.Message) {
    try {
      const u = m.member;

      if (!u.voiceChannel || !u.voiceChannel.speakable) {
        await m.reply("Please join a channel that I can speak in.");
        return;
      }

      const current = this.connections.get(u.guild);
      if (current !== undefined) {
        current.disconnect();
        this.connections.delete(u.guild);
      }
      this.channels.set(u.guild, u.voiceChannel);
      await this.update();
      await m.reply("Joined **" + u.voiceChannel.name + "**");
    } catch (e) {
      throw e;
    }
  }

  async leave(m: Discord.Message) {
    const u = m.member;

    const current = this.connections.get(u.guild);
    if (current !== undefined) {
      current.disconnect();
      this.connections.delete(u.guild);
    }
    this.channels.delete(u.guild);

    return m.reply("Left.");
  }

  async nowPlaying(m: Discord.Message) {
    const s = this.currentSong;
    if (s === null || !s.playing) {
      return m.reply("Nothing is playing");
    } else {
      return m.reply(
        "Now playing **" +
          s.artist +
          " - " +
          s.title +
          "** (album **" +
          s.album +
          "**)"
      );
    }
  }

  async handleMessage(m: Discord.Message) {
    if (m.author.bot) return;

    try {
      if (m.author.id === config.discord.owner) {
        if (m.content === "mpd!join") await this.join(m);
        if (m.content === "mpd!leave") await this.leave(m);
      }
      if (m.content === "mpd!np") await this.nowPlaying(m);
    } catch (e) {
      m.reply("An error occured\n" + e, { split: true });
      console.log(e);
    }
  }

  createBroadcast(): Discord.VoiceBroadcast {
    const b = client.createVoiceBroadcast();
    b.playConvertedStream(
      new Prism.FFmpeg({
        args: [
          "-analyzeduration",
          "0",
          "-loglevel",
          "0",
          "-f",
          "s16le",
          "-ar",
          "44100",
          "-ac",
          "2",
          "-acodec",
          "pcm_s16le",
          "-i",
          config.mpd.streamFile,
          "-analyzeduration",
          "0",
          "-loglevel",
          "0",
          "-f",
          "s16le",
          "-ar",
          "48000",
          "-ac",
          "2",
          "-acodec",
          "pcm_s16le"
        ]
      })
    );
    b.on("error", console.log);
    b.on("warn", console.log);
    return b;
  }

  async update() {
    const s = this.currentSong;
    console.log(s);

    try {
      // Update presence
      if (s === null) {
        client.user.setActivity("Nothing", { type: "LISTENING" });
      } else {
        client.user.setActivity(
          (!s.playing ? "[paused] " : "") +
            s.artist +
            " - " +
            s.title +
            " | mpd!np",
          {
            type: "LISTENING"
          }
        );
      }
      // Update voice connections
      if (s === null || !s.playing) {
        this.connections.forEach(v => {
          v.disconnect();
        });
        this.broadcast = null;
        this.connections.clear();
      } else {
        const b =
          this.broadcast === null ? this.createBroadcast() : this.broadcast;
        this.broadcast = b;

        for (let [g, v] of this.channels.entries()) {
          try {
            if (this.connections.has(g)) continue;
            console.log(v.name);
            const c = await v.join();
            c.playBroadcast(b);

            this.connections.set(g, c);
          } catch (e) {
            console.log(e);
            this.channels.delete(g);
          }
        }
      }
    } catch (e) {
      throw e;
    }
  }
}

client.login(config.discord.token).then(async () => {
  if (client.user.username !== "MPDStream") {
    await client.user.setUsername("MPDStream");
    await client.user.setAvatar(
      "https://pre00.deviantart.net/e649/th/pre/f/2009/175/0/0/suwako_sip_by_kouotsu.png"
    );
  }
  const alwaysJoin = config.discord.alwaysJoin.map(
    id => client.channels.get(id) as Discord.VoiceChannel
  );
  const f = new Dispatch(alwaysJoin);

  client.on("message", f.handleMessage.bind(f));
});
