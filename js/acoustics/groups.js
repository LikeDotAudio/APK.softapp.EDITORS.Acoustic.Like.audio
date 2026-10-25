// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { MIC_PRESETS } from './devices.js';
import { activeSet, HAND_LAYOUT, NO_LAYOUT, setLayout, setOf, SPEAKER_SETS } from './layouts.js';

/**
 * ACOUSTIC GROUPS
 *
 * What a room-acoustics model is made of, in as few groups as there are
 * kinds of input: the ROOM (its shape, height and volume), its SURFACES
 * (α and s, band by band), the SOURCES (the speakers, one branch per speaker
 * set A, B and C, as the monitor controller switches them) and the
 * RECEIVERS (the listeners and the measurement mics). The inspector draws
 * these as one tree; here they are only sorted, so the tree has nothing to
 * decide.
 */

/** The speaker sets that hold any boxes, in A-B-C order: { key, title, preset, live, muted, items } — `preset` null placed by hand, `muted` a set on None. */
export function sourceGroups(speakers, settings) {
  return Object.entries(SPEAKER_SETS)
    .map(([key, set]) => {
      const preset = setLayout(settings, key).preset;
      const muted = preset === NO_LAYOUT;
      return { key, title: set.title, preset: muted || preset === HAND_LAYOUT ? null : preset, live: key === activeSet(settings), muted, items: speakers.filter((s) => setOf(s) === key) };
    })
    .filter((g) => g.items.length);
}

/** The mics, the mix seat first, then the listening tiers in order, then the measurement mics as they were placed. */
export function receiverOrder(mics) {
  const rank = (m) => (m.mix ? 0 : MIC_PRESETS[m.kind]?.tier ?? 99);
  return mics.map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map((x) => x.m);
}
