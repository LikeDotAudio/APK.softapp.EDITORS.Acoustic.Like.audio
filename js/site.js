// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHERE THIS PAGE FINDS WHAT IT DOES NOT CARRY — the one config point.
 *
 * What lives outside this repository: the CAD it iframes (same origin, or the
 * host bridge refuses it), named here, never in a module. This copy is the
 * APK.audio layout: the softapp served beside EDITORS.CAD.Like.audio. Rack gear
 * comes from the BIM library's own picker (js/bimLibrary.js, ROAD-3572). The published site
 * (acoustics.like.audio) ships `site.published.js` in its place — the deploy
 * copies it over this file, nothing is rewritten by pattern.
 */
export const SITE = {
  /** The CAD bundle; `#/drawing?host=acoustic` is added by main.js (that part is the protocol, not the layout). */
  cad: '../EDITORS.CAD.Like.audio/dist/index.html',
  /** The BIM library's picker (ROAD-3597): the copy published with the OS, by its root path, else apk.audio's. */
  picker: ['/APK%3AOS/system/bim/library/picker.js', 'https://apk.audio/APK%3AOS/system/bim/library/picker.js'],
  /** The bench the OS Simulation draws (apk.bim.bench/1): a rack item's unit is picked from its devices (ROAD-3727). */
  bench: '/api/bim/bench',
};
