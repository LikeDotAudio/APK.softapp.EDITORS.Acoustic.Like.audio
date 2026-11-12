// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTICS.LIKE.AUDIO — the sweep, the song player and the tour.
 * Lifted out of main.js (ROAD-3753) and run at the same point of its start-up:
 * `app` is the page's shared context — what main.js holds, and what the other parts return.
 */
import { createPlayer } from '../ui/player.js';
import { sweepFrames } from '../compute/engine.js';
import { createTour } from '../ui/tour.js';
import { drawResponse, hz } from '../ui/meters.js';
import { F_MAX, F_MIN } from '../compute/compute.js';

export function startTour(app) {
  const { engine, store } = app;

  // ------------------------------------------------------------------ sweep and tour
  const sweepBtn = document.getElementById('sweep');
  const tourBtn = document.getElementById('tour');
  let sweep = null;

  function stopSweep() {
    if (!sweep) return;
    clearInterval(sweep.timer);
    sweep = null;
    engine.frames(false);
    sweepBtn.classList.remove('on');
    tourBtn.classList.remove('on');
    sweepBtn.textContent = '▶ Sweep';
  }

  /**
   * Up and down the frames the engine has painted, a lap every `seconds`
   * however many are ready — coarse at first, smoother as the gaps fill in.
   */
  function startSweep({ seconds = 16 } = {}) {
    stopSweep();
    if (store.state.settings.method === 'energy') store.setSettings({ method: 'wave' });
    engine.frames(true);
    sweep = {
      timer: setInterval(() => {
        const now = performance.now();
        const ready = engine.out.frames.ready;
        if (ready.length && now - sweep.stepped >= Math.max(40, (seconds * 1000) / ready.length)) {
          sweep.stepped = now;
          // from wherever the slider is to the next ready frame, turning round at the ends
          const at = store.state.settings.freq;
          let i = sweep.dir > 0 ? ready.findIndex((f) => f > at) : ready.findLastIndex((f) => f < at);
          if (i < 0) {
            sweep.dir = -sweep.dir;
            i = sweep.dir > 0 ? Math.min(1, ready.length - 1) : Math.max(0, ready.length - 2);
          }
          if (ready[i] !== at) store.setSettings({ freq: ready[i] });
        }
      }, 30),
      stepped: 0,
      dir: 1,
    };
    sweepBtn.classList.add('on');
    sweepBtn.textContent = '■ Stop';
  }

  // a song: the field shows the room at the frequency the music is exciting (ui/player.js); it and the sweep take turns
  const player = createPlayer({
    root: document.getElementById('player'),
    store,
    engine,
    onPlay: (on) => {
      if (on) stopSweep();
    },
  });
  document.getElementById('songFile').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) player.load(f);
    e.target.value = '';
  });

  // the tour's sweep moves a twelfth of an octave a frame
  const TOUR_FRAMES = sweepFrames(1 / 12);

  // the tour: a window of its own plays every view in turn while the frequency sweeps, and saves it as a video
  const tour = createTour({
    store,
    engine,
    drawResponse,
    // with a song loaded, the tour plays it from the top, the field following it, and records it under the pictures
    soundtrack: () => (player.loaded ? { stream: player.stream(), duration: player.duration } : null),
    onStart: (seconds, withSong) => {
      if (withSong) player.restart();
      else {
        // the views are held still while the engine paints the frames the sweep will play
        stopSweep();
        if (store.state.settings.method === 'energy') store.setSettings({ method: 'wave' });
        engine.frames(true, TOUR_FRAMES);
      }
      tourBtn.classList.add('on');
    },
    // the tour's frame nearest the point that far up the range, on a log scale — false while it is still being painted
    sweepTo: (u) => {
      const want = Math.log(F_MIN) + u * (Math.log(F_MAX) - Math.log(F_MIN));
      const f = TOUR_FRAMES.reduce((best, g) => (Math.abs(Math.log(g) - want) < Math.abs(Math.log(best) - want) ? g : best));
      if (!engine.out.frames.ready.includes(f)) return false;
      if (f !== store.state.settings.freq) store.setSettings({ freq: f });
      return true;
    },
    onStop: () => {
      if (player.playing) player.pause();
      stopSweep();
      engine.frames(false);
      tourBtn.classList.remove('on');
    },
    caption: () => {
      const { settings } = store.state;
      const room = engine.out.room;
      const size = room ? `${Math.round(room.L * 1000)} × ${Math.round(room.W * 1000)} × ${Math.round(room.H * 1000)} mm` : '';
      return [store.state.fileName, size, settings.method, settings.method === 'energy' ? '' : `${hz(settings.freq)} Hz`].filter(Boolean).join(' · ');
    },
    name: () => (store.state.fileName || 'room').replace(/\.[^.]+$/, ''),
  });

  sweepBtn.addEventListener('click', () => (tour.running ? tour.stop() : sweep ? stopSweep() : (player.pause(), startSweep())));
  tourBtn.addEventListener('click', () => (tour.running ? tour.stop() : tour.start()));

  return { startSweep };
}
