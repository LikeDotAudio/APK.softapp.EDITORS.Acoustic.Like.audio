// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { boxSize } from '../acoustics/devices.js';
import { FIRST_ORDER, frame, patternWeight, shapeGain } from '../acoustics/patterns.js';
import { h } from '../ui/dom.js';

/**
 * WHAT A TRANSDUCER LOOKS LIKE AND HOW IT THROWS
 *
 * A speaker drawn face-on, to scale in mm, with the drivers it is made of; its
 * coverage seen from above and from the side, as the engine computes it
 * (patterns.js), the full pattern solid and the pattern half gone at
 * `omniBelow` dashed; and the band each driver plays, crossovers marked.
 *
 * The drivers come from what the speaker says: a coaxial `driver` is one
 * source, a sub one big cone, a horn a mouth over a woofer, and a crossover
 * low enough to be a woofer-to-mid one (under 1 kHz, as the Acoustic X main
 * monitors carry) makes it three-way. Where the data gives the woofer's and
 * the acoustic centre's heights they are used; anything assumed is marked ≈.
 */

const TYPICAL_TWEETER_X = 3000;
const TYPICAL_TWO_WAY_X = 2000;
const TYPICAL_HORN_X = 1200;
const F_MIN = 20;
const F_MAX = 20000;

export const DRIVER_COLOURS = { woofer: '#60a5fa', mid: '#4ade80', tweeter: '#f472b6', horn: '#f59e0b', coax: '#f59e0b' };

/** Inches out of a driver string ('coaxial 12"'), else null. */
const inches = (s) => {
  const m = /(\d+(?:\.\d+)?)\s*"/.exec(s ?? '');
  return m ? +m[1] : null;
};

/**
 * The drivers of a speaker, bottom up: [{ role, y, d, w?, h?, lo, hi, assumed }]
 * — `y` the centre's height and `d` the diameter (a horn: `w` × `h` mouth),
 * metres; `lo`…`hi` the band it plays, Hz. Also `ways` and `crossovers`.
 */
export function driversOf(spk) {
  const box = boxSize(spk);
  const lo = spk.fLow || F_MIN;
  const hi = spk.fHigh || (spk.kind === 'sub' ? spk.lowpass || 120 : F_MAX);
  const W = box.w;
  const H = box.h;
  const cone = (want, room) => Math.max(0.02, Math.min(want ?? Infinity, W * 0.82, room));
  const coax = /coax|concentric/i.test(spk.driver ?? '');
  const x = spk.fCross || 0;

  if (spk.kind === 'sub' || spk.pattern === 'omni' && hi <= 300) {
    const d = cone(inches(spk.driver) && inches(spk.driver) * 0.0254, H * 0.82);
    return { box, ways: 1, crossovers: [], drivers: [{ role: 'woofer', y: H / 2, d, lo, hi, assumed: false }] };
  }
  if (coax) {
    const d = cone(inches(spk.driver) && inches(spk.driver) * 0.0254, H * 0.8);
    const y = spk.centerHeight || H * 0.6;
    const xo = x || TYPICAL_HORN_X;
    return {
      box,
      ways: 2,
      crossovers: [{ f: xo, assumed: !x }],
      drivers: [
        { role: 'woofer', y, d, lo, hi: xo, assumed: false },
        { role: 'coax', y, d: d * 0.32, lo: xo, hi, assumed: false },
      ],
    };
  }
  if (spk.pattern === 'horn') {
    const mw = W * 0.8;
    const mh = Math.min(H * 0.4, (mw * Math.max(spk.vCov || 60, 10)) / Math.max(spk.hCov || 90, 10));
    const top = H - 0.04 - mh / 2;
    const xo = x || TYPICAL_HORN_X;
    const d = cone(null, top - mh / 2 - 0.04);
    return {
      box,
      ways: 2,
      crossovers: [{ f: xo, assumed: !x }],
      drivers: [
        { role: 'woofer', y: Math.max(d / 2 + 0.03, (top - mh / 2) / 2), d, lo, hi: xo, assumed: false },
        { role: 'horn', y: top, d: Math.min(mw, mh), w: mw, h: mh, lo: xo, hi, assumed: false },
      ],
    };
  }
  const tweetY = spk.centerHeight && spk.centerHeight > H * 0.5 ? spk.centerHeight : H * 0.8;
  if (x && x < 1000) {
    // three-way: the crossover we know is woofer → mid; the mid → tweeter one is typical
    const wd = cone(null, H * 0.42);
    const wy = spk.wooferHeight || wd / 2 + 0.03;
    const md = cone(W * 0.4, (tweetY - (wy + wd / 2)) * 0.9);
    const my = (wy + wd / 2 + tweetY) / 2 - 0.01;
    return {
      box,
      ways: 3,
      crossovers: [{ f: x, assumed: false }, { f: TYPICAL_TWEETER_X, assumed: true }],
      drivers: [
        { role: 'woofer', y: wy, d: wd, lo, hi: x, assumed: !spk.wooferHeight },
        { role: 'mid', y: my, d: md, lo: x, hi: TYPICAL_TWEETER_X, assumed: true },
        { role: 'tweeter', y: tweetY, d: 0.028, lo: TYPICAL_TWEETER_X, hi, assumed: !spk.centerHeight },
      ],
    };
  }
  const xo = x || TYPICAL_TWO_WAY_X;
  const wd = cone(null, (tweetY - 0.035) * 0.95);
  const wy = spk.wooferHeight || Math.max(wd / 2 + 0.02, tweetY - 0.035 - wd / 2);
  return {
    box,
    ways: 2,
    crossovers: [{ f: xo, assumed: !x }],
    drivers: [
      { role: 'woofer', y: wy, d: wd, lo, hi: xo, assumed: !spk.wooferHeight },
      { role: 'tweeter', y: tweetY, d: 0.028, lo: xo, hi, assumed: !spk.centerHeight },
    ],
  };
}

/**
 * A pattern's gain round a plane, every `step`°: [{ deg, db }], 0° on axis.
 * 'h' sweeps left–right, 'v' down–up; `freq` sets how much of the pattern is left.
 */
export function polarOf(dev, plane, freq, step = 2) {
  const fr = frame(0, 0);
  const out = [];
  for (let deg = -180; deg <= 180; deg += step) {
    const t = (deg * Math.PI) / 180;
    const dir = plane === 'h' ? [Math.cos(t), -Math.sin(t), 0] : [Math.cos(t), 0, Math.sin(t)];
    out.push({ deg, db: shapeGain(dev.pattern, fr, dir, dev.hCov, dev.vCov) * patternWeight(freq, dev.omniBelow) });
  }
  return out;
}

const SVG = 'http://www.w3.org/2000/svg';
const svg = (viewBox, body, cls = '') => {
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('class', cls);
  el.innerHTML = body;
  return el;
};
const kHz = (f) => (f >= 1000 ? `${+(f / 1000).toFixed(1)} k` : `${Math.round(f)} `) + 'Hz';

/** One polar plot: rings every 6 dB to −30, forward up, the full pattern solid, the low one dashed. */
function polarSvg(dev, plane, colour) {
  const R = 100;
  const rOf = (db) => (R * Math.max(0, 30 + db)) / 30;
  const path = (pts) =>
    pts
      .map((p, i) => {
        const t = (p.deg * Math.PI) / 180;
        const r = rOf(p.db);
        return `${i ? 'L' : 'M'}${(r * Math.sin(t)).toFixed(1)} ${(-r * Math.cos(t)).toFixed(1)}`;
      })
      .join('') + 'Z';
  const hiF = dev.omniBelow ? dev.omniBelow * 4 : 1000;
  const cov = plane === 'h' ? dev.hCov : dev.vCov;
  let body = '';
  for (const db of [0, -6, -12, -18, -24]) body += `<circle r="${rOf(db)}" class="ring${db === -6 ? ' six' : ''}"/>`;
  body += `<line x1="0" y1="${-R}" x2="0" y2="${R}" class="ring"/><line x1="${-R}" y1="0" x2="${R}" y2="0" class="ring"/>`;
  if (dev.pattern === 'horn' && cov < 360) {
    for (const s of [-1, 1]) {
      const t = (s * cov * Math.PI) / 360;
      body += `<line x1="0" y1="0" x2="${(R * Math.sin(t)).toFixed(1)}" y2="${(-R * Math.cos(t)).toFixed(1)}" class="cov"/>`;
    }
    body += `<text x="0" y="${-R - 6}" class="t mid">${cov}° at −6 dB</text>`;
  }
  if (dev.omniBelow) body += `<path d="${path(polarOf(dev, plane, dev.omniBelow))}" class="lo"/>`;
  body += `<path d="${path(polarOf(dev, plane, hiF))}" class="hi" style="stroke:${colour};fill:${colour}"/>`;
  body += `<text x="${-R}" y="${R + 14}" class="t">${plane === 'h' ? 'From above' : 'From the side'}</text>`;
  const legend = dev.omniBelow ? `${kHz(hiF)}+ · <tspan class="dash">╌ ${kHz(dev.omniBelow)}</tspan>` : 'every band';
  body += `<text x="${R}" y="${R + 14}" class="t end">${legend}</text>`;
  return svg(`${-R - 12} ${-R - 16} ${2 * R + 24} ${2 * R + 36}`, body, 'tx-polar');
}

/** The speaker face-on, to scale in mm, every driver where it sits, the box's size written on it. */
function faceSvg(spk, { box, drivers }) {
  const mm = (v) => Math.round(v * 1000);
  const W = mm(box.w);
  const H = mm(box.h);
  const pad = Math.max(W, H) * 0.14;
  let body = `<rect x="${-W / 2}" y="${-H}" width="${W}" height="${H}" rx="${Math.min(W, H) * 0.04}" class="box"/>`;
  for (const d of drivers) {
    const cy = -mm(d.y);
    const r = mm(d.d) / 2;
    const c = DRIVER_COLOURS[d.role];
    if (d.role === 'horn') {
      const w = mm(d.w);
      const hh = mm(d.h);
      body += `<rect x="${-w / 2}" y="${cy - hh / 2}" width="${w}" height="${hh}" rx="${hh * 0.12}" class="horn" style="stroke:${c}"/>`;
      body += `<rect x="${-w * 0.12}" y="${cy - hh * 0.12}" width="${w * 0.24}" height="${hh * 0.24}" class="throat" style="stroke:${c}"/>`;
    } else if (d.role === 'tweeter') {
      body += `<circle cx="0" cy="${cy}" r="${r * 1.9}" class="plate"/><circle cx="0" cy="${cy}" r="${r}" class="dome" style="stroke:${c}"/>`;
    } else if (d.role === 'coax') {
      body += `<circle cx="0" cy="${cy}" r="${r}" class="throat" style="stroke:${c}"/><circle cx="0" cy="${cy}" r="${r * 0.35}" class="dome" style="stroke:${c}"/>`;
    } else {
      body += `<circle cx="0" cy="${cy}" r="${r}" class="surround" style="stroke:${c}"/><circle cx="0" cy="${cy}" r="${r * 0.86}" class="cone"/><circle cx="0" cy="${cy}" r="${r * 0.22}" class="cap" style="stroke:${c}"/>`;
    }
  }
  body += `<text x="0" y="${pad * 0.7}" class="t mid" style="font-size:${pad * 0.42}px">${W} mm</text>`;
  body += `<text x="${W / 2 + pad * 0.25}" y="${-H / 2}" class="t" style="font-size:${pad * 0.42}px" transform="rotate(90 ${W / 2 + pad * 0.25} ${-H / 2})" text-anchor="middle">${H} mm</text>`;
  return svg(`${-W / 2 - pad} ${-H - pad * 0.6} ${W + 2 * pad} ${H + pad * 1.5}`, body, 'tx-face');
}

/** Each driver's band on a log axis, 20 Hz – 20 kHz, the crossovers marked. */
function bandsSvg({ drivers, crossovers }) {
  const X = (f) => (Math.log10(Math.max(F_MIN, Math.min(F_MAX, f)) / F_MIN) / 3) * 600;
  const rowH = 14;
  let body = '';
  for (const f of [100, 1000, 10000]) body += `<line x1="${X(f)}" y1="0" x2="${X(f)}" y2="${drivers.length * rowH}" class="ring"/><text x="${X(f)}" y="${drivers.length * rowH + 11}" class="t mid">${kHz(f)}</text>`;
  [...drivers].reverse().forEach((d, i) => {
    body += `<rect x="${X(d.lo)}" y="${i * rowH + 2}" width="${Math.max(2, X(d.hi) - X(d.lo))}" height="${rowH - 4}" rx="3" style="fill:${DRIVER_COLOURS[d.role]}" opacity=".75"/>`;
  });
  for (const c of crossovers) body += `<line x1="${X(c.f)}" y1="0" x2="${X(c.f)}" y2="${drivers.length * rowH}" class="xo"/>`;
  return svg(`-4 -2 608 ${drivers.length * rowH + 16}`, body, 'tx-bands');
}

const NAMES = { woofer: 'Woofer', mid: 'Mid', tweeter: 'Tweeter', horn: 'Compression horn', coax: 'Coaxial tweeter' };

/** The card: face, the two polars, the bands and a line per driver. */
export function transducerCard(spk) {
  const parts = driversOf(spk);
  const colour = spk.color || '#f4902c';
  const ways = parts.ways === 1 ? 'one driver' : `${parts.ways}-way`;
  const legend = h(
    'ul',
    { class: 'tx-legend' },
    ...parts.drivers.map((d) =>
      h(
        'li',
        { style: `--c:${DRIVER_COLOURS[d.role]}` },
        h('i'),
        h('b', {}, NAMES[d.role]),
        ` ${d.role === 'horn' ? `${Math.round(d.w * 1000)} × ${Math.round(d.h * 1000)} mm` : `⌀ ${Math.round(d.d * 1000)} mm`} · ${kHz(d.lo)} – ${kHz(d.hi)}`,
        d.assumed ? h('span', { class: 'hint' }, ' ≈') : '',
      ),
    ),
  );
  const xo = parts.crossovers.map((c) => `${c.assumed ? '≈' : ''}${kHz(c.f)}`).join(' and ');
  return h(
    'div',
    { class: 'tx-card' },
    h('div', { class: 'tx-views' }, faceSvg(spk, parts), polarSvg(spk, 'h', colour), polarSvg(spk, 'v', colour)),
    h('div', { class: 'tx-foot' }, h('p', { class: 'stat' }, `${spk.maker ? spk.maker + ' · ' : ''}${ways}${xo ? `, crossing at ${xo}` : ''} · ${spk.pattern} ${spk.hCov}° × ${spk.vCov}°`), bandsSvg(parts), legend),
  );
}

/** A mic or a listener: its pickup seen from above and from the side (a first-order shape is the same both ways). */
export function pickupCard(mic) {
  const dev = { pattern: mic.pattern in FIRST_ORDER ? mic.pattern : 'omni', hCov: 360, vCov: 360, omniBelow: 0 };
  return h('div', { class: 'tx-card' }, h('div', { class: 'tx-views' }, polarSvg(dev, 'h', '#22d3ee'), polarSvg(dev, 'v', '#22d3ee')));
}
