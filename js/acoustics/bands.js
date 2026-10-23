// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The six octave bands every number in this app is computed per, and the
 * physical constants they share. One index means one band everywhere:
 * material α, air loss, RT60 and the heatmap all read `BANDS[i]`.
 */

export const BANDS = [125, 250, 500, 1000, 2000, 4000];
export const BAND_LABELS = ['125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz'];

/** Speed of sound, m/s, at about 20 °C. */
export const C = 343;

/** Air attenuation in dB per metre at 20 °C, 50 % RH (ISO 9613-1, rounded). */
export const AIR_DB_PER_M = [0.00044, 0.0013, 0.0027, 0.005, 0.009, 0.0229];

/** The same loss as an intensity coefficient m (1/m), the form Sabine and Eyring take. */
export function airM(band) {
  return AIR_DB_PER_M[band] / (10 * Math.LOG10E);
}

export function dbSum(levels) {
  let e = 0;
  for (const l of levels) if (Number.isFinite(l)) e += 10 ** (l / 10);
  return e > 0 ? 10 * Math.log10(e) : -Infinity;
}

export const toEnergy = (db) => (Number.isFinite(db) ? 10 ** (db / 10) : 0);
export const toDb = (e) => (e > 0 ? 10 * Math.log10(e) : -Infinity);
