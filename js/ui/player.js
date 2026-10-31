// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { F_MAX, F_MIN } from '../compute/compute.js';
import { ACCENT, accentA } from '../brand.js';

/**
 * A SONG DRIVES THE FIELD
 *
 * A wave-file player: open a song (any file the browser decodes — WAV, MP3,
 * FLAC, …), see its waveform, play it, click or drag the waveform to scrub.
 * While it plays, its spectrum is read (an AnalyserNode) and the field shows
 * the room at the frequency the music is exciting right now:
 *
 *   loudest     the strongest bin — mostly the bass line and the kick, so the
 *               room's modes light up with them
 *   brightness  the spectral centroid — where the energy sits on average,
 *               which climbs with cymbals and falls with a pad
 *
 * looked for only inside the FREQUENCY WINDOW — drag its two edges on the
 * live spectrum beside the waveform to follow just the low end, say, where
 * the room's modes are — smoothed on a log scale so it glides rather than jumps, then snapped to the
 * nearest frame the engine has already painted (the sweep's frame cache), so
 * nothing waits on a recompute. The song's sound is also offered as a stream,
 * for the tour to record under its pictures.
 */

const FFT = 8192;
const COLUMNS = 1200;

export function createPlayer({ root, store, engine, onPlay = () => {} }) {
  const audio = new Audio();
  let ctx = null;
  let analyser = null;
  let tap = null;
  let peaks = null;
  let name = '';
  let follow = 'loudest';
  let logF = null;
  let raf = 0;
  let last = 0;
  let url = '';
  /** The window the field follows, Hz, and the last spectrum read (dB per bin) to draw it on. */
  const band = { lo: F_MIN, hi: F_MAX };
  let spectrum = null;
  let shown = null;

  root.innerHTML = `<button data-act="play" title="Play / pause (the field follows the song)">▶</button>
<b class="name"></b><canvas class="wave" title="Click or drag to scrub"></canvas><span class="time"></span>
<canvas class="spec" title="The song's spectrum. Drag an edge of the window: the field follows only what is inside it"></canvas>
<select data-act="follow" title="Which frequency of the song the field shows"><option value="loudest">loudest note</option><option value="brightness">brightness</option></select>
<output class="hz" title="The frequency the field is showing"></output><button data-act="close" title="Close the song">✕</button>`;
  const playBtn = root.querySelector('[data-act=play]');
  const wave = root.querySelector('.wave');
  const time = root.querySelector('.time');
  const hzOut = root.querySelector('.hz');
  const spec = root.querySelector('.spec');
  playBtn.onclick = () => (audio.paused ? play() : pause());
  root.querySelector('[data-act=close]').onclick = close;
  root.querySelector('[data-act=follow]').onchange = (e) => (follow = e.target.value);
  audio.addEventListener('ended', () => pause());
  audio.addEventListener('timeupdate', draw);

  // scrub: click or drag along the waveform
  wave.addEventListener('pointerdown', (e) => {
    const seek = (ev) => {
      const r = wave.getBoundingClientRect();
      if (audio.duration) audio.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * audio.duration;
      draw();
    };
    seek(e);
    wave.setPointerCapture(e.pointerId);
    wave.onpointermove = seek;
    wave.onpointerup = () => (wave.onpointermove = wave.onpointerup = null);
  });

  // the window's edges: grab the nearer one and drag it along the log-frequency axis
  const lf0 = Math.log(F_MIN);
  const lfSpan = Math.log(F_MAX) - lf0;
  const xOf = (f, w) => ((Math.log(f) - lf0) / lfSpan) * w;
  const fOf = (x, w) => Math.exp(lf0 + Math.max(0, Math.min(1, x / w)) * lfSpan);
  spec.addEventListener('pointerdown', (e) => {
    const r = spec.getBoundingClientRect();
    const x = e.clientX - r.left;
    const edge = Math.abs(x - xOf(band.lo, r.width)) < Math.abs(x - xOf(band.hi, r.width)) ? 'lo' : 'hi';
    const move = (ev) => {
      const f = fOf(ev.clientX - r.left, r.width);
      if (edge === 'lo') band.lo = Math.min(f, band.hi / 1.12);
      else band.hi = Math.max(f, band.lo * 1.12);
      logF = null;
      drawSpectrum();
    };
    move(e);
    spec.setPointerCapture(e.pointerId);
    spec.onpointermove = move;
    spec.onpointerup = () => (spec.onpointermove = spec.onpointerup = null);
  });

  function graph() {
    if (ctx) return;
    ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT;
    analyser.smoothingTimeConstant = 0.75;
    tap = ctx.createMediaStreamDestination();
    src.connect(analyser);
    analyser.connect(ctx.destination);
    analyser.connect(tap);
  }

  async function load(file) {
    close();
    name = file.name.replace(/\.[^.]+$/, '');
    url = URL.createObjectURL(file);
    audio.src = url;
    root.hidden = false;
    root.querySelector('.name').textContent = name;
    peaks = null;
    draw();
    drawSpectrum();
    graph();
    try {
      // the overview: min and max of each column, over all channels
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      const per = Math.max(1, Math.floor(buf.length / COLUMNS));
      const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
      peaks = Array.from({ length: Math.ceil(buf.length / per) }, (_, i) => {
        let lo = 0;
        let hi = 0;
        for (const ch of chans)
          for (let j = i * per, e = Math.min(ch.length, j + per); j < e; j++) {
            if (ch[j] < lo) lo = ch[j];
            if (ch[j] > hi) hi = ch[j];
          }
        return [lo, hi];
      });
    } catch {
      peaks = [];
    }
    draw();
  }

  function play() {
    if (!audio.src) return;
    graph();
    ctx.resume();
    audio.play();
    playBtn.textContent = '❚❚';
    if (store.state.settings.method === 'energy') store.setSettings({ method: 'wave' });
    engine.frames(true);
    onPlay(true);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    audio.pause();
    playBtn.textContent = '▶';
    cancelAnimationFrame(raf);
    engine.frames(false);
    onPlay(false);
    draw();
  }

  function close() {
    if (!audio.paused) pause();
    audio.removeAttribute('src');
    if (url) URL.revokeObjectURL(url);
    url = '';
    name = '';
    peaks = null;
    logF = null;
    shown = null;
    spectrum = null;
    root.hidden = true;
  }

  /** The frequency the music excites now, Hz, or null in a silence. */
  function excited() {
    const db = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(db);
    spectrum = db;
    const bin = ctx.sampleRate / FFT;
    const i0 = Math.max(1, Math.ceil(band.lo / bin));
    const i1 = Math.min(db.length - 1, Math.floor(band.hi / bin));
    if (follow === 'loudest') {
      let best = i0;
      for (let i = i0; i <= i1; i++) if (db[i] > db[best]) best = i;
      return db[best] > -90 ? best * bin : null;
    }
    let p = 0;
    let pf = 0;
    for (let i = i0; i <= i1; i++) {
      const pow = 10 ** (db[i] / 10);
      p += pow;
      pf += pow * i * bin;
    }
    return p > 1e-9 ? pf / p : null;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    draw();
    if (now - last < 60) return;
    last = now;
    const f = excited();
    drawSpectrum();
    if (!f) return;
    logF = logF == null ? Math.log(f) : logF * 0.7 + Math.log(f) * 0.3;
    shown = Math.exp(logF);
    // the nearest frame already painted; until one is, the field stays put
    const ready = engine.out.frames.ready;
    if (!ready.length) return;
    let snap = ready[0];
    for (const r of ready) if (Math.abs(Math.log(r) - logF) < Math.abs(Math.log(snap) - logF)) snap = r;
    hzOut.textContent = `${Math.round(Math.exp(logF))} Hz → ${Math.round(snap)} Hz`;
    if (snap !== store.state.settings.freq) store.setSettings({ freq: snap });
  }

  /** The spectrum, log frequency across, the window lit and the followed frequency marked. */
  function drawSpectrum() {
    if (root.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const w = spec.clientWidth;
    const h = spec.clientHeight;
    if (spec.width !== Math.round(w * dpr) || spec.height !== Math.round(h * dpr)) {
      spec.width = Math.round(w * dpr);
      spec.height = Math.round(h * dpr);
    }
    const g = spec.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const [x0, x1] = [xOf(band.lo, w), xOf(band.hi, w)];
    g.fillStyle = accentA(.12);
    g.fillRect(x0, 0, x1 - x0, h);
    if (spectrum && ctx) {
      const bin = ctx.sampleRate / FFT;
      g.beginPath();
      for (let x = 0; x < w; x++) {
        const db = spectrum[Math.min(spectrum.length - 1, Math.round(fOf(x, w) / bin))];
        const y = h - Math.max(0, Math.min(1, (db + 100) / 80)) * h;
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.strokeStyle = '#7dd3fc';
      g.lineWidth = 1;
      g.stroke();
    }
    g.fillStyle = ACCENT;
    g.fillRect(x0 - 1, 0, 2, h);
    g.fillRect(x1 - 1, 0, 2, h);
    g.font = '9px ui-monospace, monospace';
    g.fillText(`${Math.round(band.lo)}–${Math.round(band.hi)} Hz`, Math.min(x0 + 4, w - 70), 10);
    if (shown) {
      g.fillStyle = '#fde047';
      g.fillRect(xOf(shown, w), 0, 1, h);
    }
  }

  function draw() {
    if (root.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wave.clientWidth;
    const h = wave.clientHeight;
    if (wave.width !== Math.round(w * dpr) || wave.height !== Math.round(h * dpr)) {
      wave.width = Math.round(w * dpr);
      wave.height = Math.round(h * dpr);
    }
    const g = wave.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const at = audio.duration ? audio.currentTime / audio.duration : 0;
    if (peaks?.length) {
      const mid = h / 2;
      for (let x = 0; x < w; x++) {
        const [lo, hi] = peaks[Math.floor((x / w) * peaks.length)];
        g.fillStyle = x / w < at ? ACCENT : '#64748b';
        g.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid));
      }
    } else {
      g.fillStyle = '#64748b';
      g.fillText(peaks ? 'no waveform for this file' : 'reading…', 6, h / 2 + 4);
    }
    g.fillStyle = '#fff';
    g.fillRect(Math.round(at * w), 0, 1, h);
    const t = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    time.textContent = audio.duration ? `${t(audio.currentTime)} / ${t(audio.duration)}` : '';
  }

  return {
    load,
    play,
    pause,
    get loaded() {
      return Boolean(url);
    },
    get playing() {
      return !audio.paused;
    },
    get duration() {
      return audio.duration || 0;
    },
    get name() {
      return name;
    },
    /** From the top — what the tour does when it records the song. */
    restart() {
      audio.currentTime = 0;
      play();
    },
    /** The song's sound as a stream, for a recording to carry. */
    stream() {
      graph();
      return tap.stream;
    },
  };
}
