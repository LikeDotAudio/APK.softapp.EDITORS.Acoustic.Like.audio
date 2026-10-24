// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE NULLS IN A RESPONSE
 *
 * A null is a notch the seat hears and no EQ can fill: a direct sound and a
 * reflection (SBIR, the desk bounce) or two modes arriving out of phase. Read
 * off the curve the way an ear reads it — against its own neighbourhood, not
 * against a fixed line: each point is compared with the curve smoothed over a
 * third of an octave around it (averaged as power, so the notch itself barely
 * pulls the reference down), and a local minimum that sits `depth` dB or more
 * below that is a null. Where two are within a sixth of an octave, the deeper
 * one stands for both; the deepest `max` are kept, in frequency order.
 *
 * Plain data in, plain data out: [{ f, db, depth, lo, hi }] — `lo`…`hi` the
 * span either side where the curve is still more than half the depth down,
 * which is what the graph shades.
 */

export function findNulls(freqs, db, { depth = 6, max = 8, window = 1 / 3 } = {}) {
  const n = freqs.length;
  const ok = (i) => Number.isFinite(db[i]);
  const ref = freqs.map((f, i) => {
    let e = 0;
    let k = 0;
    for (let j = 0; j < n; j++) {
      if (!ok(j) || Math.abs(Math.log2(freqs[j] / f)) > window / 2) continue;
      e += 10 ** (db[j] / 10);
      k++;
    }
    return k ? 10 * Math.log10(e / k) : NaN;
  });
  const found = [];
  for (let i = 1; i < n - 1; i++) {
    if (!ok(i) || !ok(i - 1) || !ok(i + 1)) continue;
    if (db[i] > db[i - 1] || db[i] > db[i + 1]) continue;
    const d = ref[i] - db[i];
    if (!(d >= depth)) continue;
    let a = i;
    while (a > 0 && ok(a - 1) && ref[a - 1] - db[a - 1] > d / 2) a--;
    let b = i;
    while (b < n - 1 && ok(b + 1) && ref[b + 1] - db[b + 1] > d / 2) b++;
    found.push({ f: freqs[i], db: db[i], depth: d, lo: freqs[a], hi: freqs[b] });
  }
  const kept = [];
  for (const x of found.sort((p, q) => q.depth - p.depth)) {
    if (kept.some((k) => Math.abs(Math.log2(k.f / x.f)) < 1 / 6)) continue;
    kept.push(x);
    if (kept.length >= max) break;
  }
  return kept.sort((p, q) => p.f - q.f);
}
