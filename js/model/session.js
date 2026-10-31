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
 */

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
