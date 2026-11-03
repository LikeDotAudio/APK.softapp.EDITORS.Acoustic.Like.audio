// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import {
  deriveThieleSmall,
  calculateEBP,
  calculateSealedBox,
  calculateVentedBox,
  calculatePortLengthMm,
  calculateSplCurve,
  calculateImpedanceCurve,
  calculateExcursionCurve,
  calculateBaffleStepCurve,
} from '../acoustics/speakerPhysics.js';
import { boxSize } from '../acoustics/devices.js';
import { h } from './dom.js';

let activeModal = null;

/**
 * Opens the interactive Speaker Datasheet & Simulation dialog.
 */
export function openSpeakerDatasheetModal(speaker, { onUpdate = () => {}, onOpenBuilder = () => {} } = {}) {
  if (activeModal) activeModal.remove();

  const ts = deriveThieleSmall(speaker);
  const ebp = calculateEBP(ts.Fs, ts.Qes);
  const box = boxSize(speaker);

  let activeTab = 'spl';
  let boxType = speaker.kind === 'sub' || (speaker.fLow && speaker.fLow < 50) ? 'vented' : 'vented';
  let volumeLitres = speaker.litres || 25;
  let tuningFb = speaker.fLow || 42;
  let portDiaMm = 70;

  const overlay = h('div', { class: 'spk-modal-overlay' });
  const modal = h('div', { class: 'spk-modal-window', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${speaker.label || speaker.name} Datasheet` });
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  activeModal = overlay;

  const close = () => {
    overlay.remove();
    activeModal = null;
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeyDown);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function render() {
    modal.innerHTML = '';

    // 1. Header
    const closeBtn = h('button', { class: 'modal-x-btn', onclick: close, title: 'Close' }, '✕');
    const builderBtn = h('button', {
      class: 'builder-link-btn',
      title: 'Open in Speaker CAD Builder to design baffle layout and components',
      onclick: () => {
        close();
        if (onOpenBuilder) onOpenBuilder(speaker);
        else window.open('../EDITORS.Speaker.Like.audio/index.html', '_blank');
      },
    }, '🛠 Open in Speaker CAD Builder');

    const header = h(
      'div',
      { class: 'spk-modal-header' },
      h('div', { class: 'title-col' },
        h('div', { class: 'spk-title' }, `🔊 ${speaker.maker ? speaker.maker + ' ' : ''}${speaker.name || speaker.role || 'Loudspeaker'}`),
        h('div', { class: 'spk-subtitle' }, `${speaker.driver || 'Transducer'} · ${volumeLitres} L cabinet · ${speaker.pattern || 'horn'} ${speaker.hCov || 90}°×${speaker.vCov || 60}°`),
      ),
      h('div', { class: `ebp-badge ${ebp.preference === 'VENTED PREFERRED' ? 'vented' : 'sealed'}` }, `EBP ${ebp.value}: ${ebp.preference}`),
      builderBtn,
      closeBtn,
    );

    // 2. Navigation Tabs
    const nav = h(
      'div',
      { class: 'spk-modal-tabs' },
      ...[
        ['spl', '📈 SPL & Response'],
        ['ts', '📋 Thiele-Small & EBP'],
        ['enclosure', '📦 Enclosure & Port'],
        ['impedance', '⚡ Impedance & Excursion'],
        ['baffle', '🛡️ Baffle & Directivity'],
      ].map(([id, label]) =>
        h('button', {
          class: `tab-btn ${activeTab === id ? 'active' : ''}`,
          onclick: () => {
            activeTab = id;
            render();
          },
        }, label),
      ),
    );

    // 3. Tab Body
    const body = h('div', { class: 'spk-modal-body' });
    if (activeTab === 'spl') renderSplTab(body);
    else if (activeTab === 'ts') renderTsTab(body);
    else if (activeTab === 'enclosure') renderEnclosureTab(body);
    else if (activeTab === 'impedance') renderImpedanceTab(body);
    else if (activeTab === 'baffle') renderBaffleTab(body);

    // 4. Footer
    const footer = h(
      'div',
      { class: 'spk-modal-footer' },
      h('button', {
        class: 'primary-btn',
        onclick: () => {
          onUpdate({
            litres: volumeLitres,
            fLow: tuningFb,
            sensitivity: ts.sensitivity,
            watts: ts.watts,
          });
          close();
        },
      }, 'Apply to Room Acoustic Engine'),
      h('button', { onclick: close }, 'Close'),
    );

    modal.append(header, nav, body, footer);
  }

  // --- TAB 1: SPL Response Curve ---
  function renderSplTab(body) {
    const enc = { type: boxType, volumeLitres, tuningFreqHz: tuningFb };
    const curve = calculateSplCurve(ts, enc);

    const controls = h(
      'div',
      { class: 'ctrl-bar' },
      h('label', {}, 'Enclosure Type: ',
        h('select', {
          onchange: (e) => {
            boxType = e.target.value;
            render();
          },
        },
        h('option', { value: 'vented', selected: boxType === 'vented' }, 'Bass Reflex (Vented)'),
        h('option', { value: 'sealed', selected: boxType === 'sealed' }, 'Acoustic Suspension (Sealed)'),
        ),
      ),
      h('label', {}, `Volume: ${volumeLitres} L `,
        h('input', {
          type: 'range',
          min: '5',
          max: '200',
          step: '1',
          value: String(volumeLitres),
          oninput: (e) => {
            volumeLitres = +e.target.value;
            render();
          },
        }),
      ),
      boxType === 'vented' ? h('label', {}, `Tuning Fb: ${tuningFb} Hz `,
        h('input', {
          type: 'range',
          min: '20',
          max: '100',
          step: '1',
          value: String(tuningFb),
          oninput: (e) => {
            tuningFb = +e.target.value;
            render();
          },
        }),
      ) : '',
    );

    const chart = renderGraphSvg({
      title: `Transfer Function SPL at 2.83V / 1W @ 1m (Sensitivity: ${ts.sensitivity} dB)`,
      xMin: 10,
      xMax: 20000,
      yMin: 40,
      yMax: 105,
      yUnit: 'dB',
      series: [
        { name: 'System SPL (dB)', color: '#38bdf8', points: curve.map((p) => ({ x: p.f, y: p.spl })) },
      ],
    });

    body.append(controls, chart);
  }

  // --- TAB 2: Thiele-Small & EBP Analysis ---
  function renderTsTab(body) {
    const table = h(
      'div',
      { class: 'ts-grid' },
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Fs (Free Air Resonance)'), h('span', { class: 'val' }, `${ts.Fs} Hz`)),
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Qts (Total Q Factor)'), h('span', { class: 'val' }, `${ts.Qts}`)),
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Qes (Electrical Q)'), h('span', { class: 'val' }, `${ts.Qes}`)),
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Qms (Mechanical Q)'), h('span', { class: 'val' }, `${ts.Qms}`)),
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Vas (Equivalent Air Volume)'), h('span', { class: 'val' }, `${ts.Vas} L`)),
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Sd (Cone Piston Area)'), h('span', { class: 'val' }, `${Math.round(ts.Sd * 10000)} cm²`)),
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Re (DC Voice Coil Resistance)'), h('span', { class: 'val' }, `${ts.Re} Ω`)),
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Le (Voice Coil Inductance)'), h('span', { class: 'val' }, `${(ts.Le * 1000).toFixed(2)} mH`)),
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Xmax (Linear Peak Excursion)'), h('span', { class: 'val' }, `±${ts.Xmax} mm`)),
      h('div', { class: 'param-card' }, h('span', { class: 'lbl' }, 'Continuous RMS Power'), h('span', { class: 'val' }, `${ts.watts} W`)),
    );

    const callout = h(
      'div',
      { class: 'ebp-callout-box' },
      h('div', { class: 'ebp-header' },
        h('strong', {}, `Efficiency Bandwidth Product (EBP) = Fs / Qes = ${ebp.value}`),
        h('span', { class: `badge ${ebp.preference === 'VENTED PREFERRED' ? 'vented' : 'sealed'}` }, ebp.preference),
      ),
      h('p', {}, ebp.value > 90
        ? 'High EBP (> 90) indicates a driver with a strong motor relative to cone damping, ideal for vented (bass reflex) enclosures with tight control at resonance.'
        : ebp.value < 50
        ? 'Low EBP (< 50) indicates high electrical damping suitability for sealed (closed-box) acoustic suspension, providing smooth 12 dB/oct transient rolloff.'
        : 'Moderate EBP (50–90) allows versatile tuning in either sealed or vented alignments.'),
    );

    body.append(table, callout);
  }

  // --- TAB 3: Enclosure & Port Calculator ---
  function renderEnclosureTab(body) {
    const portLen = calculatePortLengthMm({ volumeLitres, tuningFreqHz: tuningFb, portDiameterMm: portDiaMm });
    const sealed = calculateSealedBox(ts, volumeLitres);

    const portPanel = h(
      'div',
      { class: 'enclosure-calc-panel' },
      h('div', { class: 'calc-inputs' },
        h('h4', {}, 'Bass Reflex Port Calculator'),
        h('div', { class: 'row' },
          h('label', {}, 'Box Volume (L): ', h('input', { type: 'number', value: volumeLitres, onchange: (e) => { volumeLitres = +e.target.value; render(); } })),
          h('label', {}, 'Tuning Fb (Hz): ', h('input', { type: 'number', value: tuningFb, onchange: (e) => { tuningFb = +e.target.value; render(); } })),
          h('label', {}, 'Port Diameter (mm): ', h('input', { type: 'number', value: portDiaMm, onchange: (e) => { portDiaMm = +e.target.value; render(); } })),
        ),
        h('div', { class: 'port-result' },
          h('span', {}, 'Required Port Tube Length: '),
          h('strong', {}, `${portLen} mm (${(portLen / 10).toFixed(1)} cm)`),
        ),
      ),
      h('div', { class: 'sealed-stats' },
        h('h4', {}, 'Sealed Box Equivalent Alignment'),
        h('p', {}, `System Resonance (Fc): `, h('b', {}, `${sealed.Fc} Hz`)),
        h('p', {}, `Total System Q (Qtc): `, h('b', {}, `${sealed.Qtc}`), sealed.Qtc <= 0.72 && sealed.Qtc >= 0.69 ? ' (Butterworth Maximally Flat)' : ''),
        h('p', {}, `-3 dB Cutoff (f3): `, h('b', {}, `${sealed.f3} Hz`)),
      ),
    );

    // Vector box cross section
    const boxSvg = renderBoxDiagram(boxType, volumeLitres, portDiaMm, portLen);
    body.append(portPanel, boxSvg);
  }

  // --- TAB 4: Impedance & Excursion ---
  function renderImpedanceTab(body) {
    const enc = { type: boxType, volumeLitres, tuningFreqHz: tuningFb };
    const zCurve = calculateImpedanceCurve(ts, enc);
    const excCurve = calculateExcursionCurve(ts, enc);

    const zChart = renderGraphSvg({
      title: 'Electrical Impedance (Magnitude in Ohms vs Frequency)',
      xMin: 10,
      xMax: 20000,
      yMin: 0,
      yMax: Math.max(50, Math.round(ts.Re * 6)),
      yUnit: 'Ω',
      series: [
        { name: 'Impedance |Z|', color: '#f59e0b', points: zCurve.map((p) => ({ x: p.f, y: p.z })) },
      ],
    });

    const excChart = renderGraphSvg({
      title: `Cone Excursion (mm at Rated Power) — Xmax Limit: ±${ts.Xmax} mm`,
      xMin: 10,
      xMax: 1000,
      yMin: 0,
      yMax: Math.round(ts.Xmax * 1.8),
      yUnit: 'mm',
      series: [
        { name: 'Cone Excursion', color: '#ef4444', points: excCurve.map((p) => ({ x: p.f, y: p.exc })) },
        { name: 'Xmax Limit', color: '#64748b', points: [{ x: 10, y: ts.Xmax }, { x: 1000, y: ts.Xmax }], dashed: true },
      ],
    });

    body.append(zChart, excChart);
  }

  // --- TAB 5: Baffle & Directivity ---
  function renderBaffleTab(body) {
    const baffleW = Math.round((box.w || 0.24) * 1000);
    const baffle = calculateBaffleStepCurve(baffleW);

    const baffleChart = renderGraphSvg({
      title: `Baffle Step Diffraction Response (Baffle Width: ${baffleW} mm · fStep ≈ ${baffle.fStep} Hz)`,
      xMin: 20,
      xMax: 10000,
      yMin: -1,
      yMax: 8,
      yUnit: 'dB',
      series: [
        { name: '+6 dB Step Gain', color: '#22c55e', points: baffle.points.map((p) => ({ x: p.f, y: p.gainDb })) },
      ],
    });

    const info = h(
      'div',
      { class: 'baffle-info-panel' },
      h('p', {}, `Horizontal Coverage: `, h('b', {}, `${speaker.hCov || 90}°`), ` · Vertical Coverage: `, h('b', {}, `${speaker.vCov || 60}°`)),
      h('p', {}, `Acoustic center transition from 4π spherical radiation to 2π half-space occurs at `, h('b', {}, `${baffle.fStep} Hz`), `, adding a +6 dB shelf to on-axis pressure.`),
    );

    body.append(baffleChart, info);
  }

  render();
}

/**
 * Universal SVG Log-Frequency Graph Renderer
 */
function renderGraphSvg({ title, xMin, xMax, yMin, yMax, yUnit, series }) {
  const W = 680;
  const H = 220;
  const padL = 45;
  const padR = 25;
  const padT = 30;
  const padB = 30;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const logX = (x) => {
    const clamped = Math.max(xMin, Math.min(xMax, x));
    return padL + (Math.log10(clamped / xMin) / Math.log10(xMax / xMin)) * plotW;
  };

  const linY = (y) => {
    const clamped = Math.max(yMin, Math.min(yMax, y));
    return padT + plotH - ((clamped - yMin) / (yMax - yMin)) * plotH;
  };

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'modal-graph-svg');

  let inner = '';
  // Title
  inner += `<text x="${padL}" y="18" fill="#cbd5e1" font-size="12" font-weight="600">${title}</text>`;

  // X Frequency grid lines (decade)
  for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    if (f >= xMin && f <= xMax) {
      const x = logX(f);
      inner += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="#27272a" stroke-width="1"/>`;
      if ([20, 100, 1000, 10000].includes(f)) {
        const lbl = f >= 1000 ? `${f / 1000}k` : `${f}`;
        inner += `<text x="${x}" y="${padT + plotH + 16}" fill="#64748b" font-size="10" font-family="ui-monospace, monospace" text-anchor="middle">${lbl}</text>`;
      }
    }
  }

  // Y Axis grid lines
  const yStep = (yMax - yMin) / 4;
  for (let yVal = yMin; yVal <= yMax; yVal += yStep) {
    const y = linY(yVal);
    inner += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" stroke="#27272a" stroke-width="1"/>`;
    inner += `<text x="${padL - 6}" y="${y + 4}" fill="#64748b" font-size="10" font-family="ui-monospace, monospace" text-anchor="end">${Math.round(yVal)}${yUnit}</text>`;
  }

  // Series curves
  for (const s of series) {
    let d = '';
    s.points.forEach((pt, i) => {
      const x = logX(pt.x).toFixed(1);
      const y = linY(pt.y).toFixed(1);
      d += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
    });
    const dash = s.dashed ? 'stroke-dasharray="4 4"' : '';
    inner += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${dash}/>`;
  }

  svg.innerHTML = inner;
  return svg;
}

/**
 * Diagram showing vector cross-section of cabinet enclosure
 */
function renderBoxDiagram(boxType, volumeL, portDiaMm, portLenMm) {
  const W = 680;
  const H = 140;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'box-diagram-svg');

  const cx = 340;
  const cy = 70;
  const bw = 180;
  const bh = 100;

  let inner = `
    <!-- Cabinet Enclosure Wall -->
    <rect x="${cx - bw / 2}" y="${cy - bh / 2}" width="${bw}" height="${bh}" rx="4" fill="#18181b" stroke="#64748b" stroke-width="2.5"/>
    <rect x="${cx - bw / 2 + 8}" y="${cy - bh / 2 + 8}" width="${bw - 16}" height="${bh - 16}" rx="2" fill="#090d16" stroke="#334155" stroke-dasharray="3 3"/>

    <!-- Driver Cone on Front Baffle -->
    <path d="M ${cx - bw / 2} ${cy - 20} L ${cx - bw / 2 - 14} ${cy - 28} L ${cx - bw / 2 - 14} ${cy + 28} L ${cx - bw / 2} ${cy + 20} Z" fill="#38bdf8" opacity="0.85"/>
    <line x1="${cx - bw / 2 - 14}" y1="${cy - 28}" x2="${cx - bw / 2 - 14}" y2="${cy + 28}" stroke="#38bdf8" stroke-width="3"/>

    <text x="${cx}" y="${cy}" fill="#94a3b8" font-size="12" text-anchor="middle">Net Volume: ${volumeL} L</text>
  `;

  if (boxType === 'vented') {
    const pw = Math.min(80, portLenMm * 0.4);
    const ph = 18;
    inner += `
      <!-- Port Tube -->
      <rect x="${cx - bw / 2 + 8}" y="${cy + bh / 2 - 28}" width="${pw}" height="${ph}" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/>
      <text x="${cx - bw / 2 + pw + 12}" y="${cy + bh / 2 - 15}" fill="#f59e0b" font-size="10">Port: ⌀${portDiaMm} × ${portLenMm} mm</text>
    `;
  }

  svg.innerHTML = inner;
  return svg;
}
