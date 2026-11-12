# Delivery — EDITORS.Acoustic.Like.audio

← [Wiki home](../README.md)

**No build step.** Plain ES modules, published as they are.

| Where it lands | How |
|---|---|
| **https://likedotaudio.github.io/APK.softapp.EDITORS.Acoustic.Like.audio/** (live, 200 on 2026-10-30) | `.github/workflows/deploy.yml`, on every push to `main`, nightly at 06:17 UTC and on dispatch: checks out the CAD, runs `npm test` with `CAD_CONTRACT_DIR` pointed at it (a failure stops both deploys), then lays out `_site/` from `index.html`, `css/`, `js/`, `LICENSE` and `Documentation/`, copies the CAD repo's tracked `dist/` in as `cad/`, copies `js/site.published.js` over `js/site.js`, runs `scripts/smoke-frame.mjs _site`, and deploys to GitHub Pages |
| **https://acoustics.like.audio/** (live, 200) | the same workflow's `ftps` job syncs `_site/` to the Varial account (secrets `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`; variable `FTP_SERVER_DIR`) |
| **https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.Acoustic.Like.audio/index.html** (live, 200) | the APK.audio monorepo's FTPS job (`.github/workflows/ci.yml`) uploads the checkout when this submodule's pointer is bumped (`.apk.scripts/deploy_all.py`) |
| the rig, `/APK:Softapps/EDITORS/EDITORS.Acoustic.Like.audio/` | baked into the **WEB.Frontend-Assets** image with the rest of `PODS/POD.THIN/Softapps`; rebuild that stack after an edit |

The nightly run is how a CAD change reaches the github.io and acoustics.like.audio copies: the CAD is pulled fresh each time. The custom domain `acoustics.cad.like.audio` is switched off until its DNS exists (steps in the repo README, *Hosting*). The 1997 Acoustic-X manual (`Documentation/acoustic-x/manual-1997/`) is git-ignored and never published.

**Tested:** `npm test` in the deploy workflow's build job, ahead of both publishes, and by hand (289 passed, 2026-10-31); `npm run smoke:frame` (the framed CAD is there and speaks host@1) in the same job on `_site/`, and by hand on the tree. `.apk.scripts/smoke.py` checks that HEAD is pushed and the apk.audio page answers 200 ([SMOKE](../%F0%9F%A7%A9Manual%20and%20Artifacts/SMOKE.md)).

**Not automated:** nothing runs the published page in a browser (the frame smoke reads the files, it does not execute the CAD); the WEB.Frontend-Assets rebuild is by hand.

## Delivered 2026-10-31: portable file names (no `:` `|` or case twins)

- The monorepo now checks out on Windows and macOS: no tracked name holds `<>:"|?*`, a trailing dot or space, a device name or a case-only twin. Colon folders became dot folders (the POD.x convention).
- `vendor/apk-contracts/` re-synced: the bundled topic grammar names its producer `PLUGIN.CHROMECAST/SRC/Discovery.ChromeCast/src/lib.rs`. No behaviour change.

## Delivered from the 2026-10-30 audit

- **Contract test against the CAD's published host@1** — `tests/cadContract.test.mjs`: `HOST_PROTOCOL` equals the schema's, every message `cadLink.js` sends (all its methods, driven over a fake window) validates as `toCad.<type>` with `vendor/cad.like.audio/contract/validate.mjs`, every `toHost` sample reaches its callback, a foreign protocol is not heard, and the vendored copy is byte-compared with the CAD's `contract/` (sibling checkout, or `CAD_CONTRACT_DIR` — the deploy workflow now gets the CAD before `npm test` and sets it). `tests/session.test.mjs` fakes the CAD with the published geometry sample instead of a hand-made message. Verified: `npm test` 281/281.
- **Protocol no longer restated** — the schema and samples come from EDITORS.CAD.Like.audio `contract/host@1/` (vendored unchanged); the README's message table is replaced by a pointer to `host.schema.json`; `HOST_PROTOCOL` stays a string (no JSON modules without a build step) and is held to the schema by the test (PRINCIPLES.md).
- **Catalogue URL is one config point, and the published site has a catalogue** — `js/site.js` names `catalogue` relative to the page; `js/ui/rackPanel.js` no longer climbs five directories from its module. The deploy copies the APK.audio repo's `PODS/POD.THIN/OS/BIM/parts.json` (sparse checkout) to `catalogue/parts.json`, named by `js/site.published.js`, so racks have their catalogue on acoustics.like.audio. Verified: `npm test`, `npm run smoke:frame` on a laid-out site.
- **CAD iframe URL is the same config point** — `index.html`'s iframe has no `src`; `js/main.js` sets it from `SITE.cad` plus the protocol's `#/drawing?host=acoustic`. The deploy's `sed` + `grep -q` are gone: it copies `js/site.published.js` over `js/site.js`. Verified: workflow YAML parses; `tests/cadContract.test.mjs` checks the published config never climbs out of the site.
- **Frame smoke** — `scripts/smoke-frame.mjs` (`npm run smoke:frame`) follows `js/site.js` to the CAD page and its bundle and passes only if it carries `cad.like.audio/host@1`; runs in the deploy after the site is laid out. That the bridge then answers `ready` is proved by both repos' contract tests on the same samples. Showing it in the generated SMOKE.md is a root `.apk.scripts/smoke.py` change (handoff filed). Verified: passes on the tree and on a laid-out `_site` copy.

Part of a bigger app: the `Design` group tile in APK:OS (baked by WEB.Frontend-Assets), built on the EDITORS.CAD.Like.audio bundle. Version 1.1.0.
- **WS-07 brand accent from the tokens** (from the SDK/contracts audit) — `vendor/apk-contracts/` (`apk-tokens.css`, `apk-contracts.mjs`; copied by `.apk.scripts/vendor_contract_web.py`, held by its `--check`) replaces the 18 `#f4902c` / rgb-triple literals: `css/app.css` `--accent: var(--apk-accent)` and `rgba(var(--apk-accent-rgb), a)`; canvas and SVG code reads `ACCENT` / `accentA()` from the new `js/brand.js`. `index.html` links the token sheet; the deploy copies `vendor/apk-contracts/` into the site. `tests/brand.test.mjs` fails if a literal comes back. Verified: `npm test` 283/283, `vendor_contract_web.py --check` (this copy ok).
- **WS-04 parts catalogue not reached across the repo boundary** (from the SDK/contracts audit) — delivered in the item above ("Catalogue URL is one config point"): no module climbs the tree; the catalogue is a URL the host names in `js/site.js`, and the published site carries its own copy. Final round: `js/site.js` now names WEB.OsApi's `GET /api/bim/parts` (W05) rather than the OS file or its gateway URL, so nothing here encodes the OS's layout; without OsApi (a static host) the fetch fails and racks are typed in by hand, as before.
- **Parts catalogue vendored** (a4ca3df) — the monorepo went private, so the deploy's sparse checkout of APK.audio for `OS/BIM/parts.json` got Not Found and every deploy failed; the catalogue is now `vendor/bim/parts.json`, laid out from this repo, and `tests/vendor-parts.test.mjs` holds it byte-equal to the OS source whenever the monorepo is around. A catalogue change reaches the published site only after the vendored copy is refreshed.
- **Pop-out is a CAD-to-CAD handover** (3a6fb19, LOOSE-acoustic-popout-readback) — `popOut()` opens the CAD at `&resume&handover=<token>` and sends the docked CAD `handover { token }`; the two CADs pass the drawing themselves and the iframe is blanked once the window says `ready`. No `session()` read-back. The vendored host@1 contract is re-copied from EDITORS.CAD.Like.audio 1.2.0 (ac4a657).
- **Dock-back is the same handover** (0c2a068, LOOSE-acoustic-dockin-autosave) — `dockIn()` sends the window `handover { token }`, reloads the iframe at `&resume&handover=<token>` and closes the window only on the iframe's `ready`, so edits since the last autosave come back; a window closed by hand still docks from the autosave. Verified: `npm test` 289/289 (2026-10-31).

## Delivered 2026-11-11 – 2026-11-12

From this repository's own commits (the commit message is the record):

- vendor: apk-contracts web bundle refreshed from contracts/generated/web (report.ts: LogLine + ProblemRecord, System/Problems family) (`4ed208a`)
- vendor/apk-softapp: re-vendored — every problem card is reported through the SDK (ROAD-3695 step 2) (`ecc9c66`)
- vendor: apk-contracts web bundle refreshed from contracts/generated/web (five report codes, ROAD-3695; unit-gate, ROAD-3684) (`d1eabe4`)
- re-vendor apk-contracts web bundle: contracts 2.4.0 retires APK.audio/Tests/{suite} (ROAD-3729) (`d154b67`)
- wiki: lanes, README and smoke result refreshed (wiki.py + smoke.py) (`cba1703`)
- docs(smoke): pass — results in the wiki (`efc7c23`)
- acoustx/database.js: the Acoustic X tables move to acoustx/data/ (ROAD-3752) (`8ca5cc2`)
- acoustx/acoustx.js: createAcousticX cut into its windows (ROAD-3752) (`4f1487e`)
- ui/inspector.js: createInspector cut into its tabs (ROAD-3753) (`fb6d327`)
- views/plan.js: the plan's draw helpers, Walls mode and pointer work move out (ROAD-3753) (`c825a47`)
- vendor: CAD host contract host@1 2.14.0 (the byte-for-byte test failed, which stopped the deploy — ROAD-3669) (`6a3f1ed`)
- deploy: drop the retired catalogue/parts.json copy (vendor/bim went in 28e89df; the leftover step stopped the deploy — ROAD-3669) (`2d3361c`)
- deploy: ship vendor/apk-table and vendor/apk-softapp too — index.html loads both, and the published page 404'd apk-table.css/.js (found deploying under apk.audio/sites/, ROAD-3669) (`88de9ca`)
- Rack items keep the bench unit they are (device {ref, guid, key, name}): the only one of the part, else the row asks which, from the bench's own devices (ROAD-3727) (`7bccdac`)
- main.js: the toolbar, the width lanes, the room library, the CAD layers, the tour, sessions and the wizard become parts (ROAD-3753) (`5eaf32c`)
- cad/marks.js: one module per drawing (ROAD-3753) (`d7cec36`)
- vendor: apk-contracts re-vendored (contracts gained the youtube_audio problem codes, root f013ba68a) (`506605e`)
- vendor/apk-contracts: refresh to contracts/generated/web after ROAD-3759 (contracts split; CHAT_TOPIC origin note) (`285c4e7`)
- vendor: apk-softapp / apk-table re-joined from their parts (one GENERATED banner line; ROAD-3762) (`ed85c7f`)

## Releases
- **Released `2.0.0`, tag `v2.0.0`** (2026-11-01, ROAD-3452, the owner's V2) — no SDK pin; every manifest says 2.0.0; GitHub release `v2.0.0`.
