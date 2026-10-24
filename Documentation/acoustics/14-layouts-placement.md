# 14. Layouts, symmetry, console, room growth and the room library

Modules: `js/acoustics/layouts.js`, `js/acoustics/symmetry.js`,
`js/acoustics/console.js`, `js/acoustics/roomFit.js`,
`js/acoustics/roomLibrary.js`.

These modules are mostly geometry: they place things where the acoustic
methods will then evaluate them.

## 14.1 Immersive layouts

`layouts.js` `LAYOUTS` holds reference azimuths and elevations, which the
comment takes from the public ITU-R BS.2051 / BS.775 tables. It also keeps two
rules from the Dolby Atmos Room Design Tool's release notes: L/C/R in a line
at the front, and 5.1.4 rears at a notional 135°. The comment says the Dolby
spreadsheet itself, which is what certifies a room, is not reproduced.

**Convention.** Azimuth is positive to the listener's **left**, as in ITU, so
every `L…` speaker has $+\text{az}$ and its `R…` twin has $-\text{az}$.

| layout | ear-level speakers (az, allowed $\lvert\text{az}\rvert$ range) | heights | LFE |
|---|---|---|---|
| 2.0 / 2.1 / 2.2 | L/R 30° [22, 30] | – | 2.1: one under, at 0°; 2.2: under L and R |
| 5.1 / 5.2 | C 0°, L/R 30°, Ls/Rs 110° [100, 120] | – | 5.1: one at −15°; 5.2: under L and R |
| 5.1.4 / 5.2.4 | as 5.1, surrounds 135° [110, 135] | Ltf/Rtf 45°, Ltr/Rtr 135°, at 45° elevation | as above |
| 7.1 / 7.1.4 / 7.2.4 | C, L/R, Lss/Rss 90° [90, 110], Lrs/Rrs 150° [135, 150] | .4 as 5.1.4 | 7.1, 7.1.4: one at −15°; 7.2.4: under L and R |
| 9.1.6 | as 7.1 plus Lw/Rw 60° [50, 70] | tf 45°, tm 90° [65, 100], tr 135°, at 45° | one at −15° |
| 22.2 (NHK, BS.2051 System H) | middle: C, Lc/Rc 30°, L/R 60°, Ls/Rs 90°, Lb/Rb 135°, BC 180° | top at 40° (window 30–45°): TpFC, tf 45°, ts 90°, tb 135°, TpBC, and TpC at 90° (window 80–90°); bottom at −20° (window −30 to −15°): BtFC, bf 52° | at ±45° |

`elWindow(s)` gives the elevation window used in the check: the speaker's own
`elRange` if it has one, otherwise $[-10°, 10°]$ for ear level and
$[30°, 55°]$ for heights.

### Placing a layout

`layouts.js` `layoutCentre(seat, frontDeg, offset)` is the array's centre:
the seat moved by `offset` (mm, to the right, toward the front, and up):

$$
\mathbf c = \mathbf x_{\text{seat}} + \frac{o_r}{1000}\hat r + \frac{o_f}{1000}\hat f,\qquad c_z = z_{\text{seat}} + \frac{o_u}{1000}
$$

`arrayFront(settings)` $= \theta_F + \text{rotate}$ is the bearing the array
faces.

`layouts.js` `layoutPositions(layout, mix, frontDeg, radius, ceiling)`. With
$\beta = \theta_F + \text{az}$ (world bearing) and elevation $\epsilon$:

$$
r_h = R\cos\epsilon,\quad x = x_m + r_h\cos\beta,\quad y = y_m + r_h\sin\beta,\quad
z = \operatorname{clamp}\!\big(z_m + R\sin\epsilon,\ 0.1,\ z_{\text{ceil}} - 0.15\big)
$$

$$
\text{aim} = \beta + 180°,\qquad \text{tilt} = -\operatorname{atan2}(z - z_m,\ r_h)
$$

so each box faces the listener. Subs go at radius $R$ (`under`) or $0.9R$,
at $z$ = 0.3 m with no tilt. Example (5.1, $R$ = 1.5 m, seat (2, 3.1, 1.2),
front +y): C at (2.00, 4.60), L at (1.25, 4.40), R at (2.75, 4.40), Ls at
(0.59, 2.59), Rs at (3.41, 2.59), LFE at (2.35, 4.40, 0.30).

### Moving an array

`layouts.js` `carryArray(speakers, settings, mix, next, ceiling)` moves the
arranged speakers that have roles from the current centre $\mathbf a$ to the
new centre $\mathbf b$. It scales by $k = R_{\text{next}}/R_{\text{now}}$,
rotates by $\Delta\phi$ = change in `rotate`, and translates:

$$
\begin{pmatrix}x'\\y'\end{pmatrix} = \mathbf b + \begin{pmatrix}\cos\Delta\phi & -\sin\Delta\phi\\ \sin\Delta\phi & \cos\Delta\phi\end{pmatrix} k\begin{pmatrix}x-a_x\\y-a_y\end{pmatrix}
$$

$$
z' = \operatorname{clamp}\!\big(b_z + k(z-a_z),\ 0.1,\ z_{\text{ceil}} - 0.15\big)\ \ (\text{subs keep } z),\qquad \text{aim}' = \text{aim} + \Delta\phi
$$

Bearings from the centre are preserved, so each speaker keeps aiming at the
listener.

### Checking a layout

`layouts.js` `layoutCheck(speakers, mix, frontDeg, layout)` measures each
role-matched speaker relative to the array centre:

$$
\text{az} = \operatorname{wrap}_{180}\!\big(\operatorname{atan2}(\Delta y,\Delta x) - \theta_F\big),\quad
\text{el} = \operatorname{atan2}(\Delta z,\ \lvert\Delta\mathbf x_{xy}\rvert),\quad
d = \lvert\Delta\mathbf x\rvert
$$

Acceptance criteria:

* centre-line speakers: $\lvert\text{az} - \text{az}_{\text{ref}}\rvert \le 2°$;
* side speakers: $\lvert\text{az}\rvert$ within the range ±1°, on the correct
  side;
* the overhead TpC: any azimuth;
* elevation within `elWindow` ±1°.

Alignment to the farthest speaker, $d_{\max}$:

$$
\text{delay} = \frac{d_{\max} - d}{343}\cdot1000\ \text{ms},\qquad
\text{trim} = -20\log_{10}\frac{d_{\max}}{d}\ \text{dB}
$$

The trim is negative for nearer speakers, which assumes $1/r$ level fall-off
from each box.

`arrangedSpeakers` and `soundingSpeakers` decide which speakers the field
hears: those in the highlighted layout's roles, plus any speaker without a
role. `noseMarks` and `snapNose` snap a seat's bearing to the front, to
square-on to any wall, or to 15° steps.

## 14.2 Symmetry

`symmetry.js` mirrors a device across the CAD's vertical axis $x = X$
(`mirrorDevice`):

$$
x' = 2X - x,\qquad \text{aim}' = (180° - \text{aim}) \bmod 360°
$$

It also swaps `side` L↔R and role names (`mirrorName`: `L`, `Ls`, `Ltf`, …
↔ `R…`, or a trailing ` L`/` R`). `syncTwin` rewrites the twin that shares a
`pairId`. This is a left/right mirror only when the room faces ±y, and the
advisor warns otherwise (chapter 15).

## 14.3 The console at the mixer's nose

`console.js` `consoleSpot(mix, paletteId, people = 2)`:

$$
d = 0.15 + n_{\text{people}}\cdot0.46 + \frac{\text{depth}}{2},\qquad
\mathbf c = \mathbf x_m + d\,(\cos\text{aim},\ \sin\text{aim}),\qquad
\text{rotation} = \operatorname{wrap}_{180}(\text{aim} - 90°)
$$

with `NOSE_M` = 0.15 m, `PERSON_M` = 0.46 m (shoulder width), and depth the
product's second dimension. A 2400 × 1000 console for a mixer facing +y is
centred 1.57 m ahead. `consoleSettled` treats a console as in place when it
is within 1 mm and 0.1° of that spot (modulo 180°).

## 14.4 How much bigger the room would have to be

`roomFit.js` `roomGrowth(room, speakers, { clear = 0.3, headroom = 0.2 })`.
For each speaker, it finds the nearest wall and the signed inside distance
$\sigma = (\mathbf x - \mathbf a)\cdot\hat n^{\text{in}}$ (`nearestWall`). If
$\sigma < \text{clear}$, that wall's face must move out by
$\text{clear} - \sigma$. Each face takes the largest such value. The ceiling
must rise by $\max(0,\ z + \text{headroom} - H)$. All values are rounded to
cm. `wider` = left + right and `deeper` = front + back. $H$ is the room's
mean height (chapter 2).

## 14.5 The room library

`roomLibrary.js` `ROOM_LIBRARY` holds 45 plan types (home and project, ratio
rooms, control rooms, live rooms, immersive and film). Each plan is in
metres, with the front at +y, centred on $x$ = 0, starting at $y$ = 0, and
wound counter-clockwise, together with a ceiling height. The comment says
these are room *types*, not surveys of real studios. The ratio rooms are built
as $W = 2.7\cdot1.4$, $L = 2.7\cdot1.9$ (Louden's ratio, labelled
"Bolt-area"), Sepmeyer A, and the golden section. `planArea` is the shoelace
area.

`roomLibrary.js` `furnish(room)` places furniture and listeners in the
room's own frame:

* **Mix rooms:** the mixer at 38 % of $L$ from the front, $z$ = 1.2 m. The desk
  is chosen by width ($W < 4$: 1.8 m desk; $W < 6.5$: 2.4 m console;
  otherwise 3.2 m) and placed with its centre at
  $y_{\text{mix}} + 0.15 + 2(0.46) + \text{depth}/2$ (§ 14.3). The producer
  sits 1 m behind if the room allows. A client sits at the desk end when
  $W \ge 3.6$. A rack is added when $W - w_{\text{desk}} \ge 1.6$. A couch with
  two entourage seats goes 0.25 m off the back wall when the depth allows and
  it clears the door.
* **Podcast and radio:** one desk mid-room, with hosts 0.85 m either side.
* **Live rooms:** a single listener at mid-length (1.6 m high in booths).

`doorOf` places a door (900 mm in home rooms, otherwise a 1000 mm acoustic
door) on the squarest back-facing wall it fits. That is an edge whose outward
normal has a $-y$ component of at least $1/\sqrt2$ and whose length is at
least $w + 0.3$ m. Ties go to the longer edge, then the right-hand one. The
door's far edge sits 0.15 m in from the wall's right-hand end.

Pieces that fall outside an irregular plan are dropped. The mixer is always
kept.
