// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE SESSION FILE — this app's acoustics, and which CAD drawing they sit on.
 *
 * Rule 1 (the room is the drawing): the overlay never keeps a second copy of
 * the CAD's drawing. So a saved `.acoustic-session.json` holds the overlay
 * (speakers, mics, furniture, settings — store.exportDoc) and a REFERENCE to
 * the drawing, its CAD file name, and nothing of its geometry. The drawing
 * stays the CAD's to save and open; opening a session puts the overlay back
 * under that name, so the CAD opening the drawing finds it.
 *
 * Older files read too: a bare overlay (File → Export overlay), and
 * `session@1`, which carried the CAD's whole drawing. Its drawing is handed
 * to the CAD once (`handOver`) and never kept here.
 *
 * THE .IFC TWIN (owner, 2026-11-06: IFC and JSON are both stored). Saving
 * writes the session AND `<drawing>.ifc` — the designed room as IFC4X3_ADD2
 * (js/ifc/roomToIfc.js), built from the same overlay and the CAD's last
 * geometry. The IFC is built first: if it cannot be, neither file is written,
 * so a saved pair always agrees. Opening takes either: a session as before,
 * or an .ifc — ours read back whole, an architect's read for its room
 * (js/ifc/ifcToRoom.js).
 */

import { roomModel } from '../ifc/roomModel.js';
import { roomToIfc } from '../ifc/roomToIfc.js';
import { ifcToRoom } from '../ifc/ifcToRoom.js';

export const SESSION_FORMAT = 'acoustic.like.audio/session@2';
const SESSION_V1 = 'acoustic.like.audio/session@1';
const OVERLAY_FORMAT = 'acoustic.like.audio@1';

/** The file to save: the overlay plus the drawing's name — never the drawing. */
export function sessionDoc(overlay, drawingName, savedAt = new Date().toISOString()) {
  return { format: SESSION_FORMAT, savedAt, drawing: { fileName: drawingName ?? overlay?.fileName ?? null }, overlay };
}

/**
 * A parsed file as { fileName, overlay, handOver }: `handOver` is a legacy
 * session@1 drawing for the CAD to open, else null. Throws on anything else.
 */
export function readSession(doc) {
  if (doc?.format === OVERLAY_FORMAT) return { fileName: doc.fileName ?? null, overlay: doc, handOver: null };
  if (doc?.format === SESSION_FORMAT && doc.overlay) return { fileName: doc.drawing?.fileName ?? doc.overlay.fileName ?? null, overlay: doc.overlay, handOver: null };
  if (doc?.format === SESSION_V1 && doc.overlay) {
    const handOver = doc.cad && Array.isArray(doc.cad.docSnapshot?.edges) ? doc.cad : null;
    return { fileName: doc.cad?.currentFileName ?? doc.overlay.fileName ?? null, overlay: doc.overlay, handOver };
  }
  throw new Error('Not an acoustic.like.audio session file.');
}

/**
 * The files 💾 Save writes, both or neither: [{ name, type, text }] — the
 * session, then its .ifc twin. `geometry`/`mirror` are the CAD's last host@1
 * messages, `results` the engine's last numbers (roomModel resultsOf) or null,
 * `types` the speakers' BIM part types as the library gave them (none offline).
 */
export function sessionFiles({ overlay, drawingName, geometry = null, mirror = null, results = null, savedAt, types = {} }) {
  const base = (drawingName || overlay?.fileName || 'room').replace(/\.[^.]+$/, '');
  // the twin first: a room that cannot be written as IFC stops the save before anything is downloaded.
  // `types` {partId: .ifc text} (acoustics/speakerLibrary.js loadPartTypes): each speaker's own BIM type
  const ifc = roomToIfc(roomModel({ geometry, mirror, overlay, results }), { types });
  const doc = sessionDoc(overlay, drawingName, savedAt);
  return [
    { name: `${base}.acoustic-session.json`, type: 'application/json', text: JSON.stringify(doc) },
    { name: `${base}.ifc`, type: 'application/x-step', text: ifc },
  ];
}

/** Is this file text an ISO 10303-21 (STEP) file — an .ifc — rather than a JSON session? */
export const isStep = (text) => /^\s*ISO-10303-21;/.test(text);

/**
 * Any file 📂 Open takes: { kind: 'session', fileName, overlay, handOver } or
 * { kind: 'ifc', model, report } (model: roomModel.js shape, in mm).
 */
export function readProjectFile(name, text) {
  if (isStep(text) || /\.ifc$/i.test(name ?? '')) return { kind: 'ifc', ...ifcToRoom(text, { name }) };
  return { kind: 'session', ...readSession(JSON.parse(text)) };
}
