// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/** How a speaker and a microphone look on every 2-D view, so the six read as one set of drawings. */

export const FACE_COLOURS = { front: '#ff6b6b', back: '#4dd0e1', left: '#ffd166', right: '#9b8cff', floor: '#8bc34a', ceiling: '#f48fb1' };
export const NULL_COLOURS = ['#ff4d4d', '#ff9f43', '#ffe066', '#7bed9f'];

/** A box seen from above or the side: `ang` is the screen angle its front faces (radians). */
export function drawSpeaker(ctx, x, y, ang, colour, { selected = false, label = '', size = 11 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(15,18,26,.9)';
  ctx.strokeStyle = colour;
  ctx.lineWidth = selected ? 2.5 : 1.5;
  if (selected) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.roundRect(-size * 0.8, -size, size * 1.2, size * 2, 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(size * 0.4, -size * 0.75);
  ctx.lineTo(size * 1.1, -size * 1.15);
  ctx.lineTo(size * 1.1, size * 1.15);
  ctx.lineTo(size * 0.4, size * 0.75);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.restore();
  if (label) drawLabel(ctx, x, y + size + 12, label, colour);
}

export function drawMic(ctx, x, y, ang, { mix = false, selected = false, label = '', size = 7 } = {}) {
  ctx.save();
  const colour = mix ? '#ff3b3b' : '#e6e6e6';
  ctx.strokeStyle = colour;
  ctx.lineWidth = selected ? 2.5 : 1.6;
  if (selected) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = 10;
  }
  if (mix) {
    ctx.beginPath();
    ctx.ellipse(x, y, size * 2.1, size * 0.9, ang + Math.PI / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(15,18,26,.9)';
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(ang) * size * 1.9, y + Math.sin(ang) * size * 1.9);
  ctx.stroke();
  ctx.restore();
  if (label) drawLabel(ctx, x, y + size + 12, label, colour);
}

/**
 * A listener seen from above: shoulders, head, ears and the nose they face
 * with. `ppm` sizes them as a real body (0.46 m across the shoulders), never
 * smaller than a glyph that can be grabbed. `ang` is the screen angle faced.
 */
export function drawPerson(ctx, x, y, ang, { ppm = 40, colour = '#ff3b3b', selected = false, label = '', mix = false } = {}) {
  const s = Math.max(14, 0.46 * ppm) / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = colour;
  ctx.fillStyle = 'rgba(15,18,26,.85)';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  if (selected) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = 10;
  }
  // shoulders: an ellipse across the facing direction
  ctx.beginPath();
  ctx.ellipse(-s * 0.1, 0, s * 0.45, s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // head, ears, nose
  const r = s * 0.42;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -r, r * 0.25, 0, Math.PI * 2);
  ctx.arc(0, r, r * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.9, -r * 0.3);
  ctx.lineTo(r * 1.5, 0);
  ctx.lineTo(r * 0.9, r * 0.3);
  ctx.stroke();
  if (mix) {
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  if (label) drawLabel(ctx, x, y + s + 12, label, colour);
}

export function drawLabel(ctx, x, y, text, colour = '#ddd') {
  ctx.save();
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(10,12,18,.8)';
  ctx.fillRect(x - w / 2, y - 7, w, 14);
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function dashedLine(ctx, a, b, colour, dash = [6, 4], width = 1) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

/** Size a canvas to its box at device resolution; returns the CSS-pixel 2-D context. */
export function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/** Pointer drag with capture: onMove(e) on every move, onEnd(e) once. */
export function dragFrom(e, el, onMove, onEnd) {
  el.setPointerCapture(e.pointerId);
  const move = (ev) => onMove(ev);
  const up = (ev) => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    onEnd?.(ev);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
