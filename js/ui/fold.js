// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * FOLDS
 *
 * A strip of the toolbar that need not take room all the time — the array's
 * fields, the furniture, the tour and the song — folded behind one button
 * and opened over the views when wanted. It closes on a click anywhere
 * else, on Esc, or (`closeOn`, a selector) once one of its own buttons has
 * done its job; one fold open at a time. A `sticky` one (the monitor
 * controller, worked while the room is watched) stays open through clicks
 * elsewhere. The folded elements keep their ids,
 * so whatever listens to them still does.
 */

const folds = new Set();

export function makeFold(button, panel, { closeOn = null, sticky = false, onOpen = () => {} } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'fold';
  button.parentNode.insertBefore(wrap, button);
  wrap.append(button, panel);
  button.classList.add('foldBtn');
  button.setAttribute('aria-expanded', 'false');
  panel.classList.add('foldPanel');
  panel.hidden = true;
  const fold = {
    get open() {
      return !panel.hidden;
    },
    set open(on) {
      if (on) for (const f of folds) if (f !== fold) f.open = false;
      panel.hidden = !on;
      // kept on the screen: slid back left when it would run off the right edge
      panel.style.left = '';
      if (on) {
        const over = panel.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
        if (over > 0) panel.style.left = `${-over}px`;
      }
      button.classList.toggle('on', on);
      button.setAttribute('aria-expanded', String(on));
      if (on) onOpen();
    },
  };
  folds.add(fold);
  button.addEventListener('click', () => (fold.open = !fold.open));
  if (closeOn) panel.addEventListener('click', (e) => e.target.closest(closeOn) && (fold.open = false));
  if (!sticky) document.addEventListener('pointerdown', (e) => fold.open && !wrap.contains(e.target) && (fold.open = false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && fold.open && (fold.open = false));
  return fold;
}
