// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * ANY PANEL, IN A WINDOW OF ITS OWN
 *
 * A meter, an elevation, the 3-D room or the inspector can leave the page for
 * a browser window of its own — to be dragged to a second screen, made full
 * screen, explored at size — and come back when that window closes or ⇲ Dock
 * is pressed. The element itself moves (same origin, so the node, its canvas
 * and its listeners go with it); the page keeps a placeholder where it was and
 * puts it back there. Whatever draws it keeps drawing it: the views and meters
 * hold on to their elements, not to where they sit.
 *
 * `tools(win)` adds buttons to the window's bar — a meter's PNG and CSV. The
 * window closes with the page.
 */

const open = new Set();
window.addEventListener('pagehide', () => {
  for (const p of open) p.dock();
});

export function makePoppable(el, { title, onChange = () => {}, onPopped = () => {}, tools = () => [] }) {
  el.classList.add('poppable');
  const btn = document.createElement('button');
  btn.className = 'popbtn';
  btn.textContent = '⇱';
  btn.title = 'Open in a window of its own';
  el.append(btn);

  let win = null;
  let placeholder = null;
  let watch = 0;

  const self = {
    get window() {
      return win;
    },
    pop() {
      if (win && !win.closed) return win.focus();
      const w = window.open('', `acoustic-${title.replace(/\W+/g, '-')}`, 'popup,width=960,height=560');
      if (!w) {
        alert('The browser blocked the window — allow pop-ups for this page.');
        return;
      }
      win = w;
      const css = new URL('css/app.css', location.href).href;
      w.document.open();
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title} — ACOUSTICS.LIKE.AUDIO</title><link rel="stylesheet" href="${css}"></head><body class="popout"><div class="popbar"><b>${title}</b><span class="tools"></span><button data-act="full" title="Full screen">⛶</button><button data-act="dock" title="Back into the page">⇲ Dock</button></div><div class="host"></div></body></html>`);
      w.document.close();
      const bar = w.document.querySelector('.popbar .tools');
      for (const t of tools(w)) bar.append(w.document.adoptNode(t));
      w.document.querySelector('[data-act=dock]').onclick = () => self.dock();
      w.document.querySelector('[data-act=full]').onclick = () => w.document.documentElement.requestFullscreen?.();
      placeholder = document.createComment('popped');
      el.replaceWith(placeholder);
      w.document.querySelector('.host').append(w.document.adoptNode(el));
      el.classList.add('popped');
      btn.hidden = true;
      w.addEventListener('resize', () => onChange());
      watch = setInterval(() => win?.closed && self.dock(), 500);
      open.add(self);
      onPopped(true);
      // the stylesheet loads after the node moves: draw again once it has
      w.addEventListener('load', () => onChange());
      setTimeout(onChange, 60);
    },
    dock() {
      if (!win) return;
      clearInterval(watch);
      open.delete(self);
      placeholder.replaceWith(document.adoptNode(el));
      el.classList.remove('popped');
      btn.hidden = false;
      if (!win.closed) win.close();
      win = null;
      onPopped(false);
      requestAnimationFrame(onChange);
    },
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    self.pop();
  });
  return self;
}

/** Save what a canvas shows as a PNG. */
export function saveCanvas(canvas, name) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

/** Rows → CSV text: the first row is the header; numbers to 4 places, text quoted when it must be. */
export function toCsv(rows) {
  const cell = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toFixed(4)) : '';
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
