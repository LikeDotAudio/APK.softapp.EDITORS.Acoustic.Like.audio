// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, toDb, toEnergy } from './bands.js';
import { energyAt, prepare } from './field.js';
import { arrangedSpeakers } from './layouts.js';

/**
 * THE MONITOR CONTROLLER
 *
 * What a studio's monitor controller does between the desk and the boxes,
 * done to the speakers the room hears. The speaker set (A, B, C — layouts.js
 * SPEAKER_SETS) picks which boxes are wired; then
 *
 *   volume, dim     one gain on every channel, dB; dim drops it by dimDb
 *   mute            the master cut: nothing sounds
 *   per channel     mute, solo (any soloed: only those sound), polarity Ø
 *                   and a trim, dB — kept on the speaker (`mute`, `solo`,
 *                   `invert`, `trimDb`), so a twin's channel is its own
 *
 * A muted box still stands in the room and in the drawings; it just does
 * not drive the field. The gain reaches the field as the speaker's `gainDb`
 * (devices.js speakerLevel, under its max SPL), polarity as `invert` (the
 * wave and modal sums flip its pressure; energy knows no sign).
 *
 * THE NOISE GENERATOR. White, pink or brown noise at the speaker's level:
 * its power shared out over the octave bands — white rising 3 dB an octave
 * (equal per hertz), pink flat (equal per octave), brown falling 3 dB — so
 * the whole band sums to the box's level. noiseSpl reads what a meter at a
 * point would show for it, Z-weighted over the 125 Hz – 4 kHz octaves the
 * energy method knows (C-weighting differs by under a dB there), direct
 * plus the diffuse field. calibrate() trims each channel to a target the way
 * a room is lined up: each speaker alone, pink noise, the meter at the seat.
 */

export const NOISES = {
  white: { label: 'White', title: 'Equal energy per hertz: +3 dB an octave — hiss', perOctave: 2 },
  pink: { label: 'Pink', title: 'Equal energy per octave — the calibration noise', perOctave: 1 },
  brown: { label: 'Brown', title: 'Falls 6 dB an octave per hertz — a rumble', perOctave: 0.5 },
};

export const DEFAULT_MONITOR = { volumeDb: 0, dim: false, dimDb: -20, mute: false, noise: 'pink', calDb: 79 };

/** The controller's settings, defaults filled in. */
export const monitorOf = (settings) => ({ ...DEFAULT_MONITOR, ...settings.monitor });

/** The master gain, dB: volume, less the dim when it is down. */
export const masterDb = (m) => m.volumeDb + (m.dim ? m.dimDb : 0);

/**
 * The speakers the controller lets through to the room: the selected set's
 * arrangement, none under the master mute, only the soloed ones when any
 * is, never a muted one — each carrying its gain (master + trim) and polarity.
 */
export function monitoredSpeakers(speakers, settings) {
  const m = monitorOf(settings);
  if (m.mute) return [];
  const set = arrangedSpeakers(speakers, settings);
  const soloed = set.filter((s) => s.solo);
  return (soloed.length ? soloed : set)
    .filter((s) => !s.mute)
    .map((s) => {
      const gainDb = masterDb(m) + (s.trimDb ?? 0);
      return gainDb ? { ...s, gainDb } : s;
    });
}

/** Each octave band's share of the noise's power, summing to 1. */
export function noiseShares(noise) {
  const k = NOISES[noise]?.perOctave ?? 1;
  const raw = BANDS.map((_, b) => k ** b);
  const sum = raw.reduce((a, v) => a + v, 0);
  return raw.map((v) => v / sum);
}

/** What a meter at `pt` reads, dB, for `noise` through `speakers` (already monitored): -Infinity when none sound. */
export function noiseSpl(room, speakers, pt, noise) {
  if (!room?.perBand || !speakers.length) return -Infinity;
  const prep = prepare(room, speakers, { maxOrder: 0 });
  const shares = noiseShares(noise);
  return toDb(BANDS.reduce((e, _, b) => e + shares[b] * toEnergy(energyAt(room, prep, pt, b).total), 0));
}

/**
 * Each channel of the selected set on its own at `pt`, as the calibration
 * reads them — through the volume and its trim, whatever is muted or soloed:
 * [{ id, db }].
 */
export function channelLevels(room, speakers, settings, pt, noise = monitorOf(settings).noise) {
  const m = monitorOf(settings);
  return arrangedSpeakers(speakers, settings).map((s) => ({ id: s.id, db: noiseSpl(room, [{ ...s, gainDb: masterDb(m) + (s.trimDb ?? 0) }], pt, noise) }));
}

/** The trims that bring every channel read to `target` dB: [{ id, trimDb }], to a tenth. */
export function calibrate(levels, speakers, target) {
  const byId = new Map(speakers.map((s) => [s.id, s]));
  return levels.filter((l) => Number.isFinite(l.db)).map((l) => ({ id: l.id, trimDb: +((byId.get(l.id)?.trimDb ?? 0) + target - l.db).toFixed(1) }));
}
