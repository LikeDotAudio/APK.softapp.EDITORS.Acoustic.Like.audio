// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE METERS STEP ASIDE WHILE A FREQUENCY RENDERS
 *
 * Pick a new frequency — the slider, a click on the frequency response, a
 * sweep — and the field has to be painted again in every view. While it is,
 * the meters floating over the bottom of the views fade out of the way
 * (body.meters-folded, css/app.css) so the field is seen as it paints; once
 * the engine has the new field and nothing has changed for a moment, they
 * come back. A sweep keeps them away until it stops. The meters, which skip
 * their frames while folded, are asked to draw once they are back.
 *
 * And with every meter popped out into a window of its own, or tucked into
 * the tray, there is nothing left to show down there: the strip folds down to
 * its tray and Undo / Redo / Save (body.meters-empty) until one comes back.
 */

/** How long the frequency must hold, and the engine be idle, before the meters return. */
const SETTLE_MS = 700;

export function createMeterFold({ store, engine, meters = null, onUnfold = () => {}, body = document.body }) {
  if (meters) {
    const empty = () => body.classList.toggle('meters-empty', !meters.querySelector(':scope > .meter:not(.min)'));
    new MutationObserver(empty).observe(meters, { childList: true, subtree: true, attributeFilter: ['class'] });
    empty();
  }
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
