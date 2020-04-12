const mpd = require("mpd");
import { EventEmitter } from "events";

interface MpdConfig {
  host: string;
  port: number;
  streamFile: string;
}

export interface Song {
  title: string;
  artist: string;
  album: string;
  playing: boolean;
}

export default class MPD extends EventEmitter {
  private client;

  constructor(cfg: MpdConfig) {
    super();
    this.client = mpd.connect(cfg);

    this.client.on("ready", () => {
      this.checkStatus()
        .then(s => {
          if (s === null) this.emit("stop");
          else if (s.playing === true) this.emit("play", s);
          else this.emit("pause", s);
        })
        .catch(err => this.emit("error", err));

      this.client.on("system-player", () => {
        this.checkStatus()
          .then(s => {
            if (s === null) this.emit("stop");
            else if (s.playing === true) this.emit("play", s);
            else this.emit("pause", s);
          })
          .catch(err => this.emit("error", err));
      });
    });
  }

  private checkStatus(): Promise<Song | null> {
    return new Promise<Song | null>((resolve, reject) => {
      this.client.sendCommand(mpd.cmd("status", []), (err, out) => {
        if (err) return reject(err);
        const status = mpd.parseKeyValueMessage(out);
        if (status.state === "stop") {
          resolve(null);
        } else {
          resolve(
            this.getSong().then(s => {
              s.playing = status.state === "play";
              return s;
            })
          );
        }
      });
    });
  }

  private getSong(): Promise<Song> {
    return new Promise<Song>((resolve, reject) => {
      this.client.sendCommand(mpd.cmd("currentsong", []), (err, oSong) => {
        if (err) return reject(err);
        const song = mpd.parseKeyValueMessage(oSong);
        // console.log(song);
        // console.log(status);
        resolve({
          title: song.Title || song.file || "?",
          artist: song.Artist || "?",
          album: song.Album,
          playing: true
        });
      });
    });
  }
}
