# 2. The room: an extruded plan, its front frame and its sections

Modules: `js/acoustics/room.js`, `js/acoustics/elevations.js`,
`js/acoustics/wallChains.js`.

The CAD supplies a closed plan loop. The engine extrudes it vertically, gives
it a front, cuts it with any elevations drawn in the CAD, and reduces it to a
list of surfaces with areas and materials. Every acoustic method then works
from that list.

## 2.1 Walls

`js/acoustics/room.js` `buildRoom(polyMetres, settings, loops, patches, openings)`
first simplifies the loop and makes it counter-clockwise (`simplifyPolygon`,
`ensureCCW`). Wall $i$ runs from vertex $\mathbf a_i$ to $\mathbf b_i$:

$$
\ell_i = \lvert\mathbf b_i-\mathbf a_i\rvert,\qquad
\hat t_i = \frac{\mathbf b_i-\mathbf a_i}{\ell_i},\qquad
\hat n_i^{\text{in}} = (-t_y,\ t_x)
$$

Because the loop is counter-clockwise, $\hat n^{\text{in}}$ (the tangent
turned left) points into the room. The outward bearing is
$\theta_i^{\text{out}} = \operatorname{atan2}(-n_y,-n_x)$.

### Faces

Each wall belongs to one of the four wall faces, chosen by the angle between
its outward normal and the room's front bearing $\theta_F$ (`settings.frontDeg`)
(`room.js` `faceOf`):

$$
\delta = \operatorname{angleDiff}(\theta^{\text{out}},\theta_F),\qquad
\text{face} =
\begin{cases}
\text{front} & \lvert\delta\rvert \le 45°\\
\text{left} & 45° < \delta \le 135°\\
\text{right} & -135° \le \delta < -45°\\
\text{back} & \text{otherwise}
\end{cases}
$$

Left means counter-clockwise of the front, which is the listener's left when
they face the front. This rule gives a splayed (Dolby-style trapezoid) plan
exactly one front wall, and its splays count as left and right.

## 2.2 The front frame

`room.js` `frontFrame(frontDeg)`:

$$
\hat f = (\cos\theta_F,\ \sin\theta_F),\qquad \hat r = (f_y,\ -f_x)
$$

$\hat f$ points at the front wall and $\hat r$ is $\hat f$ turned clockwise,
the listener's right. Projecting every vertex onto these axes gives the
working-space extents:

$$
\text{front} = \max_i \mathbf p_i\cdot\hat f,\quad
\text{back} = \min_i \mathbf p_i\cdot\hat f,\quad
\text{left} = \min_i \mathbf p_i\cdot\hat r,\quad
\text{right} = \max_i \mathbf p_i\cdot\hat r
$$

$$
L = \text{front}-\text{back},\qquad W = \text{right}-\text{left}
$$

$L$ is the length front to back and $W$ the width left to right, measured the
way the comment says the Dolby Room Design Tool measures working space. For a
rectangle aligned with the front these are its sides. For any other plan they
give the bounding box in the front frame.

Front-frame coordinates of a plan point (`room.js` `inFrame` and its inverse
`fromFrame`):

$$
\text{fromFront} = \text{front} - \mathbf p\cdot\hat f,\qquad
\text{fromLeft} = \mathbf p\cdot\hat r - \text{left}
$$

$$
\mathbf p = (\text{front}-\text{fromFront})\,\hat f + (\text{left}+\text{fromLeft})\,\hat r
$$

`room.rect` is true when the plan has four vertices and every corner's
$\lvert\cos\rvert$ between adjacent edges is at most 0.035, i.e. within about
2° of a right angle (`isRectangle`). `room.convex` comes from `isConvex`.

## 2.3 Height: flat, or cut by elevations

With no elevations drawn the room is a prism:

$$
V = A_{\text{plan}}\,H_{\text{base}},\quad S_{\text{floor}}=S_{\text{ceiling}}=A_{\text{plan}},\quad S_{\text{wall }i}=\ell_i H_{\text{base}},\quad z_{\text{floor}}=0,\quad z_{\text{ceiling}}=H_{\max}=H_{\text{base}}
$$

where $H_{\text{base}}$ is `settings.roomHeight` and $A_{\text{plan}}$ is the
signed area of the plan.

### Elevation profiles

An elevation is a closed loop drawn on a layer named `Elevation Front`,
`Elevation Back`, `Elevation Left` or `Elevation Right` (`elevations.js`
`ELEVATION_LAYER`, `elevationFaceOf`). `elevations.js` `profileFromLoop(face, poly, L, W)`
anchors it at its own bottom-left corner $(x_{\min}, y_{\min})$ and maps it into
profile coordinates $(t, z)$:

$$
d = x - x_{\min},\qquad z = y - y_{\min},\qquad
t = \begin{cases} L - d & \text{left}\\ W - d & \text{back}\\ d & \text{front, right}\end{cases}
$$

$t$ is `fromFront` for a side elevation (along $L$) and `fromLeft` for the
front and back elevations (along $W$). The flip for left and back exists
because each elevation is drawn as seen from inside the room.

`elevations.js` `spanAt(pts, t)` returns the vertical extent $[z_{lo}, z_{hi}]$
of a profile at $t$, clamped to the profile's own $t$ range (inset by
$10^{-6}$ m). It is the min and max of the crossings of the vertical line
with the profile's edges.

### Floor and ceiling at a point

The room is the plan extruded and then cut by every drawn elevation
(`elevations.js` `heightsAt`). With $P$ the set of profiles:

$$
z_{\text{floor}}(s,q) = \max_{p\in P} z^{p}_{lo},\qquad
z_{\text{ceiling}}(s,q) = \max\!\Big(z_{\text{floor}},\ \min_{p\in P} z^{p}_{hi}\Big)
$$

where each profile is evaluated at $t = s$ (fromFront) or $t = q$ (fromLeft)
according to its axis. With no profile covering the point the result is
$\{0, H_{\text{base}}\}$. `heightsAtXY(room, x, y)` converts sheet
coordinates through the front frame first.

### Integrated measures

`elevations.js` `measureSection(room, n = 48)` samples an $n\times n$ grid of
cells, each $\Delta s\times\Delta q = (L/n)(W/n)$, over the working-space box.
Only cell centres inside the plan count. For those cells:

$$
V' = \sum (z_c - z_f)\,\Delta A,\qquad
S'_{\text{floor}} = \sum \Delta A\sqrt{1+\lvert\nabla z_f\rvert^2},\qquad
S'_{\text{ceiling}} = \sum \Delta A\sqrt{1+\lvert\nabla z_c\rvert^2}
$$

The gradient is a forward difference to the neighbouring cell. The sums are
then rescaled by $k = A_{\text{plan}}/A_{\text{sampled}}$, so a flat room
gives exactly $A_{\text{plan}} H$:

$$
V = kV',\quad S_{\text{floor}} = kS'_{\text{floor}},\quad S_{\text{ceiling}} = kS'_{\text{ceiling}}
$$

The mean heights are unscaled averages over the sampled cells:

$$
z_{\text{floor}} = \frac{\sum z_f\,\Delta A}{A_{\text{sampled}}},\qquad
z_{\text{ceiling}} = \frac{\sum z_c\,\Delta A}{A_{\text{sampled}}}
$$

Each wall's area integrates the local height along the wall, using
$m = \max(4, \lceil \ell/\min(\Delta s,\Delta q)\rceil)$ midpoint samples:

$$
S_{\text{wall}} = \sum_{j=1}^{m} \big(z_c - z_f\big)\big|_{t_j}\,\frac{\ell}{m}
$$

$H_{\max}$ is the highest ceiling seen in any cell or wall sample.

The room then carries

$$
H = z_{\text{ceiling}} - z_{\text{floor}}
$$

which is the **mean** height. The box methods (image sources in height, the
modal sum, axial modes) use $H$, $z_{\text{floor}}$ and $z_{\text{ceiling}}$
as the equivalent flat room. Grids and drawings are bounded by $H_{\max}$.

`elevations.js` `silhouette`, `silhouetteLoop` and `seedOutline` produce the
outline a face's elevation shows: the lowest floor and highest ceiling along
each line of sight, sampled at 25 points across. They are used for drawing
and for anchoring patches (chapter 3). They do not enter any acoustic number.

## 2.4 Openings: walls with gaps

When the CAD has no closed plan loop, `js/acoustics/wallChains.js`
`planFromWalls(segments, maxGap = 4)` closes one from loose wall segments.
Endpoints within `SNAP` = 5 mm are merged into one node. The segments are walked
into runs. Starting from the longest run, the loop repeatedly hops to the
nearest free end of another run, and each hop longer than `SNAP` becomes an
**opening** $\{a, b, \text{width}\}$. Any hop longer than `maxGap` aborts the
closure (`null`).

`wallChains.js` `openingsOn(wall, openings)` assigns an opening to a wall when
both its ends lie within 2 cm of the wall line and it overlaps the wall's
length, with 2 cm of tolerance.

In `buildRoom` each opening becomes a patch of material `opening` with area
below. The material is entered as $\alpha = 1$ but stored clamped to 0.99
(chapter 3), with $s = 0$ and TL = 0. The area is

$$
S_{\text{opening}} = \text{width}\times\frac{S_{\text{wall}}}{\ell}
$$

so the opening runs the wall's mean height. It is mixed into the wall's
material exactly like a painted patch (chapter 3).

`wallChains.js` `wallKey(w)` names a wall by its midpoint to the centimetre.
`settings.walls[key]` can give that wall its own material and a note.

## 2.5 Surfaces and the per-band totals

After patches and openings are mixed in (chapter 3), the room has
$2 + N_{\text{walls}}$ surfaces: `floor`, `ceiling`, and `wall:i`. Each has
an area $S_j$ and an effective material with $\alpha_{j,b}$, $s_{j,b}$ and
TL. Per band, `buildRoom` computes:

$$
S = \sum_j S_j,\qquad A_b = \sum_j S_j\,\alpha_{j,b},\qquad \bar\alpha_b = \min\!\left(\frac{A_b}{S},\ 0.99\right)
$$

From these totals it computes the Sabine and Eyring times (with air), and the
room constant $R_b$. Chapter 4 has the formulas. The comment says the
summation order is kept stable, so that a room with no patches gives
bit-identical numbers to earlier versions.

## 2.6 What the box stands for

The image-source, modal and axial-mode methods treat the room as an
$L\times W\times H$ box in the front frame:

* For a rectangle aligned with the front, the box is exact.
* For any other plan, $L$ and $W$ are the bounding box in the front frame, and
  `room.rect` is false. The image sources still use the real wall lines
  (chapter 7). The modal sum and the axial-mode list use the bounding box.
* Under a drawn slope, $H$ is the mean height and the image sources use the mean
  floor and ceiling planes.

## 2.7 Worked example

A rectangle 4 m wide ($x$) by 5 m long ($y$), front at $+y$ (`frontDeg = 90`),
ceiling 2.7 m, wood floor, gypsum on the walls and ceiling:

| quantity | value |
|---|---|
| $L$, $W$, $H$ | 5, 4, 2.7 m |
| $V$ | 54 m³ |
| $S$ | $2(20) + 2(5\cdot2.7) + 2(4\cdot2.7) = 88.6$ m² |
| $A_{500}$ | $20(0.10) + 68.6(0.05) = 5.43$ m² |
| $\bar\alpha_{500}$ | 0.061 |

(Checked with node against `buildRoom`.)
