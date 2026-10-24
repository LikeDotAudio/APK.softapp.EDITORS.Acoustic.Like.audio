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
 * The protocol string is the contract; it lives in
 * EDITORS.CAD.Like.audio/src/shell/hostBridge/hostBridge.ts.
 */

export const HOST_PROTOCOL = 'cad.like.audio/host@1';

export const METRES_PER_UNIT = { in: 0.0254, mm: 0.001, cm: 0.01, m: 1, ft: 0.3048 };

export function connectCad(iframe, { onView, onGeometry, onMirror, onReady }) {
  const send = (type, body = {}) => iframe.contentWindow?.postMessage({ protocol: HOST_PROTOCOL, type, ...body }, window.location.origin);
  let palette = null;

  window.addEventListener('message', (e) => {
    if (e.source !== iframe.contentWindow || e.origin !== window.location.origin) return;
    const msg = e.data;
    if (!msg || msg.protocol !== HOST_PROTOCOL) return;
    if (msg.type === 'ready') {
      if (palette) send('palette', palette);
      onReady?.();
    }
    else if (msg.type === 'view') onView?.(msg);
    else if (msg.type === 'geometry') onGeometry?.(msg);
    else if (msg.type === 'mirror') onMirror?.(msg);
  });
  iframe.addEventListener('load', () => send('hello'));

  return {
    hello: () => send('hello'),
    fit: () => send('fit'),
    setMirror: (x, enabled = true) => send('mirror', { x, enabled }),
    /** `seed`: [[x, y], …] in CAD units, or omitted. */
    sheet: (layer, { color, seed } = {}) => send('sheet', { layer, color, seed }),
    /** Offer these finishes and products in the CAD; resent on every `ready`. */
    palette: (title, items) => {
      palette = { title, items };
      send('palette', palette);
    },
  };
}
