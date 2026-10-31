// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE OTHER END OF THE CAD'S HOST BRIDGE
 *
 * CAD.Like.audio, embedded in our iframe, posts three things — `view` (its
 * world→screen transform and canvas box), `geometry` (walls and closed rooms)
 * and `mirror` (the Virtual Mirror axes). This turns them into callbacks and
 * sends the four requests the bridge accepts: `hello`, `fit`, `mirror`, and
 * `sheet` — jump to the drawing on a layer (the plan, or one wall's
 * elevation), drawing `seed` there first if the layer is empty.
 *
 * And it sends the PALETTE — every finish and product this app knows
 * (materials.js paletteItems), so the CAD can offer them as fills and blocks.
 * `palette` { title, items: [{ id, name, category, color, hatch?, size?, note? }] }:
 * `size` [w, h] in metres makes it a fixed-size block, absent an area finish.
 * What gets placed comes back on `geometry` as `patches` [{ id, paletteId,
 * layerId, points }] in CAD units. The last palette sent is remembered and
 * sent again whenever the CAD says `ready`, so a reloaded iframe has it too.
 *
 * POP OUT. The CAD can leave the iframe for a window of its own and come
 * back: `popOut()` opens the same address in a window with `&handover=<token>`
 * and sends the docked CAD `handover` { token }. The two CADs pass the
 * drawing between themselves (the CAD's hostHandover.ts, a BroadcastChannel)
 * — this page never asks for it or holds it. The window says `ready` once it
 * has the drawing; only then is the iframe blanked — so every drawing set
 * (marks, elevations, blocks) is there when it opens, not one autosave behind.
 * `dockIn()` (or closing that window) closes it and reloads the iframe. Both
 * add `&resume`, so the CAD that starts restores the drawing the other one
 * autosaved — one CAD at a time, never two editing the file. Only messages
 * from whichever window holds the CAD now are heard. Popped, its `view`
 * describes a canvas nowhere near our overlay, so it is not passed on.
 *
 * LIVE, NOT REMEMBERED. Popped, the plan tile draws the walls itself, so it
 * must not draw them from what the CAD said some time ago (rule 1: no second
 * copy). `live` is true only while the window holding the CAD answers: any
 * message from it counts, and when it has been quiet for PING_MS it is asked
 * again (`hello`, which makes it send view, geometry and mirror afresh). Quiet
 * for DEAD_MS — or not yet heard since it took the drawing — it is not live,
 * `onLive(false)` fires, and the plan says there is no CAD. Docked, the CAD
 * draws the walls under us itself, so `live` is simply true.
 *
 * The pop-out handover above is CAD to CAD: the session never passes through
 * here. (`session()` below is only for the session file the user saves.)
 *
 * MARKS, ARM, SESSIONS. `marks(key, hash, items)` hands the CAD a set of
 * things to draw and keep under `key` (cad/marks.js); `arm(paletteId)` picks
 * a product for the user to place next (＋ Desk); `session()` resolves with
 * the CAD's whole drawing session and `open(session)` puts one back — what
 * the session file (File tab) is made of. `floorPlan(file)` hands it a .dxf
 * or an image to open as a new drawing.
 *
 * THE CONTRACT is published by the CAD as `contract/host@1/` — a JSON Schema
 * with one sample of every message, both ways — and vendored here unchanged
 * as `vendor/cad.like.audio/contract/`. This file is held to it by
 * tests/cadContract.test.mjs: `HOST_PROTOCOL` is the schema's, every message
 * this sends validates as `toCad.<type>`, and every `toHost` sample reaches
 * its callback. The same test fails when the vendored copy drifts from the
 * CAD's own (a monorepo checkout, or CI after "Get the CAD").
 */

export const HOST_PROTOCOL = 'cad.like.audio/host@1';

export const METRES_PER_UNIT = { in: 0.0254, mm: 0.001, cm: 0.01, m: 1, ft: 0.3048 };

/** Popped: ask a CAD window this quiet whether it is still there; this quiet, it is not. */
export const PING_MS = 4000;
export const DEAD_MS = 10000;

/** A fresh token pairing the docked CAD with the window it hands the drawing to. */
function handoverToken() {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function connectCad(iframe, { onView, onGeometry, onMirror, onReady, onPopped, onSelection, onLive }, { now = () => Date.now() } = {}) {
  const address = iframe.getAttribute('src');
  let popup = null;
  let watch = 0;
  // popping out: the window opened but has not yet taken the drawing from the docked CAD
  let opening = null;
  const target = () => (popup && !popup.closed ? popup : iframe.contentWindow);
  const send = (type, body = {}) => target()?.postMessage({ protocol: HOST_PROTOCOL, type, ...body }, window.location.origin);
  let palette = null;
  /** The last model spaces sent (marks.js spacesOf), resent with the palette whenever the CAD comes up again. */
  let spaces = null;
  let sessionWaiters = [];
  // popped: when the window holding the CAD last said anything, when we last asked it, and whether it counts as there
  let heard = -Infinity;
  let asked = -Infinity;
  let live = false;
  const setLive = (v) => {
    if (v === live) return;
    live = v;
    onLive?.(v);
  };
  /** Popped: ping a quiet CAD window, and call it gone once it has been quiet too long. Run on a timer (and by tests). */
  function heartbeat() {
    if (!popup) return;
    const t = now();
    if (t - heard >= PING_MS && t - asked >= PING_MS) {
      asked = t;
      send('hello');
    }
    if (live && t - heard >= DEAD_MS) setLive(false);
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    const msg = e.data;
    if (!msg || msg.protocol !== HOST_PROTOCOL) return;
    if (opening && e.source === opening) {
      // it has the drawing (or, with no docked CAD answering, its autosave): it holds the CAD now
      if (msg.type !== 'ready') return;
      takeOver(opening);
    }
    if (e.source !== target()) return;
    if (popup) {
      heard = now();
      setLive(true);
    }
    if (msg.type === 'ready') {
      // a CAD window that just came up: have it say where it stands, so the plan is drawn from it and not from memory
      if (popup) send('hello');
      if (palette) send('palette', palette);
      if (spaces) send('spaces', { items: spaces });
      onReady?.();
    }
    else if (msg.type === 'view') { if (!popup) onView?.(msg); }
    else if (msg.type === 'geometry') onGeometry?.(msg);
    else if (msg.type === 'mirror') onMirror?.(msg);
    else if (msg.type === 'selection') onSelection?.(msg);
    else if (msg.type === 'session') {
      for (const resolve of sessionWaiters) resolve(msg.session ?? null);
      sessionWaiters = [];
    }
  });
  iframe.addEventListener('load', () => send('hello'));

  /** The popped window took the drawing: it holds the CAD from now on, and the iframe goes blank. */
  function takeOver(win) {
    opening = null;
    clearInterval(watch);
    popup = win;
    heard = -Infinity;
    asked = -Infinity;
    live = false;
    onLive?.(false);
    iframe.src = 'about:blank';
    iframe.hidden = true;
    watch = setInterval(() => (popup?.closed ? dockIn() : heartbeat()), 500);
    onPopped?.(true);
  }

  function dockIn() {
    if (!popup) return;
    clearInterval(watch);
    if (!popup.closed) popup.close();
    popup = null;
    live = false;
    iframe.hidden = false;
    iframe.src = `${address}&resume`;
    onPopped?.(false);
  }
  // A popped CAD is ours: it goes when this page does.
  window.addEventListener('pagehide', () => popup?.close());

  return {
    hello: () => send('hello'),
    fit: () => send('fit'),
    setMirror: (x, enabled = true) => send('mirror', { x, enabled }),
    /** `seed`: [[x, y], …] in CAD units, or omitted. Popped, its window comes to the front. */
    sheet: (layer, { color, seed } = {}) => {
      send('sheet', { layer, color, seed });
      popup?.focus();
    },
    /** Offer these finishes and products in the CAD; resent on every `ready`. */
    palette: (title, items) => {
      palette = { title, items };
      send('palette', palette);
    },
    marks: (key, hash, items) => send('marks', { key, hash, items }),
    /** Products onto the sheet as the user's own blocks (the furniture a library room comes with). */
    place: (layer, items) => send('place', { layer, items }),
    /** Set where placed products sit: [{ id: 'block:<n>', at: [x, y], rotation? }] in CAD units (the console at the mixer's nose). */
    move: (items) => send('move', { items }),
    /** Take placed products out of the drawing: ['block:<n>', …] (right-click → Remove on the plan). One undo step in the CAD. */
    remove: (ids) => send('remove', { ids }),
    /** Make painted regions ('fill:<n>', …) another palette item where they lie (the wall builder's region select). One undo step in the CAD. */
    repaint: (ids, paletteId) => send('repaint', { ids, paletteId }),
    /** The drawings kept on the sheet as named windows onto it, the CAD's tabs: [{ id, name, subtitle, bounds: [x1, y1, x2, y2] }] in CAD units. */
    spaces: (items) => {
      spaces = items;
      send('spaces', { items });
    },
    /** Reshape the room's lines (Walls mode): { op: 'begin' | 'vertex' | 'edge' | 'end' | 'add', … } in CAD units (hostWalls.ts). */
    walls: (op) => send('walls', op),
    /** Layers on or off by name: { 'Blow-up': false, … }. Hidden, nothing on them can be clicked in the CAD. */
    layers: (visible) => send('layers', { visible }),
    /** Select these walls (edge ids) and products ('block:<n>') in the CAD too. */
    select: ({ edges = [], blocks = [] } = {}) => send('select', { edges, blocks }),
    arm: (paletteId) => {
      send('arm', { paletteId });
      popup?.focus();
    },
    /** The CAD's drawing session, or null if it does not answer within `ms`. */
    session(ms = 4000) {
      return new Promise((resolve) => {
        sessionWaiters.push(resolve);
        send('session');
        setTimeout(() => resolve(null), ms);
      });
    },
    open: (session) => send('open', { session }),
    /** A floor plan the user picked (a .dxf, or an image to trace) opened in the CAD as a new drawing under its own name. */
    floorPlan: (file) => send('floorplan', { file }),
    get popped() {
      return Boolean(popup);
    },
    /** Docked: true (the CAD draws under us). Popped: the CAD's window answered within DEAD_MS. */
    get live() {
      return !popup || live;
    },
    heartbeat,
    /** Move the CAD to a window of its own. False when the browser blocked it. */
    popOut() {
      if (popup) {
        popup.focus();
        return true;
      }
      if (opening) return true;
      const token = handoverToken();
      const url = new URL(`${address}&resume&handover=${token}`, location.href).href;
      // opened inside the click, or the browser calls it a pop-up; the docked CAD hands it the drawing itself
      const win = window.open(url, 'acoustic-cad', 'popup,width=1280,height=860');
      if (!win) return false;
      opening = win;
      send('handover', { token });
      // closed before it took the drawing: the docked CAD simply stays
      clearInterval(watch);
      watch = setInterval(() => {
        if (opening === win && win.closed) {
          opening = null;
          clearInterval(watch);
        }
      }, 500);
      return true;
    },
    dockIn,
  };
}
