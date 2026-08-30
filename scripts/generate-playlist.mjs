import { readdir, writeFile } from 'node:fs/promises';
import { join, parse } from 'node:path';

const playlistDir = join(process.cwd(), 'playlist');
const audioExtensions = new Set(['.mp3', '.m4a', '.ogg', '.wav']);
const videoExtensions = new Set(['.mp4', '.webm', '.mov']);

const files = await readdir(playlistDir, { withFileTypes: true });
const byBaseName = new Map();

for (const entry of files) {
  if (!entry.isFile()) continue;
  const { name: baseName, ext } = parse(entry.name);
  const extension = ext.toLowerCase();
  if (!audioExtensions.has(extension) && !videoExtensions.has(extension)) continue;
  const track = byBaseName.get(baseName) ?? { baseName };
  if (audioExtensions.has(extension)) track.audio = entry.name;
  if (videoExtensions.has(extension)) track.video = entry.name;
  byBaseName.set(baseName, track);
}

const tracks = [...byBaseName.values()]
  .filter(track => track.audio)
  .sort((a, b) => a.baseName.localeCompare(b.baseName))
  .map(track => {
    const [possibleArtist, ...titleParts] = track.baseName.split(' - ');
    const title = titleParts.length ? titleParts.join(' - ') : possibleArtist;
    const artist = titleParts.length ? possibleArtist : 'Unknown artist';
    return {
      title,
      artist,
      audio: `playlist/${track.audio}`,
      video: track.video ? `playlist/${track.video}` : null,
      tone: 'dark'
    };
  });

await writeFile(
  join(playlistDir, 'playlist.json'),
  `${JSON.stringify({ tracks }, null, 2)}\n`,
  'utf8'
);
console.log(`Generated playlist/playlist.json with ${tracks.length} track(s).`);
