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

      if (!u?.voice.channel?.speakable) {
        await m.reply("Please join a channel that I can speak in.");
        return;
      }

      const current = this.connections.get(u.guild);
      if (current !== undefined) {
        current.disconnect();
        this.connections.delete(u.guild);
      }
      this.channels.set(u.guild, u.voice.channel);
      await this.update();
      await m.reply("Joined **" + u.voice.channel.name + "**");
    } catch (e) {
      throw e;
    }
  }

  async leave(m: Discord.Message) {
    const u = m.member;
    if (!u) return;

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
    const b = client.voice?.createBroadcast();
    const args = [
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
    ];
    const transcoder = new Prism.FFmpeg({
      args,
    });
    transcoder.on("error", console.warn);
    if (!b) throw "cannot broadcast";
    b.play(transcoder, {
      type: "converted",
    });
    b.on("end", () => console.log("?"));
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
        client.user?.setActivity("Nothing", { type: "LISTENING" });
      } else {
        client.user?.setActivity(
          (!s.playing ? "[paused] " : "") +
            s.artist +
            " - " +
            s.title +
            " | mpd!np",
          {
            type: "PLAYING",
          }
        );
      }
      // Update voice connections
      if (s === null || !s.playing) {
        this.connections.forEach((v) => {
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
            const disp = c.play(b);
            disp.on("debug", console.log);
            disp.on("start", () => console.log("!"));

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

client
  .login(config.discord.token)
  .then(async () => {
    if (client.user?.username !== "KagamiStream") {
      await client.user?.setUsername("KagamiStream");
      await client.user?.setAvatar(
        "https://i.pinimg.com/736x/4c/07/7d/4c077d1c329441826a49acb33484e49b.jpg"
      );
    }
    const alwaysJoin: Discord.VoiceChannel[] = [];
    for (const id of config.discord.alwaysJoin) {
      const c = await client.channels.fetch(id);
      if (c) alwaysJoin.push(c as Discord.VoiceChannel);
    }
    const f = new Dispatch(alwaysJoin);

    client.on("message", f.handleMessage.bind(f));
  })
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
