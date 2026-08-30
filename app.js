const $ = selector => document.querySelector(selector);
const audio = $('#audio');
const video = $('#backgroundVideo');
const list = $('#trackList');
let tracks = [], current = 0, playing = false, shuffle = false, repeat = false;
let audioContext, analyser, frequencies;
const canvas = $('#analyzer'), paint = canvas.getContext('2d');
let preloadStarted = false;
const mediaPreloads = [];

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}

const formatTime = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';

async function loadPlaylist() {
  const response = await fetch('playlist/playlist.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Playlist index is missing.');
  ({ tracks } = await response.json());
  if (!tracks.length) throw new Error('No audio files found in playlist/.');
  $('#trackCount').textContent = `${tracks.length} TRACK${tracks.length === 1 ? '' : 'S'}`;
  selectTrack(0, false);
  loadDurations();
}

async function selectTrack(index, autoplay = true) {
  current = (index + tracks.length) % tracks.length;
  const track = tracks[current];
  audio.src = track.audio;
  $('#nowPlaying').textContent = `${String(current + 1).padStart(2, '0')}. ${track.title} — ${track.artist}`;
  $('#playlistMini').textContent = `NOW ${String(current + 1).padStart(2, '0')} · ${track.title} — ${track.artist}`;
  $('#trackNumber').textContent = `TRK ${String(current + 1).padStart(2, '0')}/${String(tracks.length).padStart(2, '0')}`;
  updateMediaSession(track);
  video.className = `background-video ${track.tone === 'light' ? 'light' : 'dark'}`;
  if (track.video) {
    video.src = track.video;
    video.load();
    video.currentTime = 0;
  } else video.removeAttribute('src');
  renderTracks();
  if (autoplay) await playCurrent();
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: 'Retro Video Music Player'
  });
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const actions = {
    play: () => playCurrent(),
    pause: () => audio.pause(),
    previoustrack: () => selectTrack(current - 1),
    nexttrack: () => selectTrack(shuffle ? Math.floor(Math.random() * tracks.length) : current + 1),
    seekbackward: details => { audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10)); },
    seekforward: details => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10)); }
  };
  Object.entries(actions).forEach(([action, handler]) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
  });
}

function waitForVideo() {
  if (!video.src || video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise(resolve => {
    const ready = () => { cleanup(); resolve(); };
    const unavailable = () => { cleanup(); resolve(); };
    const cleanup = () => {
      video.removeEventListener('canplay', ready);
      video.removeEventListener('error', unavailable);
      clearTimeout(timer);
    };
    const timer = setTimeout(unavailable, 8000);
    video.addEventListener('canplay', ready, { once: true });
    video.addEventListener('error', unavailable, { once: true });
  });
}

async function playCurrent() {
  if (video.src) {
    await waitForVideo();
    await video.play().catch(() => {});
  }
  return audio.play().catch(() => setPlaying(false));
}

function preloadRemainingMedia() {
  if (preloadStarted) return;
  preloadStarted = true;
  // Keep the elements alive so the browser can retain its media buffers. The
  // browser schedules these lower-priority requests behind the active track.
  tracks.forEach((track, index) => {
    if (index === current) return;
    const audioPreload = new Audio();
    audioPreload.preload = 'auto';
    audioPreload.src = track.audio;
    audioPreload.load();
    mediaPreloads.push(audioPreload);

    if (track.video) {
      const videoPreload = document.createElement('video');
      videoPreload.preload = 'auto';
      videoPreload.muted = true;
      videoPreload.playsInline = true;
      videoPreload.src = track.video;
      videoPreload.load();
      mediaPreloads.push(videoPreload);
    }
  });
}

function setPlaying(value) {
  playing = value;
  $('#play').textContent = playing ? '❚❚' : '▶';
  $('#play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('#miniPlay').textContent = playing ? '❚❚' : '▶';
  $('#miniPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('#state').textContent = playing ? '▶ PLAYING' : '■ READY';
  $('#signalText').textContent = playing ? 'LIVE · 32 BAND' : 'READY · 32 BAND';
}

function renderTracks() {
  const search = $('#filter').value.toLowerCase();
  list.replaceChildren(...tracks.map((track, index) => {
    const item = document.createElement('li');
    item.className = index === current ? 'active' : '';
    item.hidden = !`${track.title} ${track.artist}`.toLowerCase().includes(search);
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><span class="name">${track.title} — ${track.artist}</span><span class="time">${formatTime(track.duration)}</span>`;
    item.addEventListener('click', () => selectTrack(index));
    item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTrack(index); } });
    return item;
  }));
}

function loadDurations() {
  tracks.forEach(track => {
    const probe = new Audio(track.audio);
    probe.addEventListener('loadedmetadata', () => {
      track.duration = probe.duration;
      renderTracks();
      const total = tracks.reduce((sum, item) => sum + (item.duration || 0), 0);
      $('#totalTime').textContent = formatTime(total);
    }, { once: true });
  });
}

function startAnalysis() {
  if (audioContext) { audioContext.resume(); return; }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = .72;
  frequencies = new Uint8Array(analyser.frequencyBinCount);
  const source = audioContext.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioContext.destination);
}

function drawSpectrum() {
  const ratio = devicePixelRatio || 1, width = canvas.clientWidth * ratio, height = canvas.clientHeight * ratio;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  paint.fillStyle = '#020502'; paint.fillRect(0, 0, width, height);
  if (analyser) analyser.getByteFrequencyData(frequencies);
  const bands = 32, labels = ['57', '134', '400', '1K', '2K', '6K', '16K'], labelHeight = height * .16, plot = height - labelHeight - 8 * ratio, gap = 3 * ratio, side = 8 * ratio, bar = (width - side * 2 - gap * (bands - 1)) / bands, segments = 15, segmentHeight = (plot - (segments - 1) * ratio) / segments;
  for (let band = 0; band < bands; band++) {
    const start = Math.floor((band / bands) ** 1.85 * (frequencies?.length - 1 || 0));
    const end = Math.max(start + 1, Math.floor(((band + 1) / bands) ** 1.85 * (frequencies?.length || 1)));
    let volume = 0; for (let i = start; i < end; i++) volume = Math.max(volume, frequencies?.[i] || 0);
    const active = Math.max(1, Math.round(volume / 255 * segments));
    for (let segment = 0; segment < segments; segment++) {
      paint.fillStyle = segment < active ? (segment > 10 ? '#b6ffae' : '#39ff14') : '#12420f';
      paint.fillRect(side + band * (bar + gap), plot - (segment + 1) * (segmentHeight + ratio), Math.max(1, bar), segmentHeight);
    }
  }
  paint.fillStyle = '#39ff14'; paint.font = `${Math.max(8, 10 * ratio)}px monospace`; paint.textAlign = 'center';
  labels.forEach((label, i) => paint.fillText(label, side + (i + .5) * ((width - side * 2) / labels.length), height - 5 * ratio));
  requestAnimationFrame(drawSpectrum);
}

$('#play').addEventListener('click', () => playing ? audio.pause() : playCurrent());
$('#previous').addEventListener('click', () => selectTrack(current - 1));
$('#next').addEventListener('click', () => selectTrack(shuffle ? Math.floor(Math.random() * tracks.length) : current + 1));
$('#miniPrevious').addEventListener('click', () => selectTrack(current - 1));
$('#miniPlay').addEventListener('click', () => playing ? audio.pause() : playCurrent());
$('#miniNext').addEventListener('click', () => selectTrack(shuffle ? Math.floor(Math.random() * tracks.length) : current + 1));
$('#shuffle').addEventListener('click', event => { shuffle = !shuffle; event.currentTarget.setAttribute('aria-pressed', shuffle); });
$('#repeat').addEventListener('click', event => { repeat = !repeat; event.currentTarget.setAttribute('aria-pressed', repeat); });
$('#volume').addEventListener('input', event => { audio.volume = event.target.value; });
$('#seek').addEventListener('input', event => { if (audio.duration) audio.currentTime = audio.duration * event.target.value / 100; });
$('#filter').addEventListener('input', renderTracks);
$('#fullButton').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
document.querySelectorAll('.window-toggle').forEach(button => button.addEventListener('click', () => {
  const panel = document.getElementById(button.dataset.window);
  const minimized = panel.classList.toggle('minimized');
  button.textContent = minimized ? '□' : '−';
  button.setAttribute('aria-expanded', String(!minimized));
  button.setAttribute('aria-label', `${minimized ? 'Restore' : 'Minimize'} ${button.dataset.window === 'playerWindow' ? 'player' : 'playlist'}`);
  $('.deck').classList.toggle('all-minimized', [...document.querySelectorAll('.window')].every(window => window.classList.contains('minimized')));
}));
audio.addEventListener('play', () => { startAnalysis(); video.play().catch(() => {}); setPlaying(true); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; window.setTimeout(preloadRemainingMedia, 1500); });
audio.addEventListener('pause', () => { video.pause(); setPlaying(false); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
audio.addEventListener('seeked', () => { if (video.duration) video.currentTime = audio.currentTime % video.duration; });
audio.addEventListener('timeupdate', () => { const percent = audio.duration ? audio.currentTime / audio.duration * 100 : 0; $('#seek').value = percent; $('#elapsed').textContent = formatTime(audio.currentTime); $('#clock').textContent = formatTime(audio.currentTime); $('#duration').textContent = formatTime(audio.duration); });
audio.addEventListener('ended', () => repeat ? (audio.currentTime = 0, audio.play()) : selectTrack(current + 1));
document.addEventListener('keydown', event => { if (event.target.matches('input')) return; if (event.key === ' ') { event.preventDefault(); playing ? audio.pause() : playCurrent(); } if (event.key === 'ArrowRight') audio.currentTime += 5; if (event.key === 'ArrowLeft') audio.currentTime -= 5; if (event.key.toLowerCase() === 'n') selectTrack(current + 1); if (event.key.toLowerCase() === 'p') selectTrack(current - 1); });

drawSpectrum();
setupMediaSession();
loadPlaylist().catch(error => { $('#nowPlaying').textContent = error.message; $('#state').textContent = '■ NO PLAYLIST'; });
