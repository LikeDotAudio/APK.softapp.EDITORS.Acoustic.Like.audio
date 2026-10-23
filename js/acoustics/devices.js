// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT YOU CAN PUT IN THE ROOM
 *
 * Two families of loudspeaker, because they are two jobs. A MONITOR reveals
 * the source: near-field, moderate dispersion, the listener inside critical
 * distance so the room is what they do not hear. A PROJECTION box distributes
 * energy: constant-directivity horn, high sensitivity, listeners far beyond
 * critical distance, the pattern doing the work of keeping sound off the walls.
 *
 * `level` is on-axis SPL at 1 m at the operating level — not sensitivity per
 * watt: what this app needs is what arrives, and that is what a designer sets.
 *
 * MOUNTING is the solid angle the box radiates into. Free-standing is 4π.
 * Flush in a wall is 2π, a two-wall corner π, a trihedral corner π/2 — each a
 * further +6 dB of low-frequency pressure. The energy model applies that as a
 * number below `omniBelow`; the wave model gets it from the image sources,
 * which is the same physics done properly, and also why a free-standing box
 * shows its SBIR notch there and a flush one does not.
 */

export const SPEAKER_PRESETS = {
  monitor: { label: 'Studio monitor', pattern: 'cardioid', hCov: 90, vCov: 60, level: 94, omniBelow: 300, lowpass: 0, color: '#5aa9ff' },
  'horn-90x50': { label: 'Projection 90×50 horn', pattern: 'horn', hCov: 90, vCov: 50, level: 118, omniBelow: 500, lowpass: 0, color: '#ffb347' },
  'horn-60x40': { label: 'Projection 60×40 horn', pattern: 'horn', hCov: 60, vCov: 40, level: 120, omniBelow: 600, lowpass: 0, color: '#ff8c42' },
  sub: { label: 'Subwoofer', pattern: 'omni', hCov: 360, vCov: 360, level: 100, omniBelow: 0, lowpass: 100, color: '#b388ff' },
};

export const MIC_PRESETS = {
  omni: { label: 'Measurement mic (omni)', pattern: 'omni' },
  cardioid: { label: 'Cardioid', pattern: 'cardioid' },
  supercardioid: { label: 'Supercardioid', pattern: 'supercardioid' },
  figure8: { label: 'Figure-8', pattern: 'figure8' },
};

export const MOUNTS = {
  free: { label: 'Free-standing (4π)', gainDb: 0 },
  flush: { label: 'Flush / soffit (2π)', gainDb: 6 },
  corner: { label: 'Two-wall corner (π)', gainDb: 12 },
  trihedral: { label: 'Trihedral corner (π/2)', gainDb: 18 },
};

let nextId = 1;
export function newId(prefix) {
  return `${prefix}${Date.now().toString(36)}${(nextId++).toString(36)}`;
}

export function makeSpeaker(kind, at, extra = {}) {
  const p = SPEAKER_PRESETS[kind] ?? SPEAKER_PRESETS.monitor;
  return {
    id: newId('s'),
    name: extra.name ?? p.label,
    kind,
    x: at.x,
    y: at.y,
    z: at.z ?? 1.2,
    aim: 90,
    tilt: 0,
    mount: 'free',
    delayMs: 0,
    pattern: p.pattern,
    hCov: p.hCov,
    vCov: p.vCov,
    level: p.level,
    omniBelow: p.omniBelow,
    lowpass: p.lowpass,
    color: p.color,
    ...extra,
  };
}

export function makeMic(kind, at, extra = {}) {
  const p = MIC_PRESETS[kind] ?? MIC_PRESETS.omni;
  return {
    id: newId('m'),
    name: extra.name ?? p.label,
    kind,
    x: at.x,
    y: at.y,
    z: at.z ?? 1.2,
    aim: 90,
    tilt: 0,
    pattern: p.pattern,
    mix: false,
    ...extra,
  };
}

/** 4th-order low-pass magnitude (a sub's crossover), linear. */
export function lowpassGain(freq, fc) {
  return fc ? 1 / Math.sqrt(1 + (freq / fc) ** 8) : 1;
}
