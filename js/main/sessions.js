// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTICS.LIKE.AUDIO — sessions: this overlay and the name of the CAD drawing it sits on, saved and opened; an .ifc; a floor plan; the licence ask.
 * Lifted out of main.js (ROAD-3753) and run at the same point of its start-up:
 * `app` is the page's shared context — what main.js holds, and what the other parts return.
 */
import { loadPartTypes } from '../acoustics/speakerLibrary.js';
import { readProjectFile, sessionFiles } from '../model/session.js';
import { resultsOf, sessionFromModel } from '../ifc/roomModel.js';
import { badFile, showProblem } from '../ui/problem.js';
import { SITE } from '../site.js';
import { makeFold } from '../ui/fold.js';
import { askLicence } from '../ui/licence.js';

export function startSessions(app) {
  const { bimLibraryUp, cad, engine, status, store } = app;

  // ------------------------------------------------------------------ sessions: this overlay and the name of the CAD drawing it sits on (model/session.js)
  async function saveSession() {
    const drawingName = store.state.cad.geometry?.fileName ?? store.state.fileName ?? null;
    const overlay = store.exportDoc();
    // each speaker's own BIM part type, as the library has it (acoustics/speakerLibrary.js): offline, none
    const { types } = (await bimLibraryUp) ? await loadPartTypes(overlay) : { types: {} };
    let files;
    try {
      // the session and its .ifc twin, both or neither (model/session.js sessionFiles)
      files = sessionFiles({ overlay, drawingName, geometry: store.state.cad.geometry, mirror: store.state.cad.mirror, results: resultsOf(engine.out, store.state.settings), types });
    } catch (e) {
      showProblem('save_failed', { subject: drawingName ?? 'room', detail: String(e?.message || e), fix: ['Nothing was saved: the room could not be written as IFC.', 'File → Export overlay still downloads the overlay JSON.'] });
      return;
    }
    const name = (drawingName || 'room').replace(/\.[^.]+$/, '');
    const said = (where) => { status.textContent = `💾 saved ${name} — ${store.state.speakers.length} speakers, ${store.state.mics.length} mics, and its .ifc twin${where}; the drawing stays the CAD's to save`; };
    const [session, twin] = files;
    const S = globalThis.APKSoftapp;
    if (typeof S?.saveModel !== 'function') {
      files.forEach((f, i) => setTimeout(() => download(f), i * 300));
      said('');
      return;
    }
    // Save Model (FrontEnd/shared/apk-softapp.js, ROAD-3583): one folder picked once a
    // session, the .ifc first, then the session JSON — both or neither — else both download.
    S.saveModel(JSON.parse(session.text), { name: session.name.replace(/\.json$/i, ''), toIfc: () => twin.text }).then((r) => {
      if (r.ok) said(r.via === 'directory' ? ` (${r.files.join(' + ')})` : '');
      else if (!r.cancelled) showProblem('save_failed', { subject: name, detail: r.problem?.detail ?? r.problem?.title ?? 'Save Model failed', fix: ['Nothing was saved: try 💾 Save again, or pick another folder.'] });
    });
  }

  function download({ name, type, text }) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** An .ifc opened: its overlay adopted under its drawing name, its loops, walls, products and mirror handed to the CAD. */
  function openIfc(file, { model, report }) {
    const units = store.state.cad.geometry?.units ?? store.state.cad.view?.units ?? 'mm';
    const { fileName, overlay, cad: toCad } = sessionFromModel(model, units);
    app.pendingPlan = null;
    store.adopt(fileName, overlay);
    if (cad.link) {
      for (const s of toCad.sheets) cad.link.sheet(s.layer, { color: '#e5e7eb', seed: s.seed });
      const main = toCad.sheets.find((s) => s.main);
      if (main) cad.link.sheet(main.layer, { color: '#e5e7eb' });
      for (const l of toCad.lines) cad.link.walls({ op: 'add', a: l.a, b: l.b, layer: l.layer });
      for (const p of toCad.place) cad.link.place(p.layer, [p.item]);
      if (toCad.mirror) cad.link.setMirror(toCad.mirror.x, toCad.mirror.enabled);
    }
    const said = [
      report.own ? `📂 opened ${file.name}` : `📂 opened the room of ${file.name} (${report.schema})`,
      `${model.spaces.length} room${model.spaces.length === 1 ? '' : 's'}, ${model.speakers.length} speakers, ${model.mics.length} mics`,
      ...(toCad.fills ? [`${toCad.fills} painted finish${toCad.fills === 1 ? '' : 'es'} are in the file but not repainted — the CAD's own drawing holds them`] : []),
      ...(report.guessed.length ? [`materials guessed: ${report.guessed.map((g) => `${g.material} → ${g.as ?? 'none'}`).join(', ')}`] : []),
      ...(report.resultsStale ? ['its saved results are stale (the room changed after they were computed): recomputing'] : []),
      ...report.warnings,
    ];
    status.textContent = said.join(' · ');
  }

  async function openSession(file) {
    let session;
    try {
      session = readProjectFile(file.name, await file.text());
    } catch (e) {
      const again = () => document.getElementById('openSession').click();
      if (e && (e.name === 'NotReadableError' || e.name === 'NotFoundError')) showProblem('file_unreadable', { subject: file.name, detail: e.message, onRetry: again });
      else badFile(e, file, ['Open a project saved here with 💾 Save (a .acoustic-session.json file, or its .ifc twin), or an architect\'s .ifc room.'], again);
      return;
    }
    if (session.kind === 'ifc') return openIfc(file, session);
    const { fileName, overlay, handOver } = session;
    app.pendingPlan = null;
    store.adopt(fileName, overlay);
    // an old session@1 file carried the drawing: the CAD takes it, nothing here keeps it
    if (handOver && cad.link) cad.link.open(handOver);
    const onSheet = store.state.cad.geometry?.fileName ?? null;
    status.textContent = handOver || !fileName || fileName === onSheet ? `📂 opened ${fileName ?? 'session'}` : `📂 opened the acoustics of ${fileName} — open that drawing in the CAD to see them on it`;
  }

  /**
   * A floor plan as a new room layout: the CAD opens it under the file's name, and when its geometry
   * comes back under that name the overlay starts again (startPlan) — no speakers, mics or furniture
   * carried over from the last room, the settings and speaker sets kept. A DXF is the walls; an image
   * goes under a cleared sheet to trace them over. Either way the first room loop on the sheet is
   * furnished and seated as a library room is (pickDrawnRoom), and the toolbar's arrangement placed.
   */
  function openFloorPlan(file) {
    if (!cad.link) {
      showProblem('timeout', {
        subject: file.name,
        detail: 'The CAD in the plan tile has not started yet.',
        fix: ['Wait for the plan to draw, then Retry.', `If it never draws, check the CAD is served beside this app (${SITE.cad}).`],
        onRetry: () => openFloorPlan(file),
      });
      return;
    }
    app.pendingPlan = file.name;
    cad.link.floorPlan(file);
    status.textContent = /\.dxf$/i.test(file.name) ? `📐 opening ${file.name} as a new room layout…` : `📐 ${file.name} is under the sheet — draw the walls over it (▭ Walls)`;
  }

  document.getElementById('saveSession').addEventListener('click', saveSession);
  const openFold = makeFold(document.getElementById('openBtn'), document.getElementById('open'));
  // 📂 Open project and 📐 Open floor plan ask for a licence key first, as the 1997 program did. A placebo: any key, Enter, and the file picker opens.
  for (const [id, open] of [['openSession', openSession], ['openFloorPlan', openFloorPlan]]) {
    const input = document.getElementById(id);
    input.closest('label').addEventListener('click', (e) => {
      if (e.target === input) return;
      e.preventDefault();
      openFold.open = false;
      askLicence(() => input.click());
    });
    input.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) open(f);
      e.target.value = '';
    });
  }

  return { saveSession };
}
