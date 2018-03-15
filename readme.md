# mpdstream-discord

A Discord bot that streams your MPD output to Discord channels.

---

# Requirements

* Node.js v8 or higher.
* ffmpeg (You can get it through the [ffmpeg-binaries](https://www.npmjs.com/package/ffmpeg-binaries) package.)

# Install

```bash
npm install
npm build
```

# Configure

Create a `config.ts` file in the `src/` folder, fill it with information and rebuild.

```ts
export default {
  discord: {
    token: "", // The discord bot's token
    owner: "", // The owner user ID. The bot will only receive join/leave commands from this user.
    alwaysJoin: [] // A list of voice channel IDs to automatically join.
  },
  mpd: {
    host: "localhost",
    port: 6600,
    streamFile: "" // The output file as mpd's FIFO output.
  }
};
```

# Run

```bash
npm start
```

# Commands

* `mpd!join`: Join the voice channel you are currently in. The bot must have speak permissions.
* `mpd!leave`: Leave the current channel of the server.
* `mpd!np`: Show what's playing.
