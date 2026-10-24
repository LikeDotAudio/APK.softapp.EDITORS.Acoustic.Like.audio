// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The six octave bands every number in this app is computed per, and the
 * physical constants they share. One index means one band everywhere:
 * material α, air loss, RT60 and the heatmap all read `BANDS[i]`.
 */

export const BANDS = [125, 250, 500, 1000, 2000, 4000];
export const BAND_LABELS = ['125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz'];

/** Extended 9-band octave series (31 Hz … 8 kHz) from classic room acoustic databases. */
export const BANDS_9 = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000];
export const BAND_LABELS_9 = ['31 Hz', '63 Hz', '125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz', '8 kHz'];

/** Speed of sound, m/s, at about 20 °C. */
export const C = 343;

/** Air attenuation in dB per metre at 20 °C, 50 % RH (ISO 9613-1, rounded). */
export const AIR_DB_PER_M = [0.00044, 0.0013, 0.0027, 0.005, 0.009, 0.0229];

/** Air attenuation across all 9 octave bands (ISO 9613-1). */
export const AIR_DB_PER_M_9 = [0.00003, 0.00011, 0.00044, 0.0013, 0.0027, 0.005, 0.009, 0.0229, 0.0766];

/** The same loss as an intensity coefficient m (1/m), the form Sabine and Eyring take. */
export function airM(band) {
  return AIR_DB_PER_M[band] / (10 * Math.LOG10E);
}

export function airM9(band) {
  return (AIR_DB_PER_M_9[band] ?? 0.005) / (10 * Math.LOG10E);
}

/** 1/3-octave frequency bands (16 Hz … 500 Hz) with limits and A-weighting offset. */
export const FREQ_3RD = [
  { id: '1', center: 16, lower: 14.1, upper: 17.8, bandwidth: 3.7, dbA: 56.7 },
  { id: '2', center: 20, lower: 17.8, upper: 22.4, bandwidth: 4.6, dbA: 50.5 },
  { id: '3', center: 25, lower: 22.4, upper: 28.2, bandwidth: 5.8, dbA: 44.7 },
  { id: '4', center: 31.5, lower: 28.2, upper: 35.5, bandwidth: 7.3, dbA: 39.4 },
  { id: '5', center: 40, lower: 35.5, upper: 44.7, bandwidth: 9.2, dbA: 34.6 },
  { id: '6', center: 50, lower: 44.7, upper: 56.2, bandwidth: 11.5, dbA: 30.2 },
  { id: '7', center: 63, lower: 56.2, upper: 70.7, bandwidth: 14.5, dbA: 26.2 },
  { id: '8', center: 80, lower: 70.7, upper: 89.1, bandwidth: 18.4, dbA: 22.5 },
  { id: '9', center: 100, lower: 89.1, upper: 112, bandwidth: 22.9, dbA: 19.1 },
  { id: '10', center: 125, lower: 112, upper: 141, bandwidth: 29, dbA: 16.1 },
  { id: '11', center: 160, lower: 141, upper: 178, bandwidth: 37, dbA: 13.4 },
  { id: '12', center: 200, lower: 178, upper: 224, bandwidth: 46, dbA: 10.9 },
  { id: '13', center: 250, lower: 224, upper: 282, bandwidth: 58, dbA: 8.6 },
  { id: '14', center: 315, lower: 282, upper: 355, bandwidth: 73, dbA: 6.6 },
  { id: '15', center: 400, lower: 355, upper: 447, bandwidth: 92, dbA: 4.8 },
  { id: '16', center: 500, lower: 447, upper: 562, bandwidth: 115, dbA: 3.2 },
];

/** 1/1-octave frequency bands (16 Hz … 1 kHz) with limits and A-weighting offset. */
export const FREQ_OCTAVE = [
  { id: '1', center: 16, lower: 11, upper: 22, bandwidth: 11, dbA: 56.7 },
  { id: '2', center: 31.5, lower: 22, upper: 44, bandwidth: 22, dbA: 39.4 },
  { id: '3', center: 63, lower: 44, upper: 88, bandwidth: 44, dbA: 26.2 },
  { id: '4', center: 125, lower: 88, upper: 177, bandwidth: 89, dbA: 16.1 },
  { id: '5', center: 250, lower: 177, upper: 355, bandwidth: 178, dbA: 8.6 },
  { id: '6', center: 500, lower: 355, upper: 710, bandwidth: 355, dbA: 3.2 },
  { id: '7', center: 1000, lower: 710, upper: 1420, bandwidth: 710, dbA: 0 },
];

export function dbSum(levels) {
  let e = 0;
  for (const l of levels) if (Number.isFinite(l)) e += 10 ** (l / 10);
  return e > 0 ? 10 * Math.log10(e) : -Infinity;
}

export const toEnergy = (db) => (Number.isFinite(db) ? 10 ** (db / 10) : 0);
export const toDb = (e) => (e > 0 ? 10 * Math.log10(e) : -Infinity);
