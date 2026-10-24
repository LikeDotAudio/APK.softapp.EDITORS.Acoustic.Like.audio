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
 * The protocol string is the contract; it lives in
 * EDITORS.CAD.Like.audio/src/shell/hostBridge/hostBridge.ts.
 */

export const HOST_PROTOCOL = 'cad.like.audio/host@1';

export const METRES_PER_UNIT = { in: 0.0254, mm: 0.001, cm: 0.01, m: 1, ft: 0.3048 };

export function connectCad(iframe, { onView, onGeometry, onMirror, onReady }) {
  const send = (type, body = {}) => iframe.contentWindow?.postMessage({ protocol: HOST_PROTOCOL, type, ...body }, window.location.origin);

  window.addEventListener('message', (e) => {
    if (e.source !== iframe.contentWindow || e.origin !== window.location.origin) return;
    const msg = e.data;
    if (!msg || msg.protocol !== HOST_PROTOCOL) return;
    if (msg.type === 'ready') onReady?.();
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
  };
}
