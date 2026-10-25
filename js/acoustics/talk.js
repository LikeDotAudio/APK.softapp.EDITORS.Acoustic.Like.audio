// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, C } from './bands.js';
import { echogram } from './analysis.js';
import { isListener } from './devices.js';
import { prepare } from './field.js';
import { mtfOfEnergy, stiFromMtf, stiRating } from './intelligibility.js';

/**
 * EVERY PERSON SPEAKS, EVERY PERSON HEARS
 *
 * On a set, a panel or round a console the people talk to each other, and
 * the room decides how well. Each person in the room (a listener tier, or the
 * mix seat) is taken in turn as a TALKER — a mouth at their ears' height,
 * facing the way they face — and every other person as an ear:
 *
 *   ECHOGRAM  per octave band, the image sources of the talker's mouth and
 *             the diffuse tail (analysis.js echogram), heard by the other
 *             person as their seat hears a speaker.
 *   STI       from that echogram by Schroeder's formula (intelligibility.js
 *             mtfOfEnergy → stiFromMtf): direct sound, reflections and tail,
 *             so a neighbour is understood better than the far end of the
 *             desk. No background noise and no auditory masking — the
 *             room's share of it only; a quiet set's figure.
 *   MOUTH     a design figure, not a measurement: subcardioid (−3 dB to the
 *             side, −8 dB behind), the shape a talker's voice roughly takes
 *             in the 1–2 kHz octaves that carry the consonants, gone to omni
 *             an octave under 500 Hz. Levels are re 1 m in front of the mouth,
 *             so no speech level is assumed: without noise, STI needs none.
 *
 * Both ways round: A heard by B is not B heard by A when they do not face
 * each other.
 */

export const MOUTH = { pattern: 'subcardioid', omniBelow: 500, drive: 'spl', level: 0 };

/** The people who talk and listen: listener tiers and the mix seat. */
export const talkers = (mics) => mics.filter((m) => isListener(m) || m.mix);

/** A person as a source: their mouth where their ears are, facing their way. */
export function mouthOf(p) {
  return { ...MOUTH, id: `mouth-${p.id}`, name: p.name, x: p.x, y: p.y, z: p.z ?? 1.2, aim: p.aim ?? 90, tilt: 0 };
}

/**
 * Every ordered pair of `people`: [{ from, to, r, delayMs, db, sti, rating }]
 * — r the distance (m), delayMs the direct sound's time, db its level at the
 * ear re 1 m in front of the mouth (1 kHz octave), sti and its IEC rating.
 */
export function talkPaths(room, people, { maxOrder = 2 } = {}) {
  const out = [];
  for (const a of people) {
    const prep = prepare(room, [mouthOf(a)], { maxOrder });
    for (const b of people) {
      if (b === a) continue;
      const egs = BANDS.map((_, k) => echogram(room, prep, b, k));
      const sti = stiFromMtf(egs.map((eg) => mtfOfEnergy(eg.bins, eg.dt)));
      const r = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 1.2) - (a.z ?? 1.2));
      const direct = egs[3].arrivals.find((x) => x.order === 0);
      out.push({ from: a.id, to: b.id, r, delayMs: (r / C) * 1000, db: direct?.level ?? -Infinity, sti, rating: stiRating(sti) });
    }
  }
  return out;
}

/** The worst pair: who is hardest to understand, and by whom. */
export const worstPath = (paths) => paths.reduce((w, p) => (!w || p.sti < w.sti ? p : w), null);
