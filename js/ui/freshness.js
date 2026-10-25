// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * A NEWER APP ON THE SERVER: SAY SO
 *
 * There is no build step and no version number: the app is its files. So the
 * page remembers what each of its own files looked like when it loaded — the
 * page, every module and stylesheet the browser fetched for it — by the
 * server's ETag, Last-Modified and length, and asks again now and then with
 * HEAD requests. When any of them has changed, a banner says the app was
 * updated and offers ⟳ Refresh; nothing reloads by itself. The room is kept
 * in this browser as you work (model/store.js), so a refresh loses nothing.
 *
 * ⟳ Refresh flushes before it reloads. The host (GitHub Pages) lets browsers
 * keep each file ten minutes, and a plain reload happily mixes a new page with
 * old modules from that cache. So every file of ours — this page's and the
 * CAD frame's — is fetched again with `cache: 'reload'`, which overwrites the
 * browser's copy, and any Cache Storage or service worker is dropped first.
 *
 * Asked only while the tab is visible: every minute, and when the tab comes
 * back into view. Files from other origins (CDNs) are
 * not this app's and are left alone.
 */

const EVERY_MS = 60_000;

/** What a file looked like, as one string; '' when the server says nothing useful. */
async function stamp(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!r.ok) return '';
    const h = r.headers;
    return [h.get('etag'), h.get('last-modified'), h.get('content-length')].map((v) => v ?? '').join('|').replace(/^\|*$/, '');
  } catch {
    return '';
  }
}

/** The page and every script and stylesheet it loaded from its own origin. */
function ownFiles() {
  const urls = new Set([location.href.split('#')[0].split('?')[0]]);
  for (const e of performance.getEntriesByType('resource')) {
    const u = new URL(e.name);
    if (u.origin === location.origin && /\.(m?js|css|html|json)$/.test(u.pathname)) urls.add(u.origin + u.pathname);
  }
  return [...urls];
}

/** Everything of ours the browser may hold, the CAD frame's files included. */
function everyOwnFile() {
  const urls = new Set(ownFiles());
  for (const f of document.querySelectorAll('iframe')) {
    try {
      const w = f.contentWindow;
      if (w.location.origin !== location.origin) continue;
      urls.add(w.location.href.split('#')[0].split('?')[0]);
      for (const e of w.performance.getEntriesByType('resource')) {
        const u = new URL(e.name);
        if (u.origin === location.origin) urls.add(u.origin + u.pathname);
      }
    } catch {
      // a frame from elsewhere is not ours to flush
    }
  }
  return [...urls];
}

/** Drop every cached copy of this app, then load it again. */
async function flushAndReload() {
  try {
    if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    await Promise.all(everyOwnFile().map((url) => fetch(url, { cache: 'reload' }).catch(() => null)));
  } finally {
    location.reload();
  }
}

export function watchForUpdates({ banner }) {
  const seen = new Map();
  let changed = false;
  let busy = false;

  async function check() {
    if (changed || busy || document.hidden) return;
    busy = true;
    try {
      const files = ownFiles();
      const stamps = await Promise.all(files.map(stamp));
      files.forEach((url, i) => {
        const now = stamps[i];
        if (!now) return;
        const was = seen.get(url);
        if (was === undefined) seen.set(url, now);
        else if (was !== now) changed = true;
      });
    } finally {
      busy = false;
    }
    if (changed) show();
  }

  function show() {
    const button = banner.querySelector('[data-act=refresh]');
    button.onclick = () => {
      button.disabled = true;
      button.textContent = '⟳ Refreshing…';
      flushAndReload();
    };
    banner.querySelector('[data-act=close]').onclick = () => (banner.hidden = true);
    banner.hidden = false;
  }

  // the first pass only remembers; give the page a moment to finish loading its modules first
  setTimeout(check, 3000);
  setInterval(check, EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
}
