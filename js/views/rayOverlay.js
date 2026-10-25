// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { arrangedSpeakers } from '../acoustics/layouts.js';
import { rayPaths } from '../acoustics/rayPaths.js';
import { css, turbo } from './paint.js';

/**
 * RAY TRACING, OVER ANY VIEW
 *
 * Every specular path up to the order the field is computed to (3 at most —
 * beyond that the picture is a haze), from each speaker of the arrangement
 * (the selected one alone when one is) to the mix seat, at the current
 * frequency (acoustics/rayPaths.js). Colour and weight are the path's level
 * against the direct sound, so moving the frequency or sweeping shows which
 * bounces carry the low end and which the treatments take out at the top.
 *
 * Not a view of its own: an overlay (settings.show.trace) the 3-D room, the
 * plan and every elevation draw over whatever else they show, each through
 * its own `project` (a point in the room → { x, y, depth? } on its canvas).
 */

/** How far below the direct sound a path is still drawn, dB. */
export const RAY_FLOOR_DB = 40;

// the paths are the same for every view in a frame: worked out once per room, devices and frequency
const memo = { key: null, paths: [] };

/** The paths to draw, and the order they were traced to. */
export function tracedPaths(room, state) {
  const { settings } = state;
  const mix = state.mics.find((m) => m.mix);
  if (!room || !mix) return { paths: [], order: 0, mix: null };
  const picked = state.selected?.kind === 'speaker' ? state.selected.id : null;
  const order = Math.min(3, settings.maxOrder ?? 3);
  const speakers = arrangedSpeakers(state.speakers, settings).filter((sp) => !picked || sp.id === picked);
  const key = [room, speakers, mix, settings.freq, order];
  if (!memo.key || key.some((k, i) => k !== memo.key[i])) {
    memo.key = key;
    memo.paths = rayPaths(room, speakers, mix, settings.freq, order).filter((p) => p.db > -RAY_FLOOR_DB);
  }
  return { paths: memo.paths, order, mix };
}

/**
 * Draw the traced paths through `project`; `key` adds the title line and the
 * colour key at the top left (the 3-D room, where there is room for them).
 */
export function drawRayOverlay(ctx, project, room, state, { key = false, w = 0, thin = 1 } = {}) {
  const { paths, order, mix } = tracedPaths(room, state);
  const freq = state.settings.freq;
  const title = `RAY TRACING · ${freq < 1000 ? `${freq} Hz` : `${(freq / 1000).toFixed(1)} kHz`}`;
  ctx.save();
  if (!mix) {
    if (key) {
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(`${title} · place a mix seat to trace to`, 10, 18);
    }
    ctx.restore();
    return;
  }
  for (const p of paths) {
    const pts = p.pts.map(project);
    if (pts.some((q) => q.depth !== undefined && q.depth <= 0.01)) continue;
    const heat = Math.max(0, Math.min(1, 1 + p.db / RAY_FLOOR_DB));
    const rgb = p.order ? turbo(heat) : [255, 255, 255];
    ctx.strokeStyle = css(rgb, 0.12 + 0.8 * heat * heat);
    ctx.lineWidth = (p.order ? 0.6 + 1.6 * heat : 2) * thin;
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
    ctx.fillStyle = css(rgb, 0.3 + 0.6 * heat);
    for (const q of pts.slice(1, -1)) ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
  }
  if (key) {
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(`${title} · ${paths.length} paths to ${order}${order === 1 ? 'st' : order === 2 ? 'nd' : 'rd'} order within ${RAY_FLOOR_DB} dB of direct`, 10, 18);
    // the key: colour is the path's level against the direct sound
    const kw = Math.min(160, w - 20);
    for (let i = 0; i < kw; i++) {
      ctx.fillStyle = css(turbo(i / kw));
      ctx.fillRect(10 + i, 26, 1, 6);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(`−${RAY_FLOOR_DB} dB`, 10, 43);
    ctx.fillText('0 dB = direct', 10 + kw - 62, 43);
  }
  ctx.restore();
}
