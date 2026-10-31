// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE BRAND ACCENT, FROM THE CONTRACT — never spelled in this repo.
 *
 * `vendor/apk-contracts/` is the monorepo's generated browser contract
 * (contracts/generated/web), copied by `.apk.scripts/vendor_contract_web.py`
 * and held byte-identical by its `--check`. CSS reads `var(--apk-accent)` /
 * `rgba(var(--apk-accent-rgb), a)` from apk-tokens.css; canvas and SVG code
 * reads these.
 */
import { ACCENT } from '../vendor/apk-contracts/apk-contracts.mjs';

export { ACCENT };

const RGB = [1, 3, 5].map((i) => parseInt(ACCENT.slice(i, i + 2), 16)).join(', ');

/** The accent at alpha `a`, as an rgba() string. */
export const accentA = (a) => `rgba(${RGB}, ${a})`;
