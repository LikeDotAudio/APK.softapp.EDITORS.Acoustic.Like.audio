// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * EVERY EDGE BETWEEN PANELS, DRAGGED
 *
 * The panels sit a hairline apart, and every hairline is a sash: drag it and
 * the two panels either side of it trade the space, everything else holds.
 *
 *   views | inspector   the inspector's width
 *   page  / meters      the meters' height
 *   view  | view        the views grid's columns and rows, whatever shape the
 *                       grid is in (six, three, wall; wide, tall) — each shape
 *                       remembers its own
 *   meter | meter       the meters' widths
 *
 * Sizes inside a grid or row are kept as fractions, so the panels still flex
 * and fill when the window changes; only the inspector and the meters' strip
 * are pixels. A double-click on a sash puts its panels back as they were.
 * Remembered in this browser only — a convenience, never the session.
 */

const STORE = 'acoustic.sashes';
const MIN = 60; // px: no panel is dragged smaller than this
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {};
} catch {
  saved = {};
}
function remember(key, value) {
  if (value == null) delete saved[key];
  else saved[key] = value;
  try {
    localStorage.setItem(STORE, JSON.stringify(saved));
  } catch {
    // private window or blocked storage: the sizes just do not outlive the page
  }
}

/** A sash element that reports drags in px from where the press began. */
function sash(dir, { onStart, onDrag, onEnd = () => {}, onReset }) {
  const el = document.createElement('div');
  el.className = `sash ${dir}`;
  el.title = 'Drag to resize · double-click to reset';
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    const from = dir === 'v' ? e.clientX : e.clientY;
    const ctx = onStart();
    el.classList.add('drag');
    document.body.classList.add(`sashing-${dir}`);
    const move = (m) => onDrag((dir === 'v' ? m.clientX : m.clientY) - from, ctx);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('drag');
      document.body.classList.remove(`sashing-${dir}`);
      onEnd(ctx);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    onReset();
  });
  return el;
}

const px = (list) => list.trim().split(/\s+/).map(parseFloat).filter((n) => n > 0);
/** Two neighbours trade `d` px, neither under MIN. */
function trade(a, b, d) {
  const k = Math.max(MIN - a, Math.min(b - MIN, d));
  return [a + k, b - k];
}

export function installSashes({ main, views, inspector, footer, meters, onResize }) {
  const root = document.documentElement;
  let pending = 0;
  const resized = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(onResize);
  };

  // ------------------------------------------------------------ the inspector's width
  const setInspector = (w) => root.style.setProperty('--inspector-w', `${Math.round(w)}px`);
  if (saved.inspector) setInspector(saved.inspector);
  const vSash = sash('v', {
    onStart: () => inspector.getBoundingClientRect().width,
    onDrag: (d, w0) => {
      setInspector(Math.max(220, Math.min(main.clientWidth - 240, w0 - d)));
      resized();
    },
    onEnd: () => remember('inspector', inspector.getBoundingClientRect().width),
    onReset: () => {
      root.style.removeProperty('--inspector-w');
      remember('inspector', null);
      resized();
    },
  });
  vSash.classList.add('inspector-sash');
  main.append(vSash);

  // ------------------------------------------------------------ the meters' height
  const setFoot = (h) => root.style.setProperty('--foot-h', `${Math.round(h)}px`);
  if (saved.foot) setFoot(saved.foot);
  footer.append(
    sash('h', {
      onStart: () => footer.getBoundingClientRect().height,
      onDrag: (d, h0) => {
        setFoot(Math.max(80, Math.min(window.innerHeight - 220, h0 - d)));
        resized();
      },
      onEnd: () => remember('foot', footer.getBoundingClientRect().height),
      onReset: () => {
        root.style.removeProperty('--foot-h');
        remember('foot', null);
        resized();
      },
    }),
  );

  // ------------------------------------------------------------ the views grid, per shape
  let shapeKey = '';
  const layer = document.createElement('div');
  layer.className = 'sashes';
  const gap = () => parseFloat(getComputedStyle(views).columnGap) || 0;
  const tracks = () => {
    const cs = getComputedStyle(views);
    return { cols: px(cs.gridTemplateColumns), rows: px(cs.gridTemplateRows) };
  };
  const write = (prop, list) => (views.style[prop] = list.map((n) => `${n.toFixed(1)}fr`).join(' '));

  function layoutKey() {
    // the inline sizes of the last shape off first, so the count is this shape's own
    views.style.gridTemplateColumns = '';
    views.style.gridTemplateRows = '';
    const { cols, rows } = tracks();
    return { key: `views:${views.className}:${views.dataset.shape ?? ''}:${cols.length}x${rows.length}`, cols, rows };
  }

  function placeSashes() {
    layer.replaceChildren();
    const { cols, rows } = tracks();
    const g = gap();
    const add = (dir, i, list) => {
      let at = 0;
      for (let j = 0; j <= i; j++) at += list[j] + g;
      const el = sash(dir, {
        onStart: () => tracks()[dir === 'v' ? 'cols' : 'rows'],
        onDrag: (d, l0) => {
          const l = [...l0];
          [l[i], l[i + 1]] = trade(l0[i], l0[i + 1], d);
          write(dir === 'v' ? 'gridTemplateColumns' : 'gridTemplateRows', l);
          resized();
        },
        onEnd: () => {
          const t = tracks();
          remember(shapeKey, { cols: views.style.gridTemplateColumns ? t.cols : null, rows: views.style.gridTemplateRows ? t.rows : null });
          placeSashes();
        },
        onReset: () => {
          remember(shapeKey, null);
          shapeKey = '';
          relayout();
          resized();
        },
      });
      el.style[dir === 'v' ? 'left' : 'top'] = `${at - g / 2}px`;
      layer.append(el);
    };
    if (views.classList.contains('maxed')) return;
    cols.slice(0, -1).forEach((_, i) => add('v', i, cols));
    rows.slice(0, -1).forEach((_, i) => add('h', i, rows));
  }

  function relayout() {
    const { key, cols, rows } = layoutKey();
    shapeKey = key;
    const s = saved[key];
    if (s?.cols?.length === cols.length) write('gridTemplateColumns', s.cols);
    if (s?.rows?.length === rows.length) write('gridTemplateRows', s.rows);
    placeSashes();
  }
  views.append(layer);
  new MutationObserver(() => {
    const before = shapeKey;
    const keep = { c: views.style.gridTemplateColumns, r: views.style.gridTemplateRows };
    const { key } = layoutKey();
    if (key === before) {
      // the same shape told again (the shape is re-set on every resize): keep what is dragged
      views.style.gridTemplateColumns = keep.c;
      views.style.gridTemplateRows = keep.r;
      placeSashes();
      return;
    }
    relayout();
    resized();
  }).observe(views, { attributes: true, attributeFilter: ['class', 'data-shape'] });
  new ResizeObserver(() => placeSashes()).observe(views);
  relayout();

  // ------------------------------------------------------------ the meters, side by side
  const kind = (m) => m.dataset.kind ?? '';
  const row = () => [...meters.children].filter((m) => m.classList.contains('meter') && m.offsetParent);
  const grow = (m, w) => (m.style.flexGrow = String(Math.round(w)));
  for (const m of meters.querySelectorAll('.meter')) {
    const w = saved.meters?.[kind(m)];
    if (w) grow(m, w);
    m.append(
      sash('v', {
        onStart: () => {
          const all = row();
          const widths = all.map((x) => x.getBoundingClientRect().width);
          // everyone holds the width they have now; only the two at the sash trade
          all.forEach((x, i) => grow(x, widths[i]));
          return { all, widths, i: all.indexOf(m) };
        },
        onDrag: (d, { all, widths, i }) => {
          if (i < 0 || i >= all.length - 1) return;
          const [a, b] = trade(widths[i], widths[i + 1], d);
          grow(all[i], a);
          grow(all[i + 1], b);
          resized();
        },
        onEnd: ({ all }) => remember('meters', { ...saved.meters, ...Object.fromEntries(all.map((x) => [kind(x), Math.round(x.getBoundingClientRect().width)])) }),
        onReset: () => {
          for (const x of meters.querySelectorAll('.meter')) x.style.flexGrow = '';
          remember('meters', null);
          resized();
        },
      }),
    );
  }
}
