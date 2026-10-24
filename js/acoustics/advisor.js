// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, C } from './bands.js';
import { heightsAtXY } from './elevations.js';
import { distToSegment } from './geometry.js';
import { criticalDistance, flutterRisk } from './analysis.js';
import { axialModes, inFrame, nullFractions, schroeder } from './room.js';
import { frame } from './patterns.js';

/**
 * THE ADVISOR
 *
 * Rules of room design, each checked against the drawing as it stands rather
 * than recited. Every finding is { level: ok | warn | info, title, detail }.
 *
 *   38 % rule      ears (not speakers) 38 % of the length from the front wall,
 *                  50 % across, clear of the modal null fractions
 *                  (2k − 1)/2n of every dimension for n ≤ 4.
 *   ear height     38–42 % of the ceiling, never its 50 % null.
 *   acoustic axis  each monitor aimed at the ears; the woofer not at 50 % H.
 *   critical dist. a monitor's listener inside R_c (the room unheard); a
 *                  projection box's audience may be far beyond it.
 *   SBIR           a free-standing box d from the wall behind it notches at
 *                  c / 4d; flush mounting removes it.
 *   spacing        AcousticRooms' sampling rules: sources ≥ 0.5 m from any
 *                  surface, ≥ 1 m apart, ≥ 0.5 m from a receiver.
 *   flutter        parallel facing surfaces that keep most of a specular
 *                  round trip at 500 Hz–1 kHz (analysis.js flutterRisk).
 */

const pct = (x) => `${(x * 100).toFixed(1)} %`;

function nullHits(fraction, nMax = 4, tol = 0.025) {
  const hits = [];
  for (let n = 1; n <= nMax; n++) for (const f of nullFractions(n)) if (Math.abs(fraction - f) < tol) hits.push(`n=${n} at ${pct(f)}`);
  return hits;
}

export function advise(room, speakers, mics, settings, mirror) {
  const out = [];
  const add = (level, title, detail) => out.push({ level, title, detail });
  const band = settings.band;
  const mix = mics.find((m) => m.mix) ?? null;

  const modes = axialModes(room, 3);
  add('info', 'Room', `${room.L.toFixed(2)} × ${room.W.toFixed(2)} × ${room.H.toFixed(2)} m (L×W×H)${room.rect ? '' : ' — working-space box of a non-rectangular plan'} · ${room.V.toFixed(1)} m³ · RT60 ${room.perBand[band].eyring.toFixed(2)} s @ ${BANDS[band]} Hz · Schroeder ${schroeder(room).toFixed(0)} Hz`);
  add('info', 'Lowest axial modes', modes.slice(0, 6).map((m) => `${m.axis}${m.n} ${m.f.toFixed(0)} Hz`).join(' · '));
  if (!room.convex) add('warn', 'Re-entrant plan', 'Image sources assume a convex room; some reflections shown cannot occur in this shape.');
  const named = (key) => (key.startsWith('wall:') ? `${room.walls[+key.slice(5)].face} wall` : key);
  for (const f of flutterRisk(room)) add('warn', `Flutter: ${named(f.a)} / ${named(f.b)}`, `${f.distance.toFixed(2)} m apart, ${(f.score * 100).toFixed(0)} % of a round trip kept specular at ${BANDS[f.band]} Hz → repeats at ${f.rateHz.toFixed(0)} Hz. Absorb or diffuse one side.`);

  if (!mix) {
    add('info', 'No mix position', 'Mark a microphone as the mix position to check the listening rules.');
  } else {
    const p = inFrame(room, mix);
    const fl = p.fromFront / room.L;
    const fw = p.fromLeft / room.W;
    // Height is read where the ears are: under a sloped ceiling the floor-to-ceiling there, not the room's mean.
    const hm = heightsAtXY(room, mix.x, mix.y);
    const Hm = hm.ceiling - hm.floor;
    const fh = (mix.z - hm.floor) / Hm;
    const lHits = nullHits(fl);
    add(Math.abs(fl - 0.38) <= 0.03 ? 'ok' : 'warn', '38 % rule (length)', `Ears at ${pct(fl)} of L from the front wall (target 38 %).${lHits.length ? ` On length nulls: ${lHits.join(', ')}.` : ''}`);
    add(Math.abs(fw - 0.5) <= 0.01 ? 'ok' : 'warn', 'Centred (width)', `Ears at ${pct(fw)} of W — 50 % keeps L/R reflections symmetrical.`);
    const hHits = nullHits(fh);
    add(fh >= 0.38 && fh <= 0.42 ? 'ok' : Math.abs(fh - 0.5) < 0.04 ? 'warn' : 'info', 'Ear height', `${mix.z.toFixed(2)} m = ${pct(fh)} of H${room.sloped ? ` here (${Hm.toFixed(2)} m)` : ''} (target 38–42 %, ${(hm.floor + 0.38 * Hm).toFixed(2)}–${(hm.floor + 0.42 * Hm).toFixed(2)} m).${hHits.length ? ` On height nulls: ${hHits.join(', ')}.` : ''}`);
    if (mirror?.enabled && Math.abs(mix.x - mirror.x) > 0.01) add('warn', 'Off the mirror axis', `Mix position is ${Math.abs(mix.x - mirror.x).toFixed(2)} m from the CAD mirror axis.`);
  }

  if (mirror?.enabled && Math.abs(Math.sin(settings.frontDeg * (Math.PI / 180))) < 0.99)
    add('warn', 'Mirror is not left/right', "The CAD's mirror axis is vertical; set the room's front to up or down for L/R symmetry.");

  for (const s of speakers) {
    const tag = s.role || s.name;
    if (mix) {
      const fr = frame(s.aim, s.tilt);
      const d = [mix.x - s.x, mix.y - s.y, mix.z - s.z];
      const off = Math.acos(Math.max(-1, Math.min(1, (fr.f[0] * d[0] + fr.f[1] * d[1] + fr.f[2] * d[2]) / Math.hypot(...d)))) * (180 / Math.PI);
      if (s.kind !== 'sub' && off > 10) add('warn', `${tag}: off axis`, `Acoustic axis ${off.toFixed(0)}° away from the ears — use "Aim at mix".`);
      const rc = criticalDistance(room, s, band);
      const dist = Math.hypot(...d);
      if (s.kind === 'monitor') add(dist <= rc ? 'ok' : 'warn', `${tag}: critical distance`, `Listener at ${dist.toFixed(2)} m, R_c ${rc.toFixed(2)} m @ ${BANDS[band]} Hz — ${dist <= rc ? 'direct field dominates' : 'the room dominates; move closer or raise Q'}.`);
    }
    const hs = heightsAtXY(room, s.x, s.y);
    const fs = (s.z - hs.floor) / (hs.ceiling - hs.floor);
    if (s.kind !== 'sub' && Math.abs(fs - 0.5) < 0.04) add('warn', `${tag}: at half height`, `Acoustic centre at ${pct(fs)} of H — it cannot drive the first vertical mode.`);
    if (s.mount === 'free') {
      const fr = frame(s.aim, 0);
      let behind = Infinity;
      for (const w of room.walls) {
        // the wall behind a box faces the way the box does: its inward normal along the aim
        if (fr.f[0] * w.nIn.x + fr.f[1] * w.nIn.y < 0.5) continue;
        behind = Math.min(behind, distToSegment(s, w.a, w.b));
      }
      if (Number.isFinite(behind) && behind > 0.02) {
        const fNotch = C / (4 * behind);
        add(fNotch >= 40 && fNotch <= 300 ? 'warn' : 'info', `${tag}: SBIR`, `${behind.toFixed(2)} m from the wall behind → first cancellation near ${fNotch.toFixed(0)} Hz. Flush mounting removes it.`);
      }
    }
    if (s.mount === 'free') {
      const near = Math.min(...room.walls.map((w) => distToSegment(s, w.a, w.b)), s.z - hs.floor, hs.ceiling - s.z);
      if (near < 0.5) add('warn', `${tag}: near a surface`, `${near.toFixed(2)} m from a boundary (AcousticRooms keeps sources ≥ 0.5 m).`);
    }
  }
  for (let i = 0; i < speakers.length; i++)
    for (let j = i + 1; j < speakers.length; j++) {
      const a = speakers[i];
      const b = speakers[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (d < 1) add('info', `${a.role || a.name} / ${b.role || b.name}`, `${d.toFixed(2)} m apart (AcousticRooms spaces sources ≥ 1 m).`);
    }
  for (const s of speakers)
    for (const m of mics) {
      const d = Math.hypot(s.x - m.x, s.y - m.y, s.z - m.z);
      if (d < 0.5) add('warn', `${s.role || s.name} / ${m.name}`, `${d.toFixed(2)} m apart (keep receivers ≥ 0.5 m from sources).`);
    }
  return out;
}
