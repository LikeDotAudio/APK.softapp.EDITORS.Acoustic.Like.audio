// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { angleDiff, DEG } from './geometry.js';
import { PRODUCTS } from './materials.js';

/**
 * THE CONSOLE SITS AT THE MIXER'S NOSE
 *
 * The console (or the desk a small room has instead) is the mixer's: it sits
 * square in front of their nose, its near edge `people` people clear of it,
 * and follows the seat wherever it moves or turns. A person is as wide as the
 * plan draws one across the shoulders; the nose is just ahead of the ears,
 * which is where a seat's position is.
 */
export const PERSON_M = 0.46;
export const NOSE_M = 0.15;

/** The pieces of furniture that are a mixer's console. */
export const isConsole = (paletteId) => /^(console|desk)-/.test(String(paletteId ?? ''));

/** A product's depth front to back, metres: the second of its [w, h]. */
const depthOf = (paletteId) => PRODUCTS.find((p) => p.id === paletteId)?.size?.[1] ?? 1;

/**
 * Where the console belongs for this seat: its centre { x, y } and its turn
 * (degrees CCW; 0 lays its width along x, as it is drawn).
 */
export function consoleSpot(mix, paletteId, people = 2) {
  const aim = mix.aim ?? 90;
  const d = NOSE_M + people * PERSON_M + depthOf(paletteId) / 2;
  const rotation = ((((aim - 90 + 180) % 360) + 360) % 360) - 180;
  return { x: mix.x + d * Math.cos(aim * DEG), y: mix.y + d * Math.sin(aim * DEG), rotation: +rotation.toFixed(1) };
}

/** The console the mixer sits at: of the consoles on the sheet, the nearest. Patches as engine.patchesFromCad gives them. */
export function consoleOf(patches, mix) {
  const near = (p) => Math.hypot(p.at.x - mix.x, p.at.y - mix.y);
  return patches.filter((p) => p.at && isConsole(p.paletteId)).sort((a, b) => near(a) - near(b))[0] ?? null;
}

/** Already where it belongs: within a millimetre and a tenth of a degree (a console turned half round is the same console). */
export function consoleSettled(patch, spot) {
  const turn = Math.abs(angleDiff(spot.rotation, patch.rotation ?? 0)) % 180;
  return Math.hypot(spot.x - patch.at.x, spot.y - patch.at.y) < 0.001 && Math.min(turn, 180 - turn) < 0.1;
}
