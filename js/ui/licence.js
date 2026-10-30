// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE LICENCE KEY, A PLACEBO
 *
 * 📂 Open project and 📐 Open floor plan ask for a licence key first, in a
 * Windows 95 box like the one the 1997 Acoustic-X put up. Nothing checks it: any key (or none) and Enter
 * goes on to the file. The last key typed is offered again, so Enter alone
 * does it the next time. Styled by css/acoustx.css, scoped under .acx.
 */

const KEY = 'acoustic.like.audio/licenceKey';

function injectCss() {
  if (document.querySelector('link[data-acx]')) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('../../css/acoustx.css', import.meta.url).href });
  link.dataset.acx = '1';
  document.head.append(link);
}

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

/** Ask for the key; `then` runs on Enter or OK, nothing on Esc or Cancel. */
export function askLicence(then) {
  injectCss();
  let last = '';
  try {
    last = localStorage.getItem(KEY) ?? '';
  } catch {
    /* no storage: the box starts empty */
  }
  const key = el('input', { type: 'text', value: last, spellcheck: false, autocomplete: 'off', placeholder: 'XXXX-XXXX-XXXX-XXXX' });
  key.style.cssText = 'width: 100%; font-family: "Courier New", monospace; letter-spacing: 1px;';
  const ok = el('button', { type: 'submit', textContent: 'OK' });
  const cancel = el('button', { type: 'button', textContent: 'Cancel' });
  const close = el('button', { type: 'button', className: 'x', textContent: '×', title: 'Close' });
  const form = el(
    'form',
    { className: 'acx-body' },
    el('div', {}, el('p', { textContent: 'This copy of ACOUSTICS.LIKE.AUDIO must be registered before a file can be opened.' }), el('p', { textContent: 'Enter your licence key:' }), key, el('div', {}, ok, ' ', cancel)),
  );
  form.style.cssText = 'display: block; padding: 10px 12px 12px;';
  form.lastChild.lastChild.style.cssText = 'display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px;';
  const win = el('div', { className: 'acx-win front' }, el('div', { className: 'acx-title' }, el('span', { className: 'txt', textContent: 'Licence Key' }), close), form);
  win.style.cssText = 'position: relative; width: min(340px, calc(100vw - 32px));';
  const desk = el('div', { className: 'acx' }, win);
  desk.style.cssText = 'position: fixed; inset: 0; z-index: 4000; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35);';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-modal', 'true');
  win.setAttribute('aria-label', 'Licence key');

  const dismiss = () => {
    desk.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dismiss();
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      localStorage.setItem(KEY, key.value.trim());
    } catch {
      /* nothing to remember it in */
    }
    dismiss();
    then();
  });
  cancel.addEventListener('click', dismiss);
  close.addEventListener('click', dismiss);
  desk.addEventListener('mousedown', (e) => {
    if (e.target === desk) dismiss();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(desk);
  key.focus();
  key.select();
}
