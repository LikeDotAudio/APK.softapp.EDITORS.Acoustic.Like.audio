// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, C } from './bands.js';
import { heightsAtXY } from './elevations.js';
import { responseGain, sourceDb, speakerLevel } from './devices.js';
import { distToSegment } from './geometry.js';
import { criticalDistance, echogram, flutterRisk, lateralFraction, reflectionFreeZone, SPLAY_CURE_DEG } from './analysis.js';
import { cachedQ, prepare } from './field.js';
import { lowHouseLeak, sharedFaces } from './isolation.js';
import { CARPET_UNDERLAY, depthOfId, isPorousAbsorber, lookup, MIN_ABSORBER_DEPTH, ratedLow } from './materials.js';
import { axialModes, inFrame, nullFractions, schroeder } from './room.js';
import { frame } from './patterns.js';
import { diffuserBand, finishAt, firstReflections, wallBehind } from './reflectionPanels.js';

/**
 * THE ADVISOR
 *
 * Rules of room design, each checked against the drawing as it stands rather
 * than recited. Every finding is { level: ok | warn | info, title, detail }.
 *
 *   38 % rule      ears (not speakers) 38 % of the length from the front wall,
 *                  clear of the modal null fractions (2k − 1)/2n of the
 *                  length and the height for n ≤ 4; and 50 % across. The
 *                  width is not tested against its nulls: its centre IS the
 *                  null of every odd width mode, a price paid for left–right
 *                  symmetry.
 *   ear height     38–42 % of the ceiling, never its 50 % null.
 *   acoustic axis  each monitor aimed at the ears; the woofer not at 50 % H.
 *   critical dist. a monitor's listener inside R_c (the room unheard); a
 *                  projection box's audience may be far beyond it.
 *   SBIR           a free-standing box d from the wall behind it notches at
 *                  c / 4d; flush mounting removes it.
 *   console bounce the mirror laid on the desk: where a box's tweeter is seen
 *                  in the top of a console or desk from the ears, its bounce
 *                  arrives Δt late and combs the response — notches at
 *                  (2k − 1) / 2Δt, the first in the low mids when the top is
 *                  this close (the desk effect). Warned at −10 dB or louder.
 *   spacing        AcousticRooms' sampling rules: sources ≥ 0.5 m from any
 *                  surface, ≥ 1 m apart, ≥ 0.5 m from a receiver.
 *   flutter        parallel facing surfaces that keep most of a specular
 *                  round trip at 500 Hz–1 kHz (analysis.js flutterRisk);
 *                  a splay of 1 in 20 or more cures a pair.
 *
 * And the treatment criteria of the room-acoustics literature
 * (Documentation/acoustics/15-advisor.md §15.4):
 *
 *   front wall     behind each free-standing box, absorbent at 500 Hz — its
 *                  rear radiation otherwise comes straight back.
 *   bass traps     below 100 Hz only absorbers rated there work; a thin
 *                  porous panel in a corner is not a bass trap.
 *   thickness      a porous absorber thinner than 76 mm takes the top and
 *                  leaves the low mids.
 *   balance        a treated room that only absorbs sounds dead: some of the
 *                  treatment should scatter.
 *   diffuser band  side-wall diffusers from 305 mm under the ears to 914 mm
 *                  over them.
 *   floor          wall-to-wall clipped-pile carpet on 1.36 kg/m² felt.
 *   directivity    the box's directivity index steady over 1–4 kHz, so its
 *                  reflections sound like it; the seat's lateral energy
 *                  fraction (LF, the measure of apparent source width).
 *   RFZ            no reflection within 20 ms louder than −20 dB at the seat.
 *   sub isolation  31 and 63 Hz through every shared wall, where a single-
 *                  number rating says nothing.
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
    const lv = speakerLevel(s);
    if (lv.limited) add('warn', `${tag}: past max SPL`, `${s.watts} W asks ${lv.demand.toFixed(1)} dB at 1 m; the box limits at ${s.maxSpl} dB, ${(-lv.headroom).toFixed(1)} dB short — lower the amplifier or pick a louder box.`);
    else if (lv.headroom < 3) add('info', `${tag}: little headroom`, `${lv.level.toFixed(1)} dB at 1 m, ${lv.headroom.toFixed(1)} dB under max SPL — peaks above the average will limit.`);
    const rg = 20 * Math.log10(Math.max(responseGain(BANDS[band], { ...s, lowpass: 0 }), 1e-12));
    if (rg < -10) add('info', `${tag}: outside its range`, `${BANDS[band]} Hz is ${(-rg).toFixed(0)} dB down on this box (range ${s.fLow || '—'}–${s.fHigh || '—'} Hz).`);
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
  if (mix)
    for (const r of firstReflections(room, speakers, mix, band)) {
      if (r.surface !== 'console') continue;
      const notch = 1000 / (2 * r.delayMs);
      add(
        r.db > -10 ? 'warn' : 'info',
        `${r.name}: console bounce`,
        `The box is seen in the ${r.hit.z.toFixed(2)} m top ${r.delayMs.toFixed(2)} ms late at ${r.db.toFixed(1)} dB @ ${BANDS[band]} Hz → comb notches at ${notch.toFixed(0)} Hz and every ${(2 * notch).toFixed(0)} Hz above${notch < 400 ? ' (the desk dip in the low mids)' : ''}. Raise or tilt the box so the spot falls past the desk's front edge, slope the meter bridge away, or pad the spot.`,
      );
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
  treatment(room, speakers, mix, settings, add);
  return out;
}

const mmOf = (m) => `${Math.round(m * 1000)} mm`;

/** The treatment criteria (see the header), added to the advice through `add`. */
function treatment(room, speakers, mix, settings, add) {
  const mains = speakers.filter((s) => s.kind !== 'sub');
  const subs = speakers.filter((s) => s.kind === 'sub');
  const pieces = room.patches ?? [];

  // the wall behind each free-standing box
  for (const s of mains) {
    if ((s.mount ?? 'free') !== 'free') continue;
    const back = wallBehind(room, s);
    if (!back) continue;
    const { material: mat } = finishAt(room, back.wall, back.at, s.z);
    const a = mat.alpha[2];
    const ms = ((2 * back.d) / C) * 1000;
    add(
      a >= 0.5 ? 'ok' : 'warn',
      `${s.role || s.name}: wall behind`,
      a >= 0.5
        ? `${mat.name} behind it (α500 ${a.toFixed(2)}): its rear radiation is taken up.`
        : `${mat.name} behind it keeps ${((1 - a) * 100).toFixed(0)} % at 500 Hz: what the box sends backwards — a dipole's whole back lobe, any box's bass and low mids — returns ${ms.toFixed(1)} ms after it, smearing the image and colouring it. Absorb the ${back.wall.face} wall there, ${mmOf(MIN_ABSORBER_DEPTH)} or deeper.`,
    );
  }

  // what absorbs below 100 Hz, and corner foam
  const f1 = axialModes(room, 1)[0]?.f ?? Infinity;
  const used = [...pieces.map((p) => p.material), ...room.surfaces.map((x) => lookup(x.material.base)).filter(Boolean)];
  if (f1 < 100 && !used.some(ratedLow))
    add('info', 'Nothing rated below 125 Hz', `The lowest mode is ${f1.toFixed(0)} Hz and no finish or product here carries its own 31 and 63 Hz absorption. Below about 100 Hz only engineered absorbers work — membrane, Helmholtz, deep porous traps — and only their measured figures say how much; they go where the modal map is brightest.`);
  const thin = new Map();
  for (const p of pieces) {
    if (!isPorousAbsorber(p.material)) continue;
    const depth = depthOfId(p.paletteId);
    if (depth == null || depth >= MIN_ABSORBER_DEPTH - 1e-9) continue;
    const corner = p.surface === 'wall' && p.points3d.some((q) => {
      const w = room.walls[p.wall];
      const u = (q.x - w.a.x) * w.t.x + (q.y - w.a.y) * w.t.y;
      return u < 0.3 || u > w.len - 0.3;
    });
    const k = thin.get(p.paletteId) ?? { name: p.material.name, depth, count: 0, corner: false };
    k.count++;
    k.corner ||= corner;
    thin.set(p.paletteId, k);
  }
  for (const [id, k] of thin) {
    add('warn', `Thin absorber: ${id}`, `${k.count} × ${k.name}, ${mmOf(k.depth)} deep. A porous absorber under ${mmOf(MIN_ABSORBER_DEPTH)} takes the top octaves and leaves the low mids, so the room goes dull rather than controlled — use ${mmOf(0.1)}, or a gap behind it.`);
    if (k.corner) add('warn', `Corner foam is not a bass trap`, `${k.name} sits in a corner, where the bass pressure is — but at ${mmOf(k.depth)} it does nothing there below a few hundred Hz. A corner wants a trap rated at 63 Hz.`);
  }

  // absorption against diffusion, at 1 kHz
  let absorbs = 0;
  let scatters = 0;
  for (const p of pieces) {
    absorbs += p.area * p.material.alpha[3];
    if (p.material.scatter[3] >= 0.5) scatters += p.area * (1 - p.material.alpha[3]) * p.material.scatter[3];
  }
  if (absorbs > 0 && room.perBand[3].abar > 0.3) {
    const share = scatters / (absorbs + scatters);
    add(share >= 0.1 ? 'ok' : 'warn', 'Absorption and diffusion', share >= 0.1 ? `${(share * 100).toFixed(0)} % of the treatment's work at 1 kHz is scattering: the room is controlled and still alive.` : `The treatment only absorbs (mean α ${room.perBand[3].abar.toFixed(2)} at 1 kHz, ${(share * 100).toFixed(0)} % scattered). A room treated by absorption alone sounds dead; mix reflection, absorption and diffusion — diffusers on the rear and side walls.`);
  }

  // the floor
  if (room.floor.alpha[2] < 0.3) add('info', 'Hard floor', `The floor keeps ${((1 - room.floor.alpha[2]) * 100).toFixed(0)} % at 500 Hz. The listening-room criterion is wall-to-wall clipped-pile carpet on ${CARPET_UNDERLAY} kg/m² felt (the carpet-felt finish) — or a rug under the floor bounce at least.`);

  if (mix) {
    // side-wall diffusers in their band
    const band = diffuserBand(room, mix);
    for (const p of pieces) {
      if (p.surface !== 'wall' || (p.face !== 'left' && p.face !== 'right') || p.material.category !== 'Diffuser') continue;
      const zs = p.points3d.map((q) => q.z);
      const lo = Math.min(...zs);
      const hi = Math.max(...zs);
      const inside = Math.max(0, Math.min(hi, band.hi) - Math.max(lo, band.lo)) / Math.max(hi - lo, 1e-9);
      if (inside < 0.5) add('warn', `Diffuser off its band: ${p.id}`, `On the ${p.face} wall from ${mmOf(lo)} to ${mmOf(hi)}; side-wall diffusers belong from ${mmOf(band.lo)} to ${mmOf(band.hi)} — 305 mm under the ears to 914 mm over them.`);
    }

    // directivity, spaciousness and the reflection-free zone
    for (const s of mains) {
      const di = [1000, 2000, 4000].map((f) => 10 * Math.log10(cachedQ(s, f)));
      const spread = Math.max(...di) - Math.min(...di);
      add(spread <= 3 ? 'ok' : spread <= 6 ? 'info' : 'warn', `${s.role || s.name}: directivity`, `DI ${di.map((d) => d.toFixed(1)).join(' / ')} dB at 1 / 2 / 4 kHz, ${spread.toFixed(1)} dB apart. ${spread <= 3 ? 'Near constant: its reflections sound like the box, which lets a wide box widen the image without colouring it.' : 'Its reflections are a different colour from its direct sound — a wide, constant-directivity box, or a narrow horn that keeps energy off the side walls, avoids that.'}`);
    }
    if (mains.length) {
      const prep = prepare(room, mains, { maxOrder: Math.min(3, settings.maxOrder ?? 3) });
      const eg = echogram(room, prep, mix, 3);
      const lf = lateralFraction(eg, mix);
      if (Number.isFinite(lf)) add('info', 'Spaciousness (LF)', `Lateral energy fraction ${lf.toFixed(2)} at 1 kHz (ISO 3382-1, 5–80 ms against 0–80 ms): the measure apparent source width follows. Side reflections raise it; absorbing them for an RFZ lowers it.`);
      const rfz = reflectionFreeZone(eg);
      if (rfz.worst) {
        const who = speakers.find((x) => x.id === rfz.worst.speaker);
        add(rfz.ok ? 'ok' : 'warn', 'Reflection-free zone', rfz.ok ? `Nothing within 20 ms of the direct sound louder than −20 dB at the seat (the loudest ${rfz.worst.db.toFixed(1)} dB).` : `${rfz.count} reflection${rfz.count === 1 ? '' : 's'} within 20 ms louder than −20 dB at the seat — the worst ${rfz.worst.db.toFixed(1)} dB, order ${rfz.worst.order}, ${rfz.worst.delayMs.toFixed(1)} ms after ${who?.role || who?.name || 'its box'}. Absorb its spot, or splay the wall it comes off (1 in 20 to 1 in 10, ${SPLAY_CURE_DEG.toFixed(1)}–5.7°).`);
      }
    }
  }

  // several subs, and what they put through the house
  if (subs.length > 1) add('info', `${subs.length} subwoofers`, 'Set their delay, gain and polarity together (Subs → Tune the subs together): their modes can cancel across the seats, which no one position and no EQ can do.');
  const iso = settings.isolation ?? {};
  if (subs.length && sharedFaces({ setting: 'detached', ...iso }).length) {
    const R = room.perBand[0].R;
    const lw = (f) => 10 * Math.log10(subs.reduce((e, s) => e + 10 ** ((sourceDb(s, f) + 11 + 10 * Math.log10(4 / R)) / 10), 0));
    for (const r of lowHouseLeak(room, { walls: 'unset', floor: 'slab', ...iso }, [lw(31), lw(63)]))
      add(r.leak[1] > 45 ? 'warn' : 'info', `Sub through the ${r.face} wall`, `TL ${r.tl[0].toFixed(0)} dB at 31 Hz, ${r.tl[1].toFixed(0)} dB at 63 Hz (the 125 Hz figure down the mass law — at best) → about ${r.leak[0].toFixed(0)} / ${r.leak[1].toFixed(0)} dB in the house. A single-number rating does not cover these bands.`);
  }
}
