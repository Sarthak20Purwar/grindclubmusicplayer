# Retro Video Music Player

This is a GitHub Pages-ready retro music player. It automatically uses every audio file in `playlist/` and pairs it with a video file with the same base name.

## Add a song

1. Upload the audio and video to `playlist/` with the same name. For example:

   ```text
   playlist/Lana Del Rey - Summertime Sadness.mp3
   playlist/Lana Del Rey - Summertime Sadness.mp4
   ```

2. Push the files to GitHub. The **Generate playlist index** action creates or updates `playlist/playlist.json` automatically.
3. GitHub Pages serves the player and the new track appears after refresh.

Audio-only tracks work too. The filename format `Artist - Title.ext` produces a clean artist and title; any other filename uses `Unknown artist`.

## Video color grading

Every video uses the default dark retro #39ff14 green grade. To use a lighter treatment for a dark source clip, edit its generated entry in `playlist/playlist.json` and set:

```json
"tone": "light"
```

The video loops independently until its song changes or completes.

## Publish with GitHub Pages

Create a new GitHub repository, upload this folder’s contents, then go to **Settings → Pages** and deploy from the `main` branch / root folder.

The GitHub Action needs permission to write `playlist/playlist.json`; approve the workflow the first time it runs if GitHub prompts you.
