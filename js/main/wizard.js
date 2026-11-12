// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTICS.LIKE.AUDIO — the wizard: room, things, system, walls, go.
 * Lifted out of main.js (ROAD-3753) and run at the same point of its start-up:
 * `app` is the page's shared context — what main.js holds, and what the other parts return.
 */
import { createWizard } from '../ui/wizard.js';
import { grabBag, ROOM_LIBRARY } from '../acoustics/roomLibrary.js';
import { LAYOUTS, NO_LAYOUT, setOf, SPEAKER_SETS } from '../acoustics/layouts.js';

export function startWizard(app) {
  const { acx, drawnNothing, engine, inspector, jumpTo, meters, store } = app;
  // the other parts' functions, looked up when called
  const drawRoom = (...a) => app.drawRoom(...a);
  const startSweep = (...a) => app.startSweep(...a);

  // ------------------------------------------------------------------ the wizard: room, things, system, walls, go
  const wizard = createWizard({
    store,
    engine,
    rooms: ROOM_LIBRARY,
    act: {
      drawRoom,
      dice: () => grabBag(store.state.settings.lastLibraryRoom),
      drawOwn: () => {
        store.setMode('pick-wall');
        jumpTo('plan');
      },
      openFile: () => document.getElementById('openSession').closest('label').click(),
      openFloorPlan: () => document.getElementById('openFloorPlan').closest('label').click(),
      // the toolbar's own furniture buttons, so a piece is armed exactly as the fold arms it
      furniture: () => [...document.querySelectorAll('#furniture button[data-arm]')].map((b) => ({ id: b.dataset.arm, label: b.textContent, title: b.title })),
      arm: (id) => document.querySelector(`#furniture button[data-arm="${id}"]`)?.click(),
      seat: () => place('place-mic', 'mic', 'mixer'),
      mic: () => place('place-mic', 'mic', 'cardioid'),
      byHand: () => place('place-speaker'),
      sets: () => Object.entries(SPEAKER_SETS).map(([k, set]) => ({ k, title: set.title, presets: [{ id: NO_LAYOUT, label: 'Nothing in this set', text: 'Empty' }, ...set.presets.map((id) => ({ id, label: LAYOUTS[id].label }))] })),
      // the arrangement bar's own buttons: the preset picked on its row, then that row's Place
      system: (k, preset) => {
        const row = document.querySelector(`#arrangement .speakerSet[data-set="${k}"]`);
        row?.querySelector(`button[data-preset="${preset}"]`)?.click();
        // nothing in this set: its arranged boxes go, the boxes placed by hand stay
        if (preset === NO_LAYOUT) store.replaceSpeakers(store.state.speakers.filter((s) => !s.role || setOf(s) !== k));
        else row?.querySelector('button[data-place]')?.click();
      },
      pickWall: () => {
        store.setMode('pick-wall');
        jumpTo('plan');
        inspector.show('Inspect');
      },
      go: ({ view, method, trace, meters: kinds, sweep: sweepToo, report }) => {
        store.setSettings({ view, method });
        if (trace) store.setShow({ trace: true });
        // the graphs hidden by 📈: shown again by it, so it remembers
        if (document.body.classList.contains('meters-hidden')) document.getElementById('graphsBtn').click();
        for (const k of kinds) meters.open(k);
        if (sweepToo) startSweep();
        if (report.length) acx.report(report);
      },
      closed: () => {
        if (drawnNothing(store.state.cad.geometry)) drawRoom(grabBag(store.state.settings.lastLibraryRoom));
      },
    },
  });
  function place(mode, kind, preset) {
    if (kind) store.setPlaceKind(kind, preset);
    store.setMode(mode);
    jumpTo('plan');
  }
  document.getElementById('wizardBtn').addEventListener('click', () => (wizard.isOpen ? wizard.close(false) : wizard.open(drawnNothing(store.state.cad.geometry) ? 0 : 1)));

  return { wizard };
}
