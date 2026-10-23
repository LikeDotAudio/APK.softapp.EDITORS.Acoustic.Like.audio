// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * HEAR IT
 *
 * The echogram becomes an impulse response — each image-source arrival an
 * impulse of its own energy, the diffuse tail as noise shaped to the tail's
 * decay — and a hand-clap is played through it. It is the octave band's
 * energy-time picture, not a measured IR: good for hearing how long and how
 * early, not for judging tone.
 */

let audio = null;

export function impulseResponse(eg, rate) {
  const n = Math.min(Math.ceil((eg.bins.length * eg.dt + 0.05) * rate), rate * 4);
  const ir = new Float32Array(n);
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  for (const a of eg.arrivals) {
    const i = Math.round(a.t * rate);
    if (i < n) ir[i] += Math.sqrt(a.energy);
  }
  const per = eg.dt * rate;
  for (let b = 0; b < eg.tail.length; b++) {
    if (!eg.tail[b]) continue;
    const amp = Math.sqrt(eg.tail[b] / per) * Math.sqrt(3);
    const i0 = Math.floor(b * per);
    for (let i = i0; i < i0 + per && i < n; i++) ir[i] += amp * rand();
  }
  let peak = 0;
  for (const v of ir) peak = Math.max(peak, Math.abs(v));
  if (peak) for (let i = 0; i < n; i++) ir[i] /= peak;
  return ir;
}

export async function listen(eg) {
  audio ??= new AudioContext();
  await audio.resume();
  const rate = audio.sampleRate;
  const ir = impulseResponse(eg, rate);
  const irBuf = audio.createBuffer(1, ir.length, rate);
  irBuf.copyToChannel(ir, 0);
  const clap = audio.createBuffer(1, Math.round(rate * 0.03), rate);
  const c = clap.getChannelData(0);
  for (let i = 0; i < c.length; i++) c[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * 0.004));
  const src = audio.createBufferSource();
  src.buffer = clap;
  const conv = audio.createConvolver();
  conv.normalize = true;
  conv.buffer = irBuf;
  const gain = audio.createGain();
  gain.gain.value = 0.8;
  src.connect(conv).connect(gain).connect(audio.destination);
  src.start();
}
