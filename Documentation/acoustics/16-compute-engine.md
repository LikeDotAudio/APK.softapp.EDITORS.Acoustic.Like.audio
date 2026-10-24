# 16. The compute engine: grids, jobs and frames

Modules: `js/compute/engine.js`, `js/compute/compute.js`,
`js/compute/grids.js`, `js/compute/fieldWorker.js`.

This layer applies the methods of chapters 2–9 to sample grids and to a
response curve. It adds no acoustics of its own beyond the choices below.

## 16.1 From CAD to room (`engine.js`)

* `loopsFromCad(geometry)` converts every closed loop to metres
  (`METRES_PER_UNIT`), tags it with the elevation face its layer names, and
  computes its area. Plan loops must exceed 1 m² and elevation loops 0.1 m².
  Loops are sorted largest first.
* `roomsFromCad` keeps the plan loops. `elevationsFromCad` keeps the largest
  loop per elevation face.
* `openPlanFromCad(geometry, maxGap)` closes loose wall segments per plan
  layer with `planFromWalls` (chapter 2) and keeps the largest result over
  1 m².
* `patchesFromCad` converts patches to metres with their layer's name.
* `currentRoom()` uses the chosen loop, or else the open plan with its
  openings, or else a virtual $w\times l$ rectangle. It then calls
  `buildRoom`.

## 16.2 Sample grids (`grids.js`)

`buildGrids(room, sliceZ, res)` uses one square cell size on every surface:

$$
\Delta = \frac{\max(L, W, H_{\max})}{\text{res}}
$$

* **Plan slice** at height `sliceZ`. The engine passes the slice setting, or
  else the mix seat's height, or else 1.2 m, capped at $H_{\max} - 0.05$.
* **Floor** at $z$ = 0.02 m and **ceiling** at $H_{\max} - 0.02$ m. Under a
  slope, each point is instead 2 cm off the local floor or ceiling.
* **Walls**: $\lceil\ell/\Delta\rceil \times \lceil H_{\max}/\Delta\rceil$
  cells (at least 2 each), each sampled 2 cm inside the wall
  ($+0.02\,\hat n^{\text{in}}$).

`gridPoints(room, g)` returns interleaved $xyz$ cell centres. A point
outside the plan, or a wall/slice point outside the local floor–ceiling
span, is NaN, and is left unpainted. Rows run top-down so a grid drops
straight into `ImageData`.

While something is being dragged, the engine halves the resolution
($\max(16, \text{res}/2)$).

## 16.3 One job (`compute.js` `runJob`)

For one state of the room:

1. `prepare` (image sources to `settings.maxOrder`) and, when there are
   speakers, `prepareModal` at $\min(f, 1000)$ Hz (`MODAL_MAX`).
2. **Every grid point** takes one value, according to `settings.method`:
   * `energy`: `energyAt(...).total` in `settings.band`;
   * `modal`: `modalDb`;
   * otherwise: `waveDb` at `settings.freq`, with no microphone pattern.
3. **Every mic**: `micReport` (chapter 9).
4. **The monitored mic's response** at `RESPONSE_FREQS`, which are
   $20\cdot2^{i/24}$ Hz (1/24 octave) up to 17 kHz:
   * `wave`: `waveDb` with the mic's own pattern;
   * `modal`: `modalDb`, computed only up to
     $f_{\text{modal}} = \min\big(1000,\ \max(200,\ 1.5 f_S)\big)$
     ($f_S$ = Schroeder frequency) and NaN above;
   * `energy`: `energyAt` in the six bands;
   * `room`: with more than one seat, the weighted `powerMean` of every
     seat's wave response (chapter 13).

The modal grid above 1 kHz is evaluated at 1 kHz. The comment describes this
as showing "the field at this frequency instead", since the modal method is a
low-frequency model.

## 16.4 Scheduling (`engine.js` `createEngine`)

Only one job runs at a time. A change that arrives meanwhile replaces whatever
is queued, so the field catches up to the latest state rather than every
intermediate one. Jobs run in a module worker (`fieldWorker.js`, which
transfers the grid buffers back), or on the page through `setTimeout` if the
worker cannot start or fails.

**Sweep frames.** For a frequency sweep, while idle, the engine pre-computes
full-resolution jobs at frequencies in the order given by
`frameLadder(lo = 20, hi = 17000)`:

1. the 1-2-3-5 steps of each decade (20, 30, 50, 100, 200, …);
2. the remaining round values 1.5, 4, 6, 7, 8, 9 × decade;
3. repeatedly, the geometric midpoint $\sqrt{f_if_{i+1}}$ of every gap wider
   than 1/24 octave, rounded to two significant figures, until no new
   midpoint fits.

Results are cached by frequency for one *scene*: the CAD geometry, the
speakers, the mics and every setting except frequency, view and display
options. Any other change clears the cache. The energy method has no
frequency axis, so it is not pre-computed.
