# 11. First reflections and panel placement

Module: `js/acoustics/reflectionPanels.js`.

Two functions share the mirror construction. `firstReflections` describes
each first-order bounce at the mix seat. `reflectionPanels` places a treatment
panel centred on each specular point ("the mirror trick"). Subwoofers are
skipped in both, since the comment notes a panel does nothing below 120 Hz.

## 11.1 The mirror construction

For a speaker at $\mathbf x_s$ in front of a wall
($(\mathbf x_s-\mathbf a)\cdot\hat n^{\text{in}} > 0$), its plan image is
$\mathbf x'_s$ = `mirrorPoint`. The segment from $\mathbf x'_s$ to the seat
$\mathbf x_m$ crosses the wall segment at parameter $u$ along the wall and $t$
along the image–seat line (`segmentCross`). In plan, the specular point is

$$
\mathbf h_{xy} = \mathbf a + u(\mathbf b - \mathbf a)
$$

The path rises or falls linearly from box to ears, and the plan fraction
already travelled is $t$, so the height of the hit is

$$
z_h = z_s + (z_m - z_s)\,t
$$

For the floor or ceiling at height $z_0$ (taken as flat at its height above
the seat), with $a = \lvert z_0 - z_s\rvert$ and $b = \lvert z_0 - z_m\rvert$
(both on the same side):

$$
q = \frac{a}{a+b},\qquad \mathbf h = \mathbf x_s + q(\mathbf x_m - \mathbf x_s),\quad h_z = z_0
$$

## 11.2 `firstReflections(room, speakers, mix, band = 2)`

For each surviving bounce, with $d_1 = \lvert\mathbf h - \mathbf x_s\rvert$,
$d_2 = \lvert\mathbf x_m - \mathbf h\rvert$, path $P = d_1 + d_2$ and direct
distance $D$:

$$
\text{delay} = \frac{P - D}{c}\cdot 1000\ \text{ms}
$$

$$
L_{\text{rel}} = G_s(\mathbf h - \mathbf x_s) - G_s(\mathbf x_m - \mathbf x_s) + 20\log_{10}\frac{D}{P} + 10\log_{10}\max\!\big(10^{-6},\ (1-\alpha_b)(1-s_b)\big)
$$

$L_{\text{rel}}$ is the level relative to the direct sound: the box's pattern
toward the bounce compared with toward the seat, the extra spreading, and the
specular share the surface keeps (chapter 7). The microphone pattern is not
included.

* $\alpha, s$ come from the patch under the hit point if there is one, and
  otherwise from the surface's effective material. A panel over its own spot
  therefore reduces that reflection. Wall patches are tested in wall
  coordinates (along the wall, height). Floor and ceiling patches are tested
  in plan.
* A wall hit below the local floor or above the local ceiling is discarded,
  not clamped.
* Floor or ceiling hits outside the plan are discarded.

**First Fresnel zone radius**, the size of the reflecting patch, drawn as the
size of the heat spot:

$$
r_F = \sqrt{\frac{\lambda\,d_1 d_2}{d_1 + d_2}},\qquad \lambda = \frac{c}{f_b}
$$

`heatOf(r)` maps the relative level to $[0,1]$:
$\operatorname{clamp}\big((L_{\text{rel}}+20)/20,\ 0,\ 1\big)$, so 0 is 20 dB or
more below the direct sound and 1 is as loud as it.

### Worked example

The 4 × 5 × 2.7 m room of chapter 2. A monitor at (1.2, 4.3, 1.2) aimed at
−60°, the seat at (2, 3.1, 1.2), 500 Hz ($\lambda$ = 0.686 m):

| surface | hit (x, y, z) | delay (ms) | $L_{\text{rel}}$ (dB) | $r_F$ (m) |
|---|---|---|---|---|
| floor | 1.60, 3.70, 0 | 3.96 | −9.0 | 0.69 |
| front wall | 1.42, 5.00, 1.2 | 3.73 | −21.4 | 0.61 |
| ceiling | 1.60, 3.70, 2.7 | 5.50 | −10.7 | 0.76 |
| left wall | 0, 3.85, 1.2 | 5.76 | −15.4 | 0.74 |
| right wall | 4.00, 3.60, 1.2 | 10.22 | −12.8 | 0.91 |
| back wall | 1.66, 0, 1.2 | 17.50 | −15.3 | 1.12 |

The front-wall reflection is quiet because it leaves the back of a cardioid.
(Node.)

## 11.3 `reflectionPanels(room, speakers, mix, { w = 0.6, h = 1.2, cw = 1.2, ch = 1.2, ceiling = true })`

The construction is the same as in § 11.1, with two differences:

* **Wall panels are clamped onto the wall.** The height fraction is
  $q = \lvert\mathbf h_{xy}-\mathbf x'_s\rvert / \lvert\mathbf x_m - \mathbf x'_s\rvert$
  (equal to $t$), and

$$
z_{\text{panel}} = \operatorname{clamp}\!\big(z_s + (z_m-z_s)q,\ z_f + h/2,\ z_c - h/2\big)
$$

  The panel's centre along the wall is clamped to
  $[\tfrac{w}{2},\ \ell - \tfrac{w}{2}]$ (half-width capped at $\ell/2$).
* **The ceiling point** uses the ceiling height above the seat, $z_c$:

$$
q = \frac{z_c - z_s}{(z_c - z_s) + (z_c - z_m)},\qquad \mathbf h = \mathbf x_s + q(\mathbf x_m - \mathbf x_s)
$$

  A ceiling cloud $cw \times ch$ is laid square to the room's front frame.

Each wall panel is also returned as its four corners on the face's elevation
(`onElevation`), in the same sheet frame `patches.js` reads painted patches
in (chapter 3). Drawing the panel there lands it back where it was computed.
Panels are named per face, left to right as the elevation shows them
(`LEFT-1`, `LEFT-2`, …).
