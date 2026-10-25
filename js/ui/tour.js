// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { createFaceView } from '../views/faceView.js';
import { createView3d } from '../views/view3d.js';

/**
 * THE TOUR, AS A VIDEO
 *
 * A window of its own plays the slide show and records it, a minute long.
 * First the plan, each wall, the ceiling and the room in 3-D, held still
 * at the frequency being looked at, while the engine paints the sweep's
 * frames behind them; then the room in 3-D swept across the whole range,
 * bottom to top and back, twice (`tourAt`). The sweep waits for its
 * frames: while the next one is still being painted the recording pauses and
 * the tour's clock stands still, so the video is a minute and the sweep
 * smooth however long the room takes to paint. Every view is drawn full size
 * into its own canvas there (views/faceView.js and view3d.js, the same
 * drawings as the page's tiles), copied with a caption onto a 1920 × 1080
 * frame, and that frame's stream recorded (MediaRecorder). When the sweep is done the video is
 * saved as a WebM and plays back in the window. With a song loaded
 * (ui/player.js) there is no sweep: the field follows the song, the slides
 * share its length, and its sound is recorded under the pictures. The page is left alone to
 * work in; closing the window stops the tour and keeps nothing.
 *
 * The plan here is drawn by this app, not the CAD: the CAD's sheet is in
 * another iframe and cannot be recorded.
 */

export const SLIDES = [
  { view: 'plan', title: 'Plan' },
  { view: 'back', title: 'Back elevation' },
  { view: 'left', title: 'Left elevation' },
  { view: 'right', title: 'Right elevation' },
  { view: 'front', title: 'Front elevation' },
  { view: 'ceiling', title: 'Ceiling' },
  { view: '3d', title: 'The room in 3-D' },
];

/** Each view held still, then the sweep: 7 × 4 + 32 = a minute. */
const STILL_SECONDS = 4;
const SWEEP_SECONDS = 32;
const LAPS = 2;
const SWEEP_TITLE = 'Frequency sweep';

/**
 * Where the tour is at `t` seconds: the slide (an index into SLIDES), and in
 * the sweep `u`, how far up the frequency range (0 the bottom, 1 the top),
 * there and back LAPS times. With a song the slides just take turns, `still` seconds each.
 */
export function tourAt(t, { still = STILL_SECONDS, sweep = SWEEP_SECONDS, laps = LAPS } = {}) {
  const held = SLIDES.length * still;
  if (t < held || !sweep) return { slide: Math.min(SLIDES.length - 1, Math.floor(t / still)), u: null };
  const legs = Math.min(1, (t - held) / sweep) * laps * 2;
  const leg = Math.min(Math.floor(legs), laps * 2 - 1);
  const k = legs - leg;
  return { slide: SLIDES.length - 1, u: leg % 2 ? 1 - k : k, sweeping: true };
}

/** How long the tour runs. */
export const tourLength = ({ still = STILL_SECONDS, sweep = SWEEP_SECONDS } = {}) => SLIDES.length * still + sweep;
const FRAME = { w: 1920, h: 1080 };
const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

/**
 * `onStart(seconds, withSong)` / `onStop()` start the song alongside, or the
 * engine painting the sweep's frames; `sweepTo(u)` puts the field at `u` of
 * the way up the frequency range, or answers false while that frame is not painted yet; `soundtrack()` is the song, { stream, duration }, or null; `caption()`
 * is the line under each slide's title (the room, the method, the frequency);
 * `name()` what the video is called.
 */
export function createTour({ store, engine, onStart, onStop, sweepTo, caption, name, soundtrack = () => null }) {
  let run = null;

  function start() {
    if (run) return run.win.focus();
    const win = window.open('', 'acoustic-tour', 'popup,width=1300,height=800');
    if (!win) {
      alert('The browser blocked the window — allow pop-ups for this page.');
      return;
    }
    const doc = win.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tour — ACOUSTIC.LIKE.AUDIO</title><link rel="stylesheet" href="${new URL('css/app.css', location.href).href}"></head>
<body class="popout tour"><div class="popbar"><b>🎞 Tour</b><span class="state"></span><span class="tools"></span><button data-act="stop">■ Stop</button></div>
<div class="stage" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:0;background:#0b0d12"></div></body></html>`);
    doc.close();
    const stage = doc.querySelector('.stage');
    const state = doc.querySelector('.state');
    doc.querySelector('[data-act=stop]').onclick = () => stop(true);

    // each slide's view, drawn at the frame's shape into a canvas of its own
    const views = SLIDES.map((s) => {
      const tile = doc.createElement('div');
      tile.className = `tile ${s.view === '3d' ? 't3d' : 'face'}`;
      tile.style.cssText = 'position:absolute;left:-10000px;width:1280px;height:720px';
      tile.innerHTML = '<canvas style="width:100%;height:100%;display:block"></canvas><div class="readout"></div>';
      doc.body.append(tile);
      const canvas = tile.querySelector('canvas');
      // the room whole from its first frame: its slide is too short for it to build itself up
      const view = s.view === '3d' ? createView3d({ canvas, store, engine, introSpeed: () => 0 }) : createFaceView({ tile, face: s.view, store, engine });
      return { ...s, canvas, view };
    });

    // what is recorded: the slide, its title and caption, the time along the bottom
    const frame = doc.createElement('canvas');
    frame.width = FRAME.w;
    frame.height = FRAME.h;
    frame.style.cssText = 'max-width:100%;max-height:100%;aspect-ratio:16/9';
    stage.append(frame);
    const ctx = frame.getContext('2d');

    const song = soundtrack();
    const stream = frame.captureStream(30);
    for (const track of song?.stream.getAudioTracks() ?? []) stream.addTrack(track);
    // with a song, a video codec and opus for its sound
    const type = TYPES.map((t) => (song ? t.replace(/codecs=(vp\d)/, 'codecs=$1,opus') : t)).find((t) => window.MediaRecorder?.isTypeSupported(t));
    const chunks = [];
    const recorder = type ? new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 }) : null;
    if (recorder) recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    state.textContent = recorder ? '● recording' : 'this browser cannot record — playing only';

    // a song sets the length: its whole duration, shared between the slides, and no sweep
    const timing = song?.duration ? { still: Math.max(3, song.duration / SLIDES.length), sweep: 0 } : {};
    const total = tourLength(timing);
    // the tour's own clock: it runs while the picture is ready, and stands still (the recording paused) while a frame is painted
    let t = 0;
    let tick = performance.now();
    run = { win, recorder, chunks, type, frame, state, timer: 0, watch: 0 };
    run.timer = setInterval(() => {
      const now = performance.now();
      const dt = (now - tick) / 1000; // what was recorded since the last tick: the waits are not, they return before the clock moves
      tick = now;
      if (t >= total) return finish();
      const at = tourAt(t, timing);
      const waiting = at.sweeping && !sweepTo(at.u);
      if (waiting) {
        if (recorder?.state === 'recording') recorder.pause();
        state.textContent = `◌ painting the sweep · ${Math.ceil(total - t)} s of video left`;
        return;
      }
      if (recorder?.state === 'paused') recorder.resume();
      t += dt;
      const slide = at.sweeping ? { ...views[at.slide], title: SWEEP_TITLE } : views[at.slide];
      slide.view.render();
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, FRAME.w, FRAME.h);
      ctx.drawImage(slide.canvas, 0, 0, FRAME.w, FRAME.h);
      ctx.fillStyle = 'rgba(10, 12, 18, .78)';
      ctx.fillRect(0, FRAME.h - 92, FRAME.w, 92);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '600 34px system-ui, sans-serif';
      ctx.fillText(slide.title, 40, FRAME.h - 50);
      ctx.fillStyle = '#9aa4b2';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText(caption(), 40, FRAME.h - 18);
      ctx.fillStyle = '#f4902c';
      ctx.fillRect(0, FRAME.h - 4, (FRAME.w * t) / total, 4);
      state.textContent = `${recorder ? '● recording' : '▶ playing'} · ${slide.title} · ${Math.ceil(total - t)} s left`;
    }, 1000 / 30);
    run.watch = setInterval(() => win.closed && stop(true), 500);
    recorder?.start(1000);
    onStart(total, Boolean(song));
  }

  /** The last slide is done: the video saved, and played back in the window. */
  function finish() {
    const { recorder, chunks, type, win, frame, state } = run;
    clearInterval(run.timer);
    onStop();
    if (!recorder) return stop(false);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      const url = URL.createObjectURL(blob);
      const file = `${name()}-tour.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      const a = win.document.createElement('a');
      a.href = url;
      a.download = file;
      a.textContent = `⤓ ${file}`;
      a.click();
      win.document.querySelector('.tools').append(a);
      const video = win.document.createElement('video');
      Object.assign(video, { src: url, controls: true, autoplay: true, loop: true });
      video.style.cssText = 'max-width:100%;max-height:100%';
      frame.replaceWith(video);
      state.textContent = `saved ${file} · ${(blob.size / 1e6).toFixed(1)} MB`;
      win.addEventListener('pagehide', () => URL.revokeObjectURL(url));
      stop(false);
    };
    recorder.stop();
  }

  /** Stop the tour; `close` shuts the window too (the Stop button, or the window closed). */
  function stop(close) {
    if (!run) return;
    const r = run;
    run = null;
    clearInterval(r.timer);
    clearInterval(r.watch);
    if (r.recorder?.state === 'recording') {
      r.recorder.onstop = null;
      r.recorder.stop();
    }
    onStop();
    if (close && !r.win.closed) r.win.close();
  }

  window.addEventListener('pagehide', () => stop(true));
  return {
    start,
    stop: () => stop(true),
    get running() {
      return Boolean(run);
    },
  };
}
