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
 * back: `popOut()` blanks the iframe and opens the same address in a window,
 * `dockIn()` (or closing that window) closes it and reloads the iframe. Both
 * add `&resume`, so the CAD that starts restores the drawing the other one
 * autosaved — one CAD at a time, never two editing the file. Only messages
 * from whichever window holds the CAD now are heard. Popped, its `view`
 * describes a canvas nowhere near our overlay, so it is not passed on.
 *
 * The protocol string is the contract; it lives in
 * EDITORS.CAD.Like.audio/src/shell/hostBridge/hostBridge.ts.
 */

export const HOST_PROTOCOL = 'cad.like.audio/host@1';

export const METRES_PER_UNIT = { in: 0.0254, mm: 0.001, cm: 0.01, m: 1, ft: 0.3048 };

export function connectCad(iframe, { onView, onGeometry, onMirror, onReady, onPopped }) {
  const address = iframe.getAttribute('src');
  let popup = null;
  let watch = 0;
  const target = () => (popup && !popup.closed ? popup : iframe.contentWindow);
  const send = (type, body = {}) => target()?.postMessage({ protocol: HOST_PROTOCOL, type, ...body }, window.location.origin);
  let palette = null;

  window.addEventListener('message', (e) => {
    if (e.source !== target() || e.origin !== window.location.origin) return;
    const msg = e.data;
    if (!msg || msg.protocol !== HOST_PROTOCOL) return;
    if (msg.type === 'ready') {
      if (palette) send('palette', palette);
      onReady?.();
    }
    else if (msg.type === 'view') { if (!popup) onView?.(msg); }
    else if (msg.type === 'geometry') onGeometry?.(msg);
    else if (msg.type === 'mirror') onMirror?.(msg);
  });
  iframe.addEventListener('load', () => send('hello'));

  function dockIn() {
    if (!popup) return;
    clearInterval(watch);
    if (!popup.closed) popup.close();
    popup = null;
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
    get popped() {
      return Boolean(popup);
    },
    /** Move the CAD to a window of its own. False when the browser blocked it. */
    popOut() {
      if (popup) {
        popup.focus();
        return true;
      }
      const url = new URL(`${address}&resume`, location.href).href;
      const win = window.open(url, 'acoustic-cad', 'popup,width=1280,height=860');
      if (!win) return false;
      popup = win;
      iframe.src = 'about:blank';
      iframe.hidden = true;
      watch = setInterval(() => popup?.closed && dockIn(), 500);
      onPopped?.(true);
      return true;
    },
    dockIn,
  };
}
