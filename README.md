# EDITORS.Acoustic.Like.audio

> 🔊 **ACOUSTICS.LIKE.AUDIO** (`index.html` title; the repo keeps the name `EDITORS.Acoustic.Like.audio`): room acoustics built on [CAD.Like.audio](../EDITORS.CAD.Like.audio). The CAD supplies the plan. This app adds the room on top of it and around it.
>
> 📚 **Wiki:** [Documentation/README.md](Documentation/README.md) — principles, architecture, delivery.

---

## What it does

- **The plan is the CAD.** CAD.Like.audio runs live in the plan tile, opened as `#/drawing?host=acoustic`. You draw the room there as a closed loop. Everything acoustic is drawn as an overlay on that sheet and follows it as you pan and zoom.
- **📂 Open ▾: a project, or a floor plan.** *Open project* brings back a saved `.acoustic-session.json`: speakers, mics and settings, and the name of the CAD drawing they sit on. The drawing itself is the CAD's to save and open; the session never holds a copy of it (an older file that does hands it to the CAD once). *Open floor plan* starts a new room layout from a plan. A `.dxf` becomes the drawing, in its own units (mm when it names none). An image goes under a cleared sheet, and you trace the walls over it after clicking two points whose distance you know. Nothing from the last room comes with it: the first room loop on the sheet is furnished and seated as a library room is, and the toolbar's speaker arrangement is placed around the new mix seat. The settings and speaker sets are kept. Both ask for the placebo licence key first, as the 1997 program did.
- **The walls are in the CAD too.** Click an elevation tile and the CAD jumps to that wall's drawing: the same file, on its own layer (`Elevation Front`, `Back`, `Left`, `Right`). A wall not drawn yet is seeded with the room's current outline, under the plan. Drag it into a sloped ceiling, a raked floor or a vault. The room becomes the plan extruded and cut by every elevation drawn: the ceiling is the lowest any of them allows there, the floor the highest. Volume, surface areas and RT are integrated over that real shape. Image sources and modes stand in with the mean floor and ceiling height. Click the ceiling tile (or ⌂ Plan) to jump back.
- **Six drawings or a 3-D room.** The plan is extruded to a ceiling height, with a front direction you choose. That gives the plan (a slice at ear height) plus the reflected ceiling and the front, back, left and right elevations. The 3-D view is a cut-away. Every surface is painted with its sound field.
- **Sources and receivers.**
  - Speakers come as studio monitors, 90×50 and 60×40 projection horns, or subs. Each can be free-standing, flush/soffit, in a corner or in a trihedral corner.
  - A speaker is specified like a datasheet: sensitivity (1 W / 1 m), amplifier watts, max SPL and frequency range (−10 dB points). Its level at 1 m is sensitivity + 10·log10 W, held at max SPL; the range rolls off every method's low and high bands. Switch Drive to *SPL at 1 m* to set the level directly. The advisor warns when a box is driven past its max SPL or the band being viewed is outside its range.
  - Mics range from omni to figure-8, and one of them is the mix position.
  - Place them on the plan and set their height by dragging in an elevation.
- **Equipment racks, U by U.** A rack (600×800, a deep 600×1000 or a wide 800×1000) is counted in U, 44.45 mm each, U1 at the bottom. Select one to fill it. Gear comes from the bench's parts catalogue (`OS/BIM/parts.json`: its U, and its depth where the manual gives one) or is typed in by hand. The inspector draws the rack's front, with the free spaces hatched, and its side, where each piece is as deep as it really goes: its chassis behind the front rail plus the cables behind that, against the rails' depth. Clashes, gear off the top, gear too deep and missing depths are all flagged. The rack stands as tall as its U, and the elevations draw it from what it holds. Front-on they hatch and name the free runs; side-on they give each depth.
- **A system schematic.** The signal flow is drawn into the CAD on its own `Schematic` layer, with a sheet tab of its own. It runs from the playback and the noise generator, through the monitor controller and a bus per speaker set, to a channel strip per box (trim, delay, polarity, mute and solo, a sub's low-pass) and then the box itself, model and drive. The measurement mics go into the inputs, and every rack is listed U by U. It is drawn again whenever a box, a set or a rack changes. Treatments → *Drawn into the CAD* turns it off.
- **Symmetry is the CAD's mirror.** L/R pairs stay reflected across the CAD's Virtual Mirror. Moving one moves its twin. The app keeps no centre line of its own.
- **Three methods side by side.** The idea is borrowed from CHORAS; no code was taken from it.
  - *Wave:* image sources with phase. Interference, SBIR and boundary gain all come out of it.
  - *Scattering:* a bounce off a surface keeps (1−α)(1−s) as a mirror reflection and scatters (1−α)·s. Image sources carry only the mirror part, so a diffuser fades its wall's reflections from the field and the early-arrivals list. The echogram returns the scattered energy as a diffuse tail, starting at each arrival and decaying at the Eyring rate. Total energy and T30 are unchanged; C50, C80 and D50 fall and Ts rises.
  - *Energy:* direct plus diffuse sound per octave band.
  - *Modal:* the modes of the working-space box.
- **Meter bridge.** For the monitored mic:
  - SPL (dBZ/dBA) and an octave RTA
  - Frequency response with axial, tangential and oblique modes marked under it. Click it to tune the field to that frequency.
  - Echogram with its Schroeder decay
  - ISO 3382 parameters: EDT, T20, T30, C50, C80, D50, Ts, ITDG and D/R
  - RT60 per band against the EBU Tech 3276 window
  - Polar plots
  - ▶ Listen, which plays a clap through the estimated impulse response
- **Division lines and regions.** Draw division lines across a wall's elevation, and each bay between them is a region: with a finish armed, click a bay to paint it. A product follows the palette's *Products* switch: **Place** one block where you click, **Fill** the bay with it, or **Tile** it at true size, as many as fit whole. Each wall's regions are tagged on its elevation (F1, F2 … on the front; B, L, R on the others), and a **finish schedule** goes beside it: what each is, how it was laid, its size and stretch from the wall's centre line in mm, area, α at 125 / 500 / 2k and s, and the base finish over the rest.
- **🧱 Wall — one wall planned on a page of its own.** The Wall tab beside 6 views puts the CAD's plan next to one wall (Front · Back · Left · Right, or whichever elevation the CAD is on): its elevation split by the division lines, each region hatched by what it is and tagged, dimensioned in mm from the brass marker's centre line, with a section callout on every built region; a key plan showing where the wall is split; the selected region — pick another finish or product and it is repainted where it lies in the CAD; the finish schedule; a stud section of every build (D1, D2 …: the wall's own construction behind, a 45 mm stud at each division line, the build between, its face, its edges from the centre line); the wall build itself, studs at 600 mm centres; and the numbers — transmission loss per octave of the build and of the wall with its glass (area-weighted τ, rated on the STC contour), the level on the house side when the wall is shared, and the absorption of every region and of the wall against the room's.
- **Symmetry, as you define it.** The Symmetry tab: the side walls matched (the leading wall's regions and division lines drawn mirrored onto the other, the same distance from the front), and the front and back walls each mirrored about their own centre line, either half leading. The copies are real palette fills, so the room hears them, and the finish schedule lists them as *mirrored*. Built regions also get **detail callouts**: a section line and bubble on the elevation, and DETAIL Dn drawn true size under the schedule.
- **A layer per thing, from the brass marker.** The app draws the room into the CAD as slices, one layer each, so each can be shown, hidden and edited alone: `Brass marker` (the plan's middle — every slice gives positions in mm from it), `Plan · Ceiling` and `Plan · Floor heights` (spot heights), `Plan · Speakers`, `Plan · Placement` (mics and seats), one `Plan · <furniture>` per kind (what + Couch, + Console … place lands there too), one `Wall n · FACE` per wall, and one `Absorption · <material>` per absorbing material found, outlined where it is painted.
- **Finishes and products painted in the CAD.** Every material carries octave-band absorption and scattering. The app sends them to the CAD as a palette, with fixed-size products (a 600×600 QRD, 1200×600 panels, a door, a window). A fill or block on an elevation layer lands on that face's walls, split across a splayed face and clipped to the wall's floor and ceiling. On the `Ceiling` layer it lands on the ceiling, and anywhere else on the floor. Each surface then carries the area-weighted mix (`js/acoustics/patches.js`).
- **Acoustic groups.** The **Inspect** tab shows the model as one tree with the four kinds of input an acoustics model takes. **Room** lists the walls, with the floor area, height and volume. **Surfaces** shows each one's α (with s on hover); click a surface for its band-by-band table. **Sources** has one branch per speaker set A, B and C, and the set that is sounding is highlighted. **Receivers** lists the mix seat first, then the listening tiers, then the measurement mics. A branch you fold stays folded. The Transducer picker uses the same Sources and Receivers branches. On the bar, ＋ Speaker, ＋ Mic and ＋ Furniture sit together in the middle, apart from ✋ CAD and ▭ Walls.
- **Treatments where you can see them.** Placed treatments are drawn on their elevation, on the reflected ceiling and in 3-D; click one to inspect it. The **Treatments** tab lists them (α per band, s, area, the absorption each adds), **Room** shows every surface's base material, % treated and effective α/s, and **Materials** is the catalogue behind the palette. Click the ceiling tile to treat the ceiling: the CAD shows the plan with the `Ceiling` layer current, so clouds and tiles land overhead.
- **Advisor.** Checks the 38 % rule and modal nulls at (2k−1)/2n of L, W and H, ear height at 38–42 % of H, acoustic axis to the ears, a woofer at half height, critical distance, SBIR (c/4d), flutter between parallel surfaces that are both hard and flat at 500 Hz–1 kHz (a splay of 1 in 20 cures it), and the AcousticRooms source-spacing rules. It also checks the literature's treatment criteria: an absorbent wall behind each free-standing box, something rated below 125 Hz for the bass, no porous absorber under 76 mm and no corner foam passed off as a bass trap, diffusion as well as absorption, side-wall diffusers from 305 mm under the ears to 914 mm over, carpet on 1.36 kg/m² felt, constant directivity, the seat's lateral energy fraction, a reflection-free zone (nothing louder than −20 dB in the first 20 ms), and what a sub puts through a shared wall at 31 and 63 Hz.
- **Several subs, tuned together.** The Subs tab keeps every sub where you put it and sets each one's delay, gain and polarity so their modes cancel across the seats. It then fits one cut-only EQ shared by all of them, and **Apply** writes the settings onto the subs.
- **A measured impulse response.** Load a WAV measured at the mix seat on the Advisor tab. It is read with its ETC, T30 per octave beside the model's RT60, the gated (pseudo-anechoic) response valid above 1/gate, 1/24-octave resolution, and the resonances with their Q.
- **Layouts.** 2.0, 5.1, 5.1.4, 7.1.4 and 9.1.6, placed around the mix position. Each is checked against the ITU-R BS.2051 reference angles, with the delay and trim needed to align it. Certification remains the Dolby Atmos Room Design Tool's job.

## How it talks to the CAD

The CAD is in an iframe. The CAD's `src/shell/hostBridge/` and `js/cad/cadLink.js` talk over same-origin `postMessage` using the protocol `cad.like.audio/host@1`.

The protocol is not restated here: the CAD publishes it as `contract/host@1/` (a JSON Schema with one sample of every message, both ways), and this repo vendors that directory unchanged as `vendor/cad.like.audio/contract/`. Read `host.schema.json` for every message and field. `tests/cadContract.test.mjs` proves `cadLink.js` against it — every message sent validates, every CAD sample reaches its callback — and fails when the vendored copy drifts from the CAD's own (in a monorepo checkout, and in CI after "Get the CAD"). To take a new CAD contract: `cp -r ../EDITORS.CAD.Like.audio/contract/host@1 ../EDITORS.CAD.Like.audio/contract/validate.mjs vendor/cad.like.audio/contract/`.

**Pop out.** `⇱ Pop out` on the plan tile moves the CAD into its own window (handy on a second screen). Then the bridge runs over `window.opener` instead of the iframe. The address gains `&resume&handover=<token>`: the docked CAD hands the new one its drawing directly, CAD to CAD (falling back to the autosave if it does not answer), and the iframe goes blank only once the window has it. Docking back restores from the autosave. Only one CAD is open at a time. While the CAD is out, the plan tile draws the room's walls itself, and speakers and mics can still be placed and dragged there. `⇲ Dock`, or closing the window, brings the CAD back.

The CAD never reads this app's state: what the app asks of it is drawn (`marks`, `place`) or answered (`session`), and nothing in the CAD depends on the app being there. The overlay is saved in the browser per CAD file name. It can be exported as JSON, and positions can be exported in the AcousticRooms metadata shape.

## Hosting

Published by `.github/workflows/deploy.yml` on every push to `main` and nightly, once `npm test` has passed: to GitHub Pages, and over FTPS to the Varial account that serves https://acoustics.like.audio/ (secrets `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`; variable `FTP_SERVER_DIR`). The CAD's tracked `dist/` is copied into the site as `cad/` and the APK.audio repo's `PODS/POD.THIN/OS/BIM/parts.json` as `catalogue/parts.json`, and `js/site.published.js` is copied over `js/site.js` — the one file that says where the CAD and the catalogue are — so the bridge stays same-origin and racks have their catalogue; a CAD or catalogue change shows up on the next run. `npm run smoke:frame` (also a deploy step, on `_site/`) proves the framed CAD is there and speaks host@1.

**Live now:** https://likedotaudio.github.io/APK.softapp.EDITORS.Acoustic.Like.audio/

> **Note:** the custom domain `acoustics.cad.like.audio` is switched off until its DNS is in place. GitHub redirects the github.io address to the custom domain as soon as one is set, so setting it before DNS resolves breaks the link above. To switch it on:
>
> 1. At the `like.audio` DNS host (Varial Hosting), add a CNAME `acoustics.cad.like.audio` → `likedotaudio.github.io`.
> 2. Wait until `dig +short acoustics.cad.like.audio` answers with GitHub's addresses.
> 3. Set the domain: `gh api -X PUT repos/LikeDotAudio/APK.softapp.EDITORS.Acoustic.Like.audio/pages -f cname=acoustics.cad.like.audio`, then tick *Enforce HTTPS* in Settings → Pages once the certificate is issued.

## Layout

```
index.html        the page; the plan tile is an iframe of the CAD named in js/site.js, opened at #/drawing?host=acoustic
js/site.js        the one config point: where the CAD and the parts catalogue are (site.published.js on the published site)
js/main.js        wires the store, the CAD link, the views and the compute engine together
js/acoustics/     physics, no DOM: bands, materials, patterns, devices, room, elevations, patches, images, field,
                  analysis, layouts, symmetry, advisor, sbir, nulls, isolation, measure, multiSub, rack, windows, …
js/acoustx/       Acoustic X (classic): the 1997-style windows, their database (data.json) and the references
js/audio/         ▶ Listen: the echogram as an impulse response, a clap played through it
js/compute/       sample grids, the job, the field worker (a module Worker), the engine that schedules it
js/model/         the store: speakers, mics, sets, racks, undo
js/views/         plan overlay, ceiling + elevations, the Wall page, 3-D, colour map, glyphs, treatments
js/ui/            inspector (every parameter), meter bridge, rack panel, tour, wizard, licence, pop-out
js/cad/           the bridge client (cadLink.js) and what the app draws into the CAD (marks.js, schematic.js)
css/              app.css, acoustx.css
tests/            node --test: physics checked against closed forms, and the CAD contract (281 tests)
vendor/           cad.like.audio/contract/ — the CAD's published host@1 schema and samples, vendored unchanged
scripts/          smoke-frame.mjs — the framed CAD is there and speaks host@1
Documentation/    acoustics/ — the engine's mathematics, chapter by chapter; acoustic-x/ — Acoustic X and its references
```

No build step and no dependencies: plain ES modules, served as they are. The rack panel reads the bench's parts catalogue from where `js/site.js` says, (`/api/bim/parts` — WEB.OsApi's route over the OS's `BIM/parts.json` — on APK:OS; `catalogue/parts.json` on the published site); where there is none, that fetch fails and the catalogue is empty, so gear is typed in by hand. A few viewer preferences (reveal speed, graphs on/off, Acoustic X legacy mode) are kept in `localStorage`.

## Tests

```
npm test          # node --test tests/*.test.mjs — 275 tests, about 2 s, no install needed
```

The tests check the following against closed forms:
- flush mounting gives +6 dB
- SBIR notches at c/4d
- T30 reads back the Eyring RT, with or without scattering
- with s = 0 the image sources and the echogram are exactly as they were. With s = 0.9 on a wall, its image drops by √(1−s) and the echogram's total energy stays the same, while C80 falls and Ts rises. Bare parallel gypsum walls flag flutter, and a diffuser or an absorber clears it
- the modal sum peaks at the analytic eigenfrequencies of a rigid box (Tronci, *Computational Acoustics with Open Source Software*)
- the modal null sits at L/2
- 7.1.4 placement lands inside its reference windows
- mirroring is its own inverse
- a splay of 1 in 20 cures flutter and 1 in 40 does not; the wall behind each free-standing box gets a panel, an in-wall box none; side-wall diffusers span 305 mm under to 914 mm over the ears; thin and corner panels, a hard floor and an untrapped room are each called out; absorbing the side walls lowers LF; isolation carries 31 and 63 Hz down the mass law; tuned subs never move, never boost and score no worse; a synthetic impulse response reads back its T30 per octave, its gate and its 50 Hz mode
- the advisor flags a seat at half the length
- a patch on an elevation raises A by exactly area·Δα; it splits across a splayed face, clips under a sloped ceiling, lands on the floor or the `Ceiling` layer, and an unknown palette id is ignored
- a shed roof drawn in a side elevation gives V = L·W·mean height and the true sloped area; front and side elevations intersect; a seeded elevation reads back as the room it came from

## References

- AcousticRooms (facebookresearch, CC BY 4.0): material categories and source/receiver spacing
- CHORAS (choras-org, GPL-3.0): several methods compared side by side. Ideas only; no code was taken.
- ITU-R BS.775 / BS.2051: layout reference angles. Dolby Atmos Room Design Tool v6.9.0 release notes: L/C/R line, 5.1.4 rears at 135°.
- ISO 3382-1 for room parameters, ISO 9613-1 for air absorption, EBU Tech 3276 for listening-room RT.

## Documentation

- [`Documentation/acoustics/`](Documentation/acoustics/README.md) — what the engine computes: every module in `js/acoustics/` and `js/compute/`, its equations, assumptions and limits, and the function that implements each.
- [`Documentation/acoustic-x/`](Documentation/acoustic-x/README.md) — the Acoustic X windows, in the 1997 manual's chapter order, with the 26 reference summaries the 📖 pop-ups open (`js/acoustx/topics.js`). The published site carries `Documentation/` so the help opens there too.

## Philosophy

The ecosystem's rules for this app are written down in `Documentation/🏛Philosophy/Room Acoustics/` of the APK.audio repo. What the code itself follows:

- **The room is the drawing.** Geometry is the CAD's: walls, rooms, elevations and painted patches arrive on the `geometry` message (`js/cad/cadLink.js`), and the app draws its own results back into the CAD as layers (`js/cad/marks.js`, `js/cad/schematic.js`) rather than keeping a drawing of its own. Symmetry is the CAD's Virtual Mirror; `js/acoustics/symmetry.js` only mirrors devices about the axis the CAD reports.
- **Physics has no DOM.** Everything in `js/acoustics/` is pure functions over plain data, which is what lets `tests/` import it straight into node and `js/compute/fieldWorker.js` run it off the main thread.
- **Closed forms, then executed examples.** The tests check the physics against known answers (+6 dB flush, c/4d, Eyring T30, rigid-box modes), and the worked numbers in `Documentation/acoustics/` were produced by running the real functions.
- **Three methods, each in its range.** Wave, scattering, energy and modal answers are computed side by side (`js/acoustics/field.js`, `images.js`, `analysis.js`); the Schroeder frequency (`room.js` `schroeder`) is printed by the advisor as the border between them.
- **Fail loud, not plausible.** An unknown palette id becomes a warning, not drywall (`js/acoustics/patches.js`, `materials.js`); an empty parts catalogue leaves the rack to be typed in rather than guessed (`js/ui/rackPanel.js`).
- **Measurement outranks the model.** A WAV measured at the seat is read beside the model's RT60 (`js/acoustics/measure.js`).
- **Cite, never certify.** Layouts are checked against ITU-R BS.2051 angles (`js/acoustics/layouts.js`), and certification is left to the Dolby Atmos Room Design Tool.
- **No build.** Plain ES modules and `node --test`; `package.json` has no dependencies.

<!-- wiki:smoke -->
**Smoke test** — ✅ PASS 2/2 since 2026-10-30 12:51 EDT — [results](Documentation/%F0%9F%A7%A9Manual%20and%20Artifacts/SMOKE.md)
<!-- /wiki:smoke -->
