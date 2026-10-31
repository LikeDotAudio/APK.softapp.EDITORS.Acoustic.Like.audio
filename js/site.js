// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHERE THIS PAGE FINDS WHAT IT DOES NOT CARRY — the one config point.
 *
 * Two things live outside this repository: the CAD it iframes (same origin, or
 * the host bridge refuses it) and the bench's parts catalogue the rack panel
 * offers. Both are named here, never in a module. This copy is the APK.audio
 * layout: the softapp served beside EDITORS.CAD.Like.audio, and the catalogue
 * asked of WEB.OsApi's route `GET /api/bim/parts` (the OS's BIM/parts.json,
 * 503 when it is missing) — an API, not the OS's file layout, and never a path
 * that climbs out of this repository into the OS's files (Law 2). The published site
 * (acoustics.like.audio) ships `site.published.js` in its place — the deploy
 * copies it over this file, nothing is rewritten by pattern.
 */
export const SITE = {
  /** The CAD bundle; `#/drawing?host=acoustic` is added by main.js (that part is the protocol, not the layout). */
  cad: '../EDITORS.CAD.Like.audio/dist/index.html',
  /** The bench's parts catalogue, as WEB.OsApi serves it. Missing (503, or no OsApi on a static host) is fine: racks are then typed in by hand. */
  catalogue: '/api/bim/parts',
};
