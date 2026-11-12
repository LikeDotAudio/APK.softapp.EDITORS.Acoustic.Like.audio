// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTIC X — the Start Screen, General Parameters, the Fast Guide, the Report Print Manager, About and Help.
 * Lifted out of createAcousticX (acoustx.js, ROAD-3752): `ctx` is the
 * component's shared context (the classic model M, its helpers and the
 * window kit); this reads it, it never replaces it.
 */
import { ACX_LABEL, clamp, fmt, group, h, readout } from '../kit.js';
import { airDbPerM, convert, speedOfSound } from '../classic.js';
import { FAVOURABLE_RATIOS } from '../../acoustics/modalDistribution.js';
import { standIn, tableSnapshot } from '../../apkTable.js';
import { renderMarkdown } from '../markdown.js';

export function createScreens(acx) {
  const {
    close, dimsChanged, edited, lenField, M, makeWindow, numField, open, projectLines, refreshAll, tabs,
    unitsRow, wins,
  } = acx;

  // ═════════════════════════════════════════════════════════════════════════
  // START SCREEN · GENERAL PARAMETERS · FAST GUIDE · REPORTS · ABOUT
  // ═════════════════════════════════════════════════════════════════════════
  const MODULES = [
    ['modal', 'Modal Response'],
    ['sbir', 'Speaker Boundary Interference Response'],
    ['rays', 'Ray Tracing'],
    ['reverb', 'Reverb Time'],
  ];

  makeWindow('start', 'Acoustic X', { w: 460, h: 430, foot: false }, (win) => {
    const field = (label, key) => {
      const inp = h('input', { type: 'text', style: 'flex:1' });
      inp.addEventListener('input', () => (M.project[key] = inp.value));
      win.syncers.push(() => document.activeElement !== inp && (inp.value = M.project[key]));
      return h('div', { class: 'row' }, h('label', {}, label), inp);
    };
    win.el.append(
      h(
        'div',
        { class: 'acx-calc' },
        h('div', { class: 'start-title' }, 'Acoustic X', h('span', { class: 'small muted' }, ' room acoustic optimisation — in the style of the 1997 program')),
        group('Modules', h('div', { class: 'startgrid' }, ...MODULES.map(([n, l]) => h('button', { onclick: () => open(n) }, l)), h('button', { disabled: true }, '—'), h('button', { disabled: true }, '—'), h('button', { onclick: () => open('calc') }, 'Acoustic X Calculator'))),
        group('Project', field('Description', 'description'), field('Client', 'client'), field('Location', 'location'), h('div', { class: 'small muted' }, 'Pasted into every Data View report, and every printed or saved one.')),
        h('div', { class: 'btns' }, h('button', { onclick: () => open('general') }, 'General Parameters…'), h('button', { onclick: () => open('guide') }, 'Fast Guide'), h('button', { onclick: () => open('reports') }, 'Print Report…')),
      ),
    );
    win.refresh = () => win.sync();
  });

  makeWindow('general', 'Options — General Parameters', { w: 420, h: 470 }, (win) => {
    const T = tabs(win, ['General', 'Modal Response', 'SBIR']);
    const checkG = (obj, key, label, title) => {
      const c = h('input', { type: 'checkbox', onchange: () => ((obj[key] = c.checked), refreshAll()) });
      win.syncers.push(() => (c.checked = Boolean(obj[key])));
      return h('div', {}, h('label', { class: 'opt', title }, c, label));
    };
    const air = readout();
    win.syncers.push(() => (air.textContent = `c ${fmt(speedOfSound(M.gen.tempC), 1)} m/s · air ${fmt(airDbPerM(4000, M.gen.tempC, M.gen.rh) * 1000, 1)} dB/km at 4 kHz`));
    const ftC = h('input', { type: 'number', step: 1, style: 'width:56px', title: '°F' });
    ftC.addEventListener('change', () => ((M.gen.tempC = +convert('temperature', parseFloat(ftC.value) || 68, 'toMetric').toFixed(1)), refreshAll()));
    win.syncers.push(() => document.activeElement !== ftC && (ftC.value = fmt(convert('temperature', M.gen.tempC, 'toImperial'), 0)));
    T.pages.General.append(
      group('Environment', numField(win, 'Temperature', '°C', () => M.gen.tempC, (v) => (M.gen.tempC = clamp(v, -20, 50)), { step: 0.5, local: false, title: 'Sets the speed of sound everywhere in Acoustic X' }), h('div', { class: 'row' }, h('label', {}, ''), ftC, h('span', { class: 'unit' }, '°F')), numField(win, 'Humidity', '%', () => M.gen.rh, (v) => (M.gen.rh = clamp(v, 5, 100)), { step: 5, local: false, title: 'Sets the air absorption of the high frequencies (ISO 9613-1)' }), h('div', { class: 'small' }, air)),
      group('Display', checkG(M.gen, 'axis', 'Display Axis', 'Grey lines: the centre listening axis at the listener height, and each speaker’s axis to the listener'), unitsRow(win)),
    );
    const ratioList = h('select', { class: 'list', size: 9 }, FAVOURABLE_RATIOS.filter((r) => r.ratio).map((r) => h('option', { value: r.id }, `${r.name}   ${r.ratio.map((x) => x.toFixed(2)).join(' : ')}`)));
    T.pages['Modal Response'].append(
      group('Some Favourable Room Ratios', ratioList, h('div', { class: 'btns' }, h('button', { onclick: () => {
        const r = FAVOURABLE_RATIOS.find((x) => x.id === ratioList.value);
        if (!r?.ratio) return;
        M.W = M.H * r.ratio[1];
        M.L = M.H * r.ratio[2];
        dimsChanged();
        edited();
      } }, 'OK — apply')), h('div', { class: 'small muted' }, 'The 1 of the ratio is the floor-to-ceiling height. Not every favoured ratio suits every volume.')),
      group('Modal Weighting', ...['axial', 'tangential', 'oblique'].map((k) => numField(win, `${k[0].toUpperCase()}${k.slice(1)}`, '', () => M.gen.weights[k], (v) => (M.gen.weights[k] = clamp(v, 0, 2)), { step: 0.05, local: false }))),
    );
    const g = M.gen.sbir;
    T.pages.SBIR.append(
      group('Allowable Search Size', checkG(g, 'custom', 'Custom search (otherwise automatic)'), ...[['frontMin', 'Front min'], ['frontMax', 'Front max'], ['sideMin', 'Side min'], ['sideMax', 'Side max']].map(([k, l]) => lenField(win, l, () => g[k], (v) => (g[k] = Math.max(0, v)), { title: 'Distance of Speaker1 from the front / side wall' })), lenField(win, 'Min. between SPKs', () => g.minSpk, (v) => (g.minSpk = Math.max(0.2, v)), { title: 'The least the left and right speakers may be apart' })),
      group('Surround Speakers', checkG(g, 'centre', 'Center speaker'), checkG(g, 'rear', 'Rear speakers'), lenField(win, 'Rear height offset', () => g.rearRise, (v) => (g.rearRise = v), { title: 'How far above the listener’s ears the rears sit — their distance to the listener is kept' })),
    );
  });

  const GUIDE = {
    start: ['Type the project description, client and location: every report carries them.', 'Set the temperature and humidity under General Parameters.', 'Open Modal Response first: it settles the room size.', 'Then Speaker Boundary Interference to place the speakers, Ray Tracing to check the reflections, Reverb Time to balance the decay.', 'Each module also works on its own — and each starts from the room being designed.'],
    modal: ['Enter the length, width and height on the Room tab — or a ratio, or a favourable one.', 'Press Start: the Bonello box says whether the room meets the criteria.', 'Chart View: the modes at their frequencies above, the count per 1/3 octave against the ideal (blue) below. Move the mouse over them.', 'Optimize: tick the dimensions that may change, set ±% and the step, and Optimize; Use these takes a result.', 'Room View: enter a mode index or a band (Mode 1), pick a plane (Mode 2) — the bright regions are where bass traps work.'],
    sbir: ['Pick the speaker from the database (SPK · Size) or enter its size and woofer height.', 'Set the LF cut-off and crossover on the Listener tab, and the listener’s position.', 'Search tab: choose Min. Absolute or Min. Negative deviation and the step, then Search.', 'Chart View: green above the red LF cut-off counts; a dip at the yellow crossover is flagged; magenta marks a mode the position excites.', 'Room View: the listening window, the specular absorbers that keep it clean, the corner absorbers. Apply moves the design’s speakers.'],
    rays: ['Check the speaker and listening positions (SPK, LS) — Mouse Edit moves the listener on the Plan View.', 'Acoustic tab: the octave band and each surface’s material; the specular absorbers’ α.', 'Sim. tab: the number of reflections (14), the vertical step, and what to show or suppress.', 'Press Start. Chart View: energy by surface above, by time below with the 10 dB window — Next steps through each arrival.', 'Room View in plan: the polar energy shows where reflections within 10 dB come from. The Data View lists the room figures and each surface’s nulls.'],
    reverb: ['Type tab: pick the criteria for the room’s use, or enter your own.', 'RT60 tab: pick the formula — or enter a measured empty-room RT60 as the basis.', 'Surface tab: pick a surface, set its base material, then double-click materials to lay them on it and give each an area.', 'Watch the chart: green bars are inside the criteria, orange are not. Next Surface moves on.', 'Optimize tab: tick up to five materials, give each a Begin, End and Step, and Go Optimize; Apply takes the best.'],
    calc: ['U: convert between metric and imperial.', 'ISL: the level at a distance from one measured at another — spherical or cylindrical.', 'Add: levels added as energy or in-phase pressure.', 'Wave: frequency, wavelength and period, corrected for temperature.', 'Comb: the nulls of a reflection from its delay or its extra path.', 'Wall, Res, QRD, NC: a wall’s loss and Rw, a resonant absorber, a diffuser’s wells, a room’s background noise.', 'PA, Spk, Z, Tone: speech and feedback, pistons and boxes, an impedance step, two tones and loudness.'],
  };
  makeWindow('guide', 'Fast Guide', { w: 330, h: 300, foot: false }, (win) => {
    const body = h('div', { class: 'acx-calc' });
    win.el.append(body);
    win.refresh = () => {
      const name = (MODULES.find(([n]) => n === acx.guideFor) ?? [acx.guideFor, acx.guideFor === 'calc' ? 'Calculator' : 'Getting started'])[1];
      body.replaceChildren(h('b', {}, name), h('ol', {}, (GUIDE[acx.guideFor] ?? GUIDE.start).map((s) => h('li', {}, s))));
    };
  });

  makeWindow('reports', 'Report Print Manager', { w: 380, h: 330, foot: false }, (win) => {
    const pick = Object.fromEntries(MODULES.map(([n]) => [n, true]));
    const fmtSel = h('select', {}, [['html', 'HTML'], ['csv', 'Comma-separated values (CSV)'], ['tsv', 'Tab-separated values'], ['txt', 'Text']].map(([v, l]) => h('option', { value: v }, l)));
    const checks = MODULES.map(([n, l]) => {
      const c = h('input', { type: 'checkbox', checked: true, onchange: () => (pick[n] = c.checked) });
      win.syncers.push(() => (c.checked = pick[n]));
      return h('div', {}, h('label', { class: 'opt' }, c, l));
    });
    const reports = () =>
      MODULES.filter(([n]) => pick[n]).map(([n]) => {
        const w = wins[n];
        if (!w.report || !S0(w)) w.refresh();
        return w.report();
      });
    const S0 = (w) => {
      try {
        return Boolean(w.report());
      } catch {
        return false;
      }
    };
    function html(reps) {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      const head = `<h1>Acoustic X report</h1>${projectLines().map((l) => `<div>${esc(l)}</div>`).join('')}<div>${new Date().toLocaleString()}</div>`;
      // THE ONE TABLE: each section's table is drawn by APKTable (text cells) and
      // carried into the report window as that drawn table (../apkTable.js).
      let n = 0;
      const body = reps.map((r) => `<h2>${esc(r.title)}</h2>${r.sections.map((s) => `<h3>${esc(s.heading)}</h3>${s.text ? `<p>${esc(s.text)}</p>` : ''}${s.rows ? tableSnapshot(`acoustx-report-${++n}`, s.head, s.rows) : ''}`).join('')}`).join('');
      return `<!doctype html><html><head><meta charset="utf-8"><title>Acoustic X report</title><style>body{font:12px/1.35 Arial,sans-serif;margin:24px;color:#000;background:#fff}table{border-collapse:collapse;margin:4px 0 10px}td,th{border:1px solid #999;padding:2px 6px;text-align:left}h2{border-bottom:2px solid #000;margin-top:24px}</style></head><body>${head}${body}</body></html>`;
    }
    function delimited(reps, sep) {
      const cell = (v) => {
        const s = String(v ?? '');
        return sep === ',' && /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s.replace(/\t/g, ' ');
      };
      const lines = [...projectLines()];
      for (const r of reps) {
        lines.push('', r.title);
        for (const s of r.sections) {
          lines.push('', s.heading);
          if (s.text) lines.push(s.text);
          if (s.head) lines.push(s.head.map(cell).join(sep));
          for (const row of s.rows ?? []) lines.push(row.map(cell).join(sep));
        }
      }
      return lines.join('\n') + '\n';
    }
    function text(reps) {
      return delimited(reps, '   ');
    }
    function preview(print = false) {
      const w = window.open('', 'acx-report', 'width=820,height=900');
      if (!w) return (win.status && (win.status.textContent = 'The browser blocked the window'));
      w.document.open();
      w.document.write(html(reports()));
      w.document.close();
      if (print) w.addEventListener('load', () => w.print());
      if (print) setTimeout(() => w.print(), 300);
    }
    function exportFile() {
      const reps = reports();
      const kind = fmtSel.value;
      const [data, type] = kind === 'html' ? [html(reps), 'text/html'] : kind === 'csv' ? [delimited(reps, ','), 'text/csv'] : kind === 'tsv' ? [delimited(reps, '\t'), 'text/tab-separated-values'] : [text(reps), 'text/plain'];
      const a = h('a', { href: URL.createObjectURL(new Blob([data], { type })), download: `acoustic-x-report.${kind}` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    win.el.append(
      h(
        'div',
        { class: 'acx-calc' },
        group('Reports', ...checks, h('div', { class: 'btns' }, h('button', { onclick: () => (MODULES.forEach(([n]) => (pick[n] = true)), win.sync()) }, 'Select all reports'))),
        h('div', { class: 'btns' }, h('button', { onclick: () => preview(false) }, 'Preview'), h('button', { onclick: () => preview(true) }, 'Print')),
        group('Export', h('div', { class: 'row' }, h('label', {}, 'Format'), fmtSel), h('div', { class: 'btns' }, h('button', { onclick: exportFile }, 'Export to disk file'))),
      ),
    );
    win.refresh = () => win.sync();
    win.print = (names) => {
      for (const [n] of MODULES) pick[n] = names.includes(n);
      win.sync();
      preview(false);
    };
  });

  makeWindow('about', 'About Acoustic X (classic)', { w: 400, h: 230, foot: false }, (win) => {
    win.el.append(
      h(
        'div',
        { class: 'about' },
        h('p', {}, h('b', {}, ACX_LABEL)),
        h('p', {}, 'Modal response, speaker boundary interference, ray tracing and reverberation time, laid out the way the 1997 Windows 95 program (Acoustic-X Release 1.0; reviewed in Sound On Sound, December 1998) laid them out.'),
        h('p', { class: 'muted' }, "Not Pilchner-Schoustal's software: every number here is computed by ACOUSTICS.LIKE.AUDIO's own acoustics, from the room being designed. The arithmetic is in Documentation/acoustic-x."),
        h('div', { class: 'btns' }, h('button', { onclick: () => close('about') }, 'OK')),
      ),
    );
    win.refresh = () => {};
  });

  // ═════════════════════════════════════════════════════════════════════════
  // HELP — the documentation, Documentation/acoustic-x and /acoustics
  // ═════════════════════════════════════════════════════════════════════════
  const DOC_BASE = new URL('../../../Documentation/', import.meta.url);
  const HELP_FOR = {
    start: 'acoustic-x/01-using-acoustic-x.md',
    guide: 'acoustic-x/01-using-acoustic-x.md',
    reports: 'acoustic-x/01-using-acoustic-x.md#start-screen-fast-guide-reports',
    general: 'acoustic-x/02-general-parameters.md',
    modal: 'acoustic-x/03-modal-response.md',
    sbir: 'acoustic-x/04-sbir.md',
    rays: 'acoustic-x/05-ray-tracing.md',
    reverb: 'acoustic-x/06-reverb-time.md',
    calc: 'acoustic-x/07-calculator.md',
  };
  const HELP_TOC = [
    ['acoustic-x/README.md', 'Contents'],
    ['acoustic-x/01-using-acoustic-x.md', '1 · Using Acoustic X'],
    ['acoustic-x/02-general-parameters.md', '2 · General parameters'],
    ['acoustic-x/03-modal-response.md', '3 · Modal Response'],
    ['acoustic-x/04-sbir.md', '4 · Speaker Boundary Interference'],
    ['acoustic-x/05-ray-tracing.md', '5 · Ray Tracing'],
    ['acoustic-x/06-reverb-time.md', '6 · Reverb Time'],
    ['acoustic-x/07-calculator.md', '7 · Calculator'],
    ['acoustic-x/references/README.md', '8 · The suggested references, read'],
    ['acoustics/README.md', 'The acoustics engine — all of its math'],
  ];
  /** KaTeX, fetched the first time Help shows math; null if it cannot be had (the math then reads as TeX). */
  let katexP = null;
  function loadKatex() {
    katexP ??= new Promise((res) => {
      const css = h('link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css' });
      const js = h('script', { src: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js' });
      js.onload = () => res(window.katex ?? null);
      js.onerror = () => res(null);
      document.head.append(css, js);
    });
    return katexP;
  }
  let helpAt = 'acoustic-x/README.md';
  const helpBack = [];
  makeWindow('help', 'Acoustic X Help', { w: 860, h: 600, foot: false }, (win) => {
    const tocEls = HELP_TOC.map(([path, label]) => {
      const it = h('div', { class: 'item', onclick: () => showHelp(path) }, label);
      it.dataset.path = path;
      return it;
    });
    const page = h('div', { class: 'help-page' });
    const backB = h('button', { title: 'Back', onclick: () => helpBack.length && showHelp(helpBack.pop(), false) }, '◄ Back');
    const where = h('span', { class: 'small muted' });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'help-toc scroll' }, tocEls), h('div', { class: 'acx-right' }, h('div', { class: 'btns', style: 'margin:0' }, backB, h('button', { onclick: () => showHelp('acoustic-x/README.md') }, 'Contents'), where), h('div', { class: 'scroll help-scroll' }, page))));
    page.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-href]');
      if (!a) return;
      e.preventDefault();
      const href = a.dataset.href;
      if (href.startsWith('#')) return page.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView();
      const url = new URL(href, new URL(helpAt.split('#')[0], DOC_BASE));
      if (url.href.startsWith(DOC_BASE.href) && /\.md$/.test(url.pathname)) showHelp(url.href.slice(DOC_BASE.href.length));
      else window.open(url.href, '_blank', 'noopener');
    });
    async function showHelp(path, remember = true) {
      const [file, hash] = path.split('#');
      if (remember && helpAt !== path) helpBack.push(helpAt);
      helpAt = path;
      for (const t of tocEls) t.classList.toggle('on', t.dataset.path === file);
      where.textContent = `Documentation/${file}`;
      backB.disabled = !helpBack.length;
      let md;
      try {
        const r = await fetch(new URL(file, DOC_BASE));
        if (!r.ok) throw new Error(`${r.status}`);
        md = await r.text();
      } catch (err) {
        page.replaceChildren(h('p', { class: 'warn' }, `This help page could not be loaded (${err.message}). The chapters are in the repository under Documentation/${file}.`));
        return;
      }
      page.innerHTML = renderMarkdown(md);
      standIn(page);   // the chapter's tables are APKTables before its math is typeset
      page.parentElement.scrollTop = 0;
      if (hash) page.querySelector(`[id="${CSS.escape(hash)}"]`)?.scrollIntoView();
      const math = page.querySelectorAll('.math');
      if (!math.length) return;
      const katex = await loadKatex();
      if (!katex) return page.classList.add('tex');
      for (const el of math) {
        try {
          katex.render(el.dataset.tex, el, { displayMode: el.classList.contains('display'), throwOnError: false });
        } catch {
          /* leave it as TeX */
        }
      }
    }
    win.showHelp = showHelp;
    win.refresh = () => {};
  });
  /** Open Help at a chapter (or where it was). */
  function openHelp(path) {
    open('help');
    wins.help.showHelp(path ?? helpAt, Boolean(path));
  }


  return { MODULES, GUIDE, HELP_FOR, openHelp };
}
