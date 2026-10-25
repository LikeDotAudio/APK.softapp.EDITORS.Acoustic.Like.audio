// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE METERS STEP ASIDE WHILE A FREQUENCY RENDERS
 *
 * Pick a new frequency — the slider, a click on the frequency response, a
 * sweep — and the field has to be painted again in every view. While it is,
 * the meters along the bottom fold away (body.meters-folded, css/app.css) so
 * the views take their height; once the engine has the new field and nothing
 * has changed for a moment, they come back. A sweep keeps them folded until
 * it stops. The views follow the room they get through their own resize
 * observer (main.js); the meters, which skip their frames while folded,
 * are asked to draw once they are back.
 */

/** How long the frequency must hold, and the engine be idle, before the meters return. */
const SETTLE_MS = 700;

export function createMeterFold({ store, engine, onUnfold = () => {}, body = document.body }) {
  let last = { freq: store.state.settings.freq, band: store.state.settings.band };
  let changedAt = 0;
  let watch = 0;

  function fold() {
    changedAt = performance.now();
    body.classList.add('meters-folded');
    if (!watch) watch = requestAnimationFrame(check);
  }

  function check() {
    watch = 0;
    const idle = !engine.out.computing && performance.now() - changedAt > SETTLE_MS;
    if (idle) {
      body.classList.remove('meters-folded');
      // the meters skipped their frames while folded: once they have their height back, draw the new frequency
      setTimeout(onUnfold, 260);
    } else watch = requestAnimationFrame(check);
  }

  store.subscribe((state) => {
    const { freq, band } = state.settings;
    if (freq === last.freq && band === last.band) return;
    last = { freq, band };
    fold();
  });

  return { fold, get folded() { return body.classList.contains('meters-folded'); } };
}
