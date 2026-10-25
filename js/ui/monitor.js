// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { DEG } from '../acoustics/geometry.js';
import { activeSet, arrangedSpeakers, selectSet, SPEAKER_SETS } from '../acoustics/layouts.js';
import { calibrate, channelLevels, masterDb, monitoredSpeakers, monitorOf, NOISES, noiseSpl } from '../acoustics/monitor.js';
import { button, h, num } from './dom.js';

/**
 * THE MONITOR CONTROLLER, ON THE SCREEN
 *
 * The set (A B C), the volume, dim and mute; the noise generator; a strip per
 * channel of the selected set — mute, solo, polarity, trim, and what the
 * meter at the mix seat reads for it alone on the noise — and Cal, which
 * trims every channel to the target. The room hears all of it
 * (acoustics/monitor.js). 🔊 plays the noise here too, each channel panned
 * where it stands round the listener, through the same mutes, solos, trims,
 * polarity and volume: a sketch of the controller, not an auralization.
 */

const VOLUME = [-60, 12];
const NOISE_SECONDS = 6;

export function createMonitor({ root, store, engine }) {
  const S = () => store.state;
  const setMonitor = (patch, live = false) => store.setSettings({ monitor: { ...monitorOf(S().settings), ...patch } }, live);
  const channel = (id, patch) => store.update('speaker', id, patch);

  // ---------------------------------------------------------------- the noise, heard
  const sound = { ctx: null, on: false, buffers: {}, src: null, master: null, strips: [] };

  function noiseBuffer(kind) {
    if (sound.buffers[kind]) return sound.buffers[kind];
    const rate = sound.ctx.sampleRate;
    const buf = sound.ctx.createBuffer(1, rate * NOISE_SECONDS, rate);
    const d = buf.getChannelData(0);
    // pink by Paul Kellet's filter, brown by a leaky integrator; each scaled to the same RMS
    let [b0, b1, b2, b3, b4, b5, b6, last] = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') d[i] = last = (last + 0.02 * w) / 1.02;
      else {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      }
    }
    let rms = 0;
    for (const v of d) rms += v * v;
    rms = Math.sqrt(rms / d.length) || 1;
    for (let i = 0; i < d.length; i++) d[i] *= 0.1 / rms;
    return (sound.buffers[kind] = buf);
  }

  async function listen(on) {
    sound.on = on;
    if (on) {
      sound.ctx ??= new AudioContext();
      await sound.ctx.resume();
    }
    patch();
    render();
  }

  /** The audio graph brought in line with the controller: one noise, a gain and a pan per channel that sounds. */
  function patch() {
    const { ctx } = sound;
    if (!ctx) return;
    const m = monitorOf(S().settings);
    if (!sound.on) {
      sound.src?.stop();
      sound.src = null;
      sound.kind = null;
      return;
    }
    if (sound.kind !== m.noise) {
      sound.src?.stop();
      sound.src = ctx.createBufferSource();
      sound.src.buffer = noiseBuffer(m.noise);
      sound.src.loop = true;
      sound.master ??= ctx.createGain();
      sound.master.connect(ctx.destination);
      sound.src.start();
      sound.kind = m.noise;
      sound.strips = [];
    }
    for (const s of sound.strips) s.gain.disconnect();
    sound.src.disconnect();
    const mix = S().mics.find((x) => x.mix);
    const heard = monitoredSpeakers(S().speakers, S().settings);
    sound.strips = heard.map((spk) => {
      const gain = ctx.createGain();
      gain.gain.value = (spk.invert ? -1 : 1) * 10 ** ((spk.trimDb ?? 0) / 20) / Math.sqrt(heard.length);
      const pan = ctx.createStereoPanner();
      // azimuth off the listener's nose, positive to the left: panned by its sine
      if (mix) pan.pan.value = -Math.sin((Math.atan2(spk.y - mix.y, spk.x - mix.x) / DEG - (mix.aim ?? S().settings.frontDeg)) * DEG);
      sound.src.connect(gain).connect(pan).connect(sound.master);
      return { gain };
    });
    sound.master.gain.setTargetAtTime(10 ** (masterDb(m) / 20), ctx.currentTime, 0.02);
  }

  // ---------------------------------------------------------------- the panel
  function render() {
    if (root.hidden) return;
    const { settings, speakers, mics } = S();
    const m = monitorOf(settings);
    const set = activeSet(settings);
    const room = engine.out.room;
    const mix = mics.find((x) => x.mix);
    const chans = arrangedSpeakers(speakers, settings);
    const levels = new Map(room && mix ? channelLevels(room, speakers, settings, mix).map((l) => [l.id, l.db]) : []);
    const total = room && mix ? noiseSpl(room, monitoredSpeakers(speakers, settings), mix, m.noise) : -Infinity;
    const anySolo = chans.some((s) => s.solo);
    const db = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');

    const sets = h(
      'div',
      { class: 'group' },
      Object.entries(SPEAKER_SETS).map(([k, x]) => button(x.label, () => store.setSettings(selectSet(S().settings, k)), { class: k === set ? 'on' : '', title: `${x.title}: make it the set that sounds` })),
    );
    const vol = h('input', { type: 'range', min: VOLUME[0], max: VOLUME[1], step: 0.5, value: m.volumeDb, title: 'Volume, dB: every channel of the set' });
    vol.addEventListener('input', () => {
      setMonitor({ volumeDb: parseFloat(vol.value) }, true);
      volOut.textContent = `${(+vol.value).toFixed(1)} dB`;
      patch();
    });
    vol.addEventListener('change', () => setMonitor({ volumeDb: parseFloat(vol.value) }));
    const volOut = h('output', { class: 'mono' }, `${m.volumeDb.toFixed(1)} dB`);
    const master = h(
      'div',
      { class: 'monRow' },
      sets,
      h('label', { class: 'monVol' }, 'Vol', vol, volOut),
      button('Dim', () => setMonitor({ dim: !m.dim }), { class: m.dim ? 'on dim' : '', title: `Drop the volume by ${-m.dimDb} dB` }),
      button('Mute', () => setMonitor({ mute: !m.mute }), { class: m.mute ? 'on mute' : '', title: 'Cut every channel' }),
    );

    const noise = h(
      'div',
      { class: 'monRow' },
      h('span', { class: 'monLabel' }, 'Noise'),
      h('div', { class: 'group' }, Object.entries(NOISES).map(([k, n]) => button(n.label, () => setMonitor({ noise: k }), { class: k === m.noise ? 'on' : '', title: n.title }))),
      button(sound.on ? '🔊 Stop' : '🔈 Listen', () => listen(!sound.on), { class: sound.on ? 'on' : '', title: 'Play the noise here, through the controller — each channel panned where it stands' }),
      h('span', { class: 'monRead', title: 'What a meter at the mix seat reads for the noise through every channel that sounds: direct + diffuse, 125 Hz – 4 kHz octaves' }, mix ? `${mix.name || 'MIX'} ` : 'no mix seat ', h('b', {}, `${db(total)} dB`)),
    );

    const strip = (s) => {
      const silent = m.mute || s.mute || (anySolo && !s.solo);
      return h(
        'tr',
        { class: silent ? 'silent' : '' },
        h('td', { class: 'name' }, s.role || s.name),
        h('td', {}, button('M', () => channel(s.id, { mute: !s.mute }), { class: s.mute ? 'on mute' : '', title: `Mute ${s.role || s.name}` })),
        h('td', {}, button('S', () => channel(s.id, { solo: !s.solo }), { class: s.solo ? 'on solo' : '', title: `Solo ${s.role || s.name} (Ctrl: this one alone)` })),
        h('td', {}, button('Ø', () => channel(s.id, { invert: !s.invert }), { class: s.invert ? 'on' : '', title: 'Flip its polarity' })),
        h('td', {}, num(s.trimDb ?? 0, (v) => channel(s.id, { trimDb: v }), { step: 0.5, unit: 'dB' })),
        h('td', { class: 'mono', title: s.kind === 'sub' ? 'A sub reads low on the 125 Hz – 4 kHz meter — calibrate it with band-limited noise' : 'This channel alone at the mix seat, through the volume and its trim' }, `${db(levels.get(s.id))}${s.kind === 'sub' ? ' ˢ' : ''}`),
      );
    };
    // Ctrl-click a solo: that channel alone, every other solo let go
    const table = h('table', { class: 'monStrips' }, h('tr', {}, h('th', {}, 'Ch'), h('th', {}, ''), h('th', {}, ''), h('th', {}, ''), h('th', {}, 'Trim'), h('th', {}, 'dB @ seat')), chans.map(strip));
    table.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('button');
        if (!b || b.textContent !== 'S' || !(e.ctrlKey || e.metaKey)) return;
        e.stopPropagation();
        const id = chans[[...table.querySelectorAll('tr')].indexOf(b.closest('tr')) - 1]?.id;
        store.replaceSpeakers(S().speakers.map((s) => (chans.includes(s) ? { ...s, solo: s.id === id } : s)));
      },
      true,
    );

    const target = num(m.calDb, (v) => setMonitor({ calDb: v }), { step: 0.5, unit: 'dB' });
    const cal = h(
      'div',
      { class: 'monRow' },
      h('span', { class: 'monLabel' }, 'Cal to'),
      target,
      button('Cal', () => {
        if (!room || !mix) return;
        const mains = chans.filter((s) => s.kind !== 'sub');
        const trims = new Map(calibrate(channelLevels(room, mains, settings, mix), mains, m.calDb).map((t) => [t.id, t.trimDb]));
        store.replaceSpeakers(S().speakers.map((s) => (trims.has(s.id) ? { ...s, trimDb: trims.get(s.id) } : s)));
      }, { disabled: !mix || !room, title: `Trim every channel but the subs so each alone reads the target at the mix seat on ${NOISES[m.noise].label.toLowerCase()} noise` }),
      button('Clear', () => store.replaceSpeakers(S().speakers.map((s) => (chans.includes(s) ? { ...s, mute: false, solo: false, invert: false, trimDb: 0 } : s))), { title: 'Every channel of the set unmuted, unsoloed, polarity normal, trim 0' }),
    );

    root.replaceChildren(
      master,
      noise,
      chans.length ? table : h('p', { class: 'hint' }, `The ${set} set has no speakers yet — ⤓ on its row places them.`),
      cal,
    );
  }

  store.subscribe((_, what) => {
    if (what === 'drag') return;
    patch();
    render();
  });

  return { render };
}
