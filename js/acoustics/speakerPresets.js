// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE IMPORT SOURCE, NOT THE PAGE'S SPEAKERS (ROAD-3598 answer 8). These are the boxes Acoustic
 * used to place from; each is now a BIM library part (DATABASE.server.BIM
 * SRC/importers/import_acoustic_speakers.py, via scripts/dump-speaker-presets.mjs), and the page
 * reads speakers from the library only (devices.js, speakerParts.js, speakerLibrary.js). Nothing
 * under js/ imports this file (tests/speakerParts.test.mjs holds that). Edit a box here, then
 * re-run the importer: the library part, its .ifc twin and speakerParts.js follow.
 *
 * Acoustic X rows (js/acoustx/database.js) carry their own figures; the importer reads them from
 * the row and only the label, colour and starting watts from here.
 */
import { ACOUSTX_SPEAKERS } from '../acoustx/database.js';

// First the real boxes, by maker and model — `litres` is the cabinet's internal
// volume (the part's APK_LoudspeakerType.EnclosureVolume, in litres), `driver`
// how it is built, `impedance` the nominal ohms; a figure not read off the
// maker's datasheet is flagged `typical`. Then the generic classes, typical
// datasheet figures each (a passive box's 8 ohm too), the watts chosen so each
// starts at the operating level it always had (94, 118, 120, 100 dB at 1 m):
// `watts` and `color` are the page's own (SPEAKER_LOOK), not the device. The
// first entry is what ＋ Speaker places.
export const SPEAKER_PRESETS = {
  // Tannoy DMT 12 (discontinued): 12" Dual Concentric — the tweeter fires through the woofer's throat, one point source — in a 44 L cabinet.
  // Its datasheet is not to hand: coverage, sensitivity, max SPL and range are a Tannoy 12" Dual Concentric's typical figures.
  dmt12: { label: 'Tannoy DMT 12 · 12" coaxial · 44 L', maker: 'Tannoy', driver: 'coaxial 12"', litres: 44, typical: true, pattern: 'horn', hCov: 90, vCov: 90, sensitivity: 93, watts: 4, maxSpl: 116, fLow: 45, fHigh: 20000, omniBelow: 300, lowpass: 0, impedance: 8, color: '#e0b04a' },
  // Tannoy DMT 8: its 8" Dual Concentric sibling in a 22 L cabinet — the surrounds and heights round a pair of DMT 12s. Typical figures as above.
  dmt8: { label: 'Tannoy DMT 8 · 8" coaxial · 22 L', maker: 'Tannoy', driver: 'coaxial 8"', litres: 22, typical: true, pattern: 'horn', hCov: 90, vCov: 90, sensitivity: 90, watts: 4, maxSpl: 110, fLow: 55, fHigh: 20000, omniBelow: 400, lowpass: 0, impedance: 8, color: '#d4a03c' },
  // the small mono check box: one full-range 4.5" driver, sealed, no bass to speak of — how the mix sounds on a cheap set
  cube: { label: 'Mix cube · 4.5" full-range · 3 L', driver: 'full-range 4.5"', litres: 3, pattern: 'cardioid', hCov: 120, vCov: 120, sensitivity: 86, watts: 5, maxSpl: 104, fLow: 150, fHigh: 15000, omniBelow: 800, lowpass: 0, impedance: 8, color: '#c9c2b0' },
  monitor: { label: 'Studio monitor', litres: 12, pattern: 'cardioid', hCov: 90, vCov: 60, sensitivity: 87, watts: 5, maxSpl: 112, fLow: 45, fHigh: 22000, omniBelow: 300, lowpass: 0, color: '#5aa9ff' },
  'horn-90x50': { label: 'Projection 90×50 horn', litres: 45, pattern: 'horn', hCov: 90, vCov: 50, sensitivity: 104, watts: 25, maxSpl: 133, fLow: 60, fHigh: 18000, omniBelow: 500, lowpass: 0, impedance: 8, color: '#ffb347' },
  'horn-60x40': { label: 'Projection 60×40 horn', litres: 35, pattern: 'horn', hCov: 60, vCov: 40, sensitivity: 107, watts: 20, maxSpl: 135, fLow: 65, fHigh: 18000, omniBelow: 600, lowpass: 0, impedance: 8, color: '#ff8c42' },
  sub: { label: 'Subwoofer', litres: 60, pattern: 'omni', hCov: 360, vCov: 360, sensitivity: 100, watts: 1, maxSpl: 128, fLow: 30, fHigh: 0, omniBelow: 0, lowpass: 100, impedance: 8, color: '#b388ff' },
};

/** The Acoustic X studio reference monitors (Genelec, Dynaudio, Meyer Sound), each under its three keys. */
export const ACOUSTX_SPEAKER_PRESETS = Object.fromEntries(
  ACOUSTX_SPEAKERS.flatMap((s) => {
    const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const preset = {
      label: s.label,
      name: s.name,
      maker: s.maker,
      watts: 4,
      color: s.mainMonitor ? '#e0b04a' : s.midField ? '#38bdf8' : '#5aa9ff',
    };
    return [
      [s.key, preset],
      [slug, preset],
      [s.id, preset],
    ];
  }),
);

export const ALL_SPEAKER_PRESETS = { ...SPEAKER_PRESETS, ...ACOUSTX_SPEAKER_PRESETS };
