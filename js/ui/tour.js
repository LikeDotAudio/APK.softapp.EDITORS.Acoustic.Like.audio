// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { createFaceView } from '../views/faceView.js';
import { createView3d, stiColour } from '../views/view3d.js';
import { talkers, talkPaths } from '../acoustics/talk.js';
import { STI_RATINGS } from '../acoustics/intelligibility.js';

/**
 * THE TOUR, AS A VIDEO
 *
 * A window of its own plays the room as a film and records it. It opens on a
 * chooser: how long (the full tour, or a summary at 10 s or 5 s a view) and
 * which views. The film is a list of chapters (`tourPlan`), each a view or a
 * few of them side by side, held still or swept across the frequency range:
 *
 *  - each group of drawings in turn (the plan and the ceiling, then the four
 *    walls), and for each drawing: the field off, only the room and what
 *    stands in it, then wiped in top to bottom while the frequency sweeps top
 *    to bottom (10 s); a 5 s summary sweep up; then the full sweep, 20 s up
 *    and 20 s down, a twelfth of an octave a frame;
 *  - at the end of a group, the whole group together, up and down;
 *  - the room in 3-D building itself up from several angles, then the sweep
 *    rendered from each of them, the room filling the frame and the camera
 *    on a jib: it booms in and down toward the room and back out, the last
 *    ones orbiting too;
 *  - with two people or more in the room, a chart of who hears whom: the STI
 *    of every pair, both ways round (the 3-D room leaves its labels out);
 *  - 30 s of ray tracing, the camera going round the room as the frequency
 *    climbs, so the bounces that carry the low end give way to the top's;
 *  - a summary of every view together, swept up and down;
 *  - and a summary of the summary: all of them again, quickly.
 *
 * On every frame, whatever the chapter, the frequency response at the mix seat
 * sits in the corner with the current frequency marked on it, and where that
 * seat is.
 *
 * A sweep waits for its frames: while the next one is still being painted the
 * recording pauses and the tour's clock stands still, so the video is as long
 * as its chapters and the sweep smooth however long the room takes to paint.
 * Every view is drawn full size into its own canvas (views/faceView.js and
 * view3d.js, the same drawings as the page's tiles), copied with a caption onto
 * a 1920 × 1080 frame, and that frame's stream recorded (MediaRecorder). When
 * the last chapter is done the video is saved as a WebM and plays back in the
 * window. With a song loaded (ui/player.js) nothing sweeps: the field follows
 * the song, the chapters share its length, and its sound is recorded under the
 * pictures. The page is left alone to work in, its settings untouched; closing
 * the window stops the tour and keeps nothing.
 *
 * The plan here is drawn by this app, not the CAD: the CAD's sheet is in
 * another iframe and cannot be recorded.
 */

/** Every view the tour can show. */
export const VIEWS = {
  plan: 'Plan',
  ceiling: 'Ceiling',
  back: 'Back elevation',
  left: 'Left elevation',
  right: 'Right elevation',
  front: 'Front elevation',
  '3d': 'The room in 3-D',
};

/** The drawings, by group: each drawing in turn, then the group together. */
export const GROUPS = [
  { title: 'Plan and ceiling', views: ['plan', 'ceiling'] },
  { title: 'The walls', views: ['back', 'left', 'right', 'front'] },
];

/** Where the 3-D room is seen from, as its camera: degrees round, degrees up, room sizes away. */
const ANGLES = [
  { name: 'from the corner', yaw: -55, pitch: 32, dist: 1.9 },
  { name: 'from the opposite corner', yaw: 125, pitch: 32, dist: 1.9 },
  { name: 'from low down', yaw: 35, pitch: 8, dist: 2.1 },
  { name: 'from above', yaw: -145, pitch: 78, dist: 1.8 },
];

/** How long each kind of chapter runs, seconds, in each length. */
export const LENGTHS = {
  full: { title: 'Full tour', reveal: 10, summary: 5, sweep: 20, group: 20, build: 6, sweep3d: 20, talk: 10, trace: 30, all: 20, recap: 5 },
  summary10: { title: 'Summary · 10 s a view', reveal: 10, group: 10, build: 6, sweep3d: 10, talk: 10, trace: 10, all: 10, recap: 5 },
  summary5: { title: 'Summary · 5 s a view', summary: 5, group: 5, build: 6, sweep3d: 5, talk: 5, trace: 5, all: 5 },
};

/** The ray tracing, in the chooser's list of views. */
export const RAYS = 'rays';
/** The chart of who hears whom, in the chooser's list of views. */
export const TALK = 'talk';
/** Everything the chooser offers, with its label. */
const OFFERED = [...Object.entries(VIEWS), [TALK, 'Who hears whom (STI chart)'], [RAYS, 'Ray tracing']];

/**
 * The chapters of the tour, in order. Each is { title, views, seconds, from,
 * to } — `from` and `to` how far up the frequency range it starts and ends
 * (0 the bottom, 1 the top; null holds it where it is) — with `reveal` (the
 * field wiped in), `build` (the 3-D room building itself up), `trace` (ray
 * tracing over it), `cam` (where the 3-D room is seen from), `orbit`
 * (degrees round the room over the chapter), `jib` (the camera booming in
 * and out over it) and `chart` (a chart drawn in place of the views).
 * `length` is a key of LENGTHS, `views` the views chosen (VIEWS' keys, TALK
 * and RAYS), `people` how many talk and listen — the chart needs two.
 */
export function tourPlan({ length = 'full', views = OFFERED.map(([k]) => k), people = 2 } = {}) {
  const L = LENGTHS[length] ?? LENGTHS.full;
  const want = new Set(views);
  const out = [];
  const add = (c) => c.seconds > 0 && out.push({ from: null, to: null, ...c });
  for (const group of GROUPS) {
    const mine = group.views.filter((v) => want.has(v));
    for (const v of mine) {
      if (L.reveal) add({ title: `${VIEWS[v]} — the field revealed, top to bottom`, views: [v], seconds: L.reveal, from: 1, to: 0, reveal: true });
      if (L.summary) add({ title: `${VIEWS[v]} — summary`, views: [v], seconds: L.summary, from: 0, to: 1 });
      if (L.sweep) {
        add({ title: `${VIEWS[v]} — sweep up`, views: [v], seconds: L.sweep, from: 0, to: 1 });
        add({ title: `${VIEWS[v]} — sweep down`, views: [v], seconds: L.sweep, from: 1, to: 0 });
      }
    }
    if (mine.length > 1) {
      add({ title: `${group.title} together — sweep up`, views: mine, seconds: L.group, from: 0, to: 1 });
      if (length === 'full') add({ title: `${group.title} together — sweep down`, views: mine, seconds: L.group, from: 1, to: 0 });
    }
  }
  if (want.has('3d')) {
    const angles = length === 'full' ? ANGLES : ANGLES.slice(0, 1);
    for (const a of angles) add({ title: `${VIEWS['3d']} — building up, ${a.name}`, views: ['3d'], seconds: L.build, build: true, cam: a });
    angles.forEach((a, i) => {
      const up = i % 2 === 0;
      add({ title: `${VIEWS['3d']} — sweep ${up ? 'up' : 'down'}, ${a.name}`, views: ['3d'], seconds: L.sweep3d, from: up ? 0 : 1, to: up ? 1 : 0, cam: a, orbit: i >= 2 ? 90 : 0, jib: true });
    });
  }
  if (want.has(TALK) && people >= 2) add({ title: 'Who hears whom — speech intelligibility', views: [], seconds: L.talk, chart: TALK });
  if (want.has(RAYS)) add({ title: 'Ray tracing', views: ['3d'], seconds: L.trace, from: 0, to: 1, trace: true, cam: ANGLES[0], orbit: 360, jib: true });
  const every = Object.keys(VIEWS).filter((v) => want.has(v));
  // the 3-D room nearer in a cell of its own among the drawings
  const near = { ...ANGLES[0], dist: 1.3 };
  if (every.length > 1) {
    add({ title: 'Every view — sweep up', views: every, seconds: L.all, from: 0, to: 1, cam: near });
    if (length === 'full') add({ title: 'Every view — sweep down', views: every, seconds: L.all, from: 1, to: 0, cam: near });
    if (L.recap) add({ title: 'Summary of the summary', views: every, seconds: L.recap, from: 0, to: 1, cam: near, orbit: 45 });
  }
  return out;
}

/** How long a plan runs, seconds. */
export const tourLength = (plan) => plan.reduce((s, c) => s + c.seconds, 0);

/**
 * Where the tour is at `t` seconds: the chapter (an index into `plan`), `k`
 * how far through it (0 … 1), and `u` how far up the frequency range, or null
 * where it is held still.
 */
export function tourAt(t, plan) {
  let start = 0;
  for (let i = 0; i < plan.length; i++) {
    const c = plan[i];
    if (t < start + c.seconds || i === plan.length - 1) {
      const k = Math.max(0, Math.min(1, (t - start) / c.seconds));
      return { chapter: i, k, u: c.from == null ? null : c.from + (c.to - c.from) * k };
    }
    start += c.seconds;
  }
  return { chapter: -1, k: 0, u: null };
}

/** The same chapters with a song: shared out over its length in proportion, and nothing swept — the field follows the song. */
export function songPlan(plan, duration) {
  const scale = duration / tourLength(plan);
  return plan.map((c) => ({ ...c, seconds: c.seconds * scale, from: null, to: null }));
}

/** The chooser's last choice, kept in this browser; a view it was never offered comes ticked. */
const CHOICE_KEY = 'acoustic.tour.choice';
function lastChoice() {
  const all = OFFERED.map(([k]) => k);
  try {
    const c = JSON.parse(localStorage.getItem(CHOICE_KEY));
    if (c && LENGTHS[c.length] && Array.isArray(c.views)) {
      const offered = c.offered ?? [...Object.keys(VIEWS), RAYS];
      return { length: c.length, views: [...c.views, ...all.filter((k) => !offered.includes(k))] };
    }
  } catch {
    /* nothing kept */
  }
  return { length: 'full', views: all };
}
function keepChoice(c) {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify({ ...c, offered: OFFERED.map(([k]) => k) }));
  } catch {
    /* not kept: the next tour opens on the default */
  }
}

const FRAME = { w: 1920, h: 1080 };
const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/** The caption band along the foot of the frame, px. */
const BAND = 92;

/**
 * The camera on a jib, `k` of the way through a chapter: the boom swings in
 * toward the room and down, then back out and up, easing at both ends; the
 * chapter's orbit carries it round as it goes. Single views fill the frame
 * above the caption; in a grid the cell is the frame.
 */
function camAt(c, k) {
  const s = Math.sin(Math.PI * k) ** 2;
  const yaw = c.cam.yaw + (c.orbit ?? 0) * k;
  const fit = { band: c.views.length === 1 ? BAND / FRAME.h : 0 };
  if (!c.jib) return { ...c.cam, yaw, fit };
  return { ...c.cam, yaw: yaw + 12 * s, pitch: Math.max(4, c.cam.pitch - 14 * s), dist: c.cam.dist * (1 - 0.3 * s), zoom: 1 + 0.6 * s, fit };
}

/** The people's names, by id, numbered where two share one. */
function namesOf(people) {
  const count = {};
  for (const p of people) count[p.name] = (count[p.name] ?? 0) + 1;
  const nth = {};
  return Object.fromEntries(people.map((p) => [p.id, count[p.name] > 1 ? `${p.name} ${(nth[p.name] = (nth[p.name] ?? 0) + 1)}` : p.name || 'Listener']));
}

/**
 * Who hears whom, as a chart: one row for each person talking, one column
 * for each listening, every cell the STI that way round in its IEC rating's
 * colour, with the rating and the distance under it; the ratings along the foot.
 */
function drawTalkChart(ctx, people, paths, h) {
  const W = FRAME.w;
  const n = people.length;
  const names = namesOf(people);
  const name = (p) => names[p.id];
  const labelW = 300;
  const cell = Math.min(150, (W - labelW - 160) / n, (h - 260) / n);
  const x0 = (W - labelW - cell * n) / 2 + labelW;
  const y0 = (h - cell * n) / 2 + 30;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9aa4b2';
  ctx.font = '20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('listening →', x0 + (cell * n) / 2, y0 - 78);
  ctx.textAlign = 'right';
  ctx.fillText('talking ↓', x0 - 20, y0 - 78);
  ctx.font = `${Math.min(20, cell / 5)}px system-ui, sans-serif`;
  people.forEach((p, i) => {
    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'right';
    ctx.fillText(name(p), x0 - 20, y0 + (i + 0.5) * cell);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(x0 + (i + 0.5) * cell, y0 - 30);
    if (n > 5) ctx.rotate(-Math.PI / 6);
    ctx.fillText(name(p), 0, 0);
    ctx.restore();
  });
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = x0 + j * cell;
      const y = y0 + i * cell;
      const path = paths.find((q) => q.from === people[i].id && q.to === people[j].id);
      ctx.fillStyle = path ? stiColour(path.sti) : '#1c212b';
      ctx.globalAlpha = path ? 0.85 : 1;
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      if (!path) {
        ctx.fillStyle = '#4b5563';
        ctx.font = `${cell / 4}px system-ui, sans-serif`;
        ctx.fillText('—', x + cell / 2, y + cell / 2);
        continue;
      }
      ctx.fillStyle = '#0b0d12';
      ctx.font = `600 ${cell / 3.4}px ui-monospace, monospace`;
      ctx.fillText(path.sti.toFixed(2), x + cell / 2, y + cell * 0.42);
      ctx.font = `${cell / 8.5}px system-ui, sans-serif`;
      ctx.fillText(`${path.rating} · ${path.r.toFixed(1)} m`, x + cell / 2, y + cell * 0.72);
    }
  // the IEC scale, worst to best
  const sw = 150;
  const lx = (W - sw * STI_RATINGS.length) / 2;
  const ly = y0 + cell * n + 50;
  ctx.font = '18px system-ui, sans-serif';
  STI_RATINGS.forEach((r, i) => {
    ctx.fillStyle = stiColour(r.min);
    ctx.fillRect(lx + i * sw, ly, sw - 6, 10);
    ctx.fillStyle = '#9aa4b2';
    ctx.textAlign = 'left';
    ctx.fillText(`${r.label} ≥ ${r.min.toFixed(2)}`, lx + i * sw, ly + 28);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * `onStart(seconds, withSong)` / `onStop()` start the song alongside, or the
 * engine painting the sweep's frames; `sweepTo(u)` puts the field at `u` of
 * the way up the frequency range, or answers false while that frame is not painted yet; `soundtrack()` is the song, { stream, duration }, or null; `caption()`
 * is the line under each chapter's title (the room, the method, the frequency);
 * `name()` what the video is called; `drawResponse(canvas, out, settings)` draws
 * the frequency response (ui/meters.js) for the corner of every frame.
 */
export function createTour({ store, engine, onStart, onStop, sweepTo, caption, name, drawResponse, soundtrack = () => null }) {
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
    run = { win, recorder: null, state, timer: 0, watch: setInterval(() => win.closed && stop(true), 500) };
    choose(doc, stage, state);
  }

  /** The chooser: how long, which views, and the length that makes; Start records it. */
  function choose(doc, stage, state) {
    const song = soundtrack();
    const choice = lastChoice();
    const box = doc.createElement('form');
    box.style.cssText = 'display:grid;gap:14px;padding:24px 28px;max-width:560px;color:#e5e7eb;font:15px system-ui,sans-serif;background:#141821;border:1px solid #2a2f3a;border-radius:8px';
    box.innerHTML = `<b style="font-size:18px">What the tour shows</b>
<fieldset style="border:0;padding:0;margin:0;display:grid;gap:6px"><legend style="color:#9aa4b2;margin-bottom:6px">Length</legend>
${Object.entries(LENGTHS).map(([k, l]) => `<label><input type="radio" name="length" value="${k}"${k === choice.length ? ' checked' : ''}> ${l.title}</label>`).join('')}</fieldset>
<fieldset style="border:0;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:6px"><legend style="color:#9aa4b2;margin-bottom:6px">Views</legend>
${OFFERED.map(([k, t]) => `<label><input type="checkbox" name="view" value="${k}"${choice.views.includes(k) ? ' checked' : ''}> ${t}</label>`).join('')}</fieldset>
<span class="len" style="color:#9aa4b2"></span>
<button type="submit" style="justify-self:start;padding:6px 18px">▶ Start recording</button>`;
    stage.append(box);
    const people = talkers(store.state.mics).length;
    const read = () => ({ length: box.querySelector('[name=length]:checked')?.value ?? 'full', views: [...box.querySelectorAll('[name=view]:checked')].map((i) => i.value) });
    const planOf = (c) => tourPlan({ ...c, people });
    const show = () => {
      const plan = planOf(read());
      box.querySelector('.len').textContent = !plan.length
        ? 'Choose a view.'
        : song?.duration
          ? `${plan.length} chapters over the song's ${clock(song.duration)} — the field follows the song`
          : `${plan.length} chapters · ${clock(tourLength(plan))} of video`;
      box.querySelector('[type=submit]').disabled = !plan.length;
    };
    box.addEventListener('change', show);
    show();
    state.textContent = 'choose, then start';
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const c = read();
      keepChoice(c);
      box.remove();
      record(doc, stage, state, song, song?.duration ? songPlan(planOf(c), song.duration) : planOf(c));
    });
  }

  function record(doc, stage, state, song, plan) {
    // what each view is drawn with this frame: the tour's own, never the page's settings
    // the 3-D room without its talk labels: who hears whom is a chart of its own
    const over = { reveal: 1, show: { trace: false, talk: false }, cam: null, intro: 0 };
    // the chart's pairs, worked out once before the recording starts
    const people = talkers(store.state.mics);
    const paths = plan.some((c) => c.chart === TALK) && engine.out.room ? talkPaths(engine.out.room, people, { maxOrder: Math.min(store.state.settings.maxOrder ?? 2, 3) }) : [];
    const needed = new Set(plan.flatMap((c) => c.views));
    const views = {};
    for (const v of needed) {
      const tile = doc.createElement('div');
      tile.className = `tile ${v === '3d' ? 't3d' : 'face'}`;
      tile.style.cssText = 'position:absolute;left:-10000px;width:1280px;height:720px';
      tile.innerHTML = '<canvas style="width:100%;height:100%;display:block"></canvas><div class="readout"></div>';
      doc.body.append(tile);
      const canvas = tile.querySelector('canvas');
      // the room whole unless a chapter is building it up
      const view =
        v === '3d'
          ? createView3d({ canvas, store, engine, introSpeed: () => over.intro, camera: () => over.cam, show: () => over.show })
          : createFaceView({ tile, face: v, store, engine, reveal: () => over.reveal, show: () => over.show });
      views[v] = { canvas, view };
    }

    // the frequency response, drawn off screen at the inset's size and copied onto every frame
    const FR = { w: 640, h: 230, pad: 24 };
    const fr = doc.createElement('canvas');
    fr.style.cssText = `position:absolute;left:-10000px;width:${FR.w}px;height:${FR.h}px`;
    doc.body.append(fr);
    const drawInset = () => {
      drawResponse(fr, engine.out, store.state.settings);
      const x = FRAME.w - FR.w - FR.pad;
      const y = FRAME.h - BAND - FR.h - FR.pad - 26;
      ctx.fillStyle = 'rgba(11, 13, 18, .86)';
      ctx.fillRect(x - 10, y - 4, FR.w + 20, FR.h + 36);
      const mix = store.state.mics.find((m) => m.mix);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText(`Frequency response · ${mix ? `${mix.name || 'mix seat'} at ${mix.x.toFixed(2)}, ${mix.y.toFixed(2)} m, ${mix.z.toFixed(2)} m up` : 'no mix seat'}`, x, y + 18);
      ctx.drawImage(fr, x, y + 28, FR.w, FR.h);
    };

    // what is recorded: the chapter, its title and caption, the time along the bottom
    const frame = doc.createElement('canvas');
    frame.width = FRAME.w;
    frame.height = FRAME.h;
    frame.style.cssText = 'max-width:100%;max-height:100%;aspect-ratio:16/9';
    stage.append(frame);
    const ctx = frame.getContext('2d');

    const stream = frame.captureStream(30);
    for (const track of song?.stream.getAudioTracks() ?? []) stream.addTrack(track);
    // with a song, a video codec and opus for its sound
    const type = TYPES.map((t) => (song ? t.replace(/codecs=(vp\d)/, 'codecs=$1,opus') : t)).find((t) => window.MediaRecorder?.isTypeSupported(t));
    const chunks = [];
    const recorder = type ? new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 }) : null;
    if (recorder) recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    state.textContent = recorder ? '● recording' : 'this browser cannot record — playing only';

    const total = tourLength(plan);
    // the tour's own clock: it runs while the picture is ready, and stands still (the recording paused) while a frame is painted
    let t = 0;
    let tick = performance.now();
    let current = -1;
    Object.assign(run, { recorder, chunks, type, frame });
    run.timer = setInterval(() => {
      const now = performance.now();
      const dt = (now - tick) / 1000; // what was recorded since the last tick: the waits are not, they return before the clock moves
      tick = now;
      if (t >= total) return finish();
      const at = tourAt(t, plan);
      const c = plan[at.chapter];
      const waiting = at.u != null && !sweepTo(at.u);
      if (waiting) {
        if (recorder?.state === 'recording') recorder.pause();
        state.textContent = `◌ painting the sweep · ${clock(total - t)} of video left`;
        return;
      }
      if (recorder?.state === 'paused') recorder.resume();
      t += dt;
      over.reveal = c.reveal ? at.k : 1;
      over.show = { trace: Boolean(c.trace), talk: false };
      over.cam = c.cam ? camAt(c, at.k) : null;
      over.intro = c.build ? 1 : 0;
      if (at.chapter !== current) {
        current = at.chapter;
        if (c.build) views['3d'].view.replay();
      }
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, FRAME.w, FRAME.h);
      // one view fills the frame; several share it, a grid of 16:9 cells
      const cols = Math.ceil(Math.sqrt(c.views.length));
      const rows = Math.ceil(c.views.length / cols);
      const cw = FRAME.w / cols;
      const ch = Math.min(FRAME.h / rows, (cw * 9) / 16);
      const cwFit = (ch * 16) / 9;
      const y0 = (FRAME.h - BAND - ch * rows) / 2;
      if (c.chart === TALK) drawTalkChart(ctx, people, paths, FRAME.h - BAND);
      c.views.forEach((v, i) => {
        const { canvas, view } = views[v];
        view.render();
        if (c.views.length === 1) return ctx.drawImage(canvas, 0, 0, FRAME.w, FRAME.h);
        const col = i % cols;
        const row = Math.floor(i / cols);
        // the last row's cells centred under the full ones
        const inRow = row === rows - 1 ? c.views.length - row * cols : cols;
        const x = (FRAME.w - inRow * cwFit) / 2 + col * cwFit;
        ctx.drawImage(canvas, x + 2, Math.max(0, y0) + row * ch + 2, cwFit - 4, ch - 4);
      });
      drawInset();
      ctx.fillStyle = 'rgba(10, 12, 18, .78)';
      ctx.fillRect(0, FRAME.h - BAND, FRAME.w, BAND);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '600 34px system-ui, sans-serif';
      ctx.fillText(c.title, 40, FRAME.h - 50);
      ctx.fillStyle = '#9aa4b2';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText(caption(), 40, FRAME.h - 18);
      ctx.textAlign = 'right';
      ctx.fillText(`${at.chapter + 1} / ${plan.length}`, FRAME.w - 40, FRAME.h - 50);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f4902c';
      ctx.fillRect(0, FRAME.h - 4, (FRAME.w * t) / total, 4);
      state.textContent = `${recorder ? '● recording' : '▶ playing'} · ${c.title} · ${clock(total - t)} left`;
    }, 1000 / 30);
    recorder?.start(1000);
    onStart(total, Boolean(song));
  }

  /** The last chapter is done: the video saved, and played back in the window. */
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
    if (r.recorder?.state === 'recording' || r.recorder?.state === 'paused') {
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
