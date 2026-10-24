# 7. Image sources for an extruded room

Module: `js/acoustics/images.js`. The wave field, the echogram and the
energy method's direct path build on it (chapters 8, 9).

## 7.1 Model

Walls are vertical and the floor and ceiling horizontal, so reflections in
plan and reflections in height are independent. A virtual source is the
product of a **2-D plan image** (the source mirrored across wall lines) and a
**1-D height image** (mirrored across the floor and ceiling planes). Its order
is the sum of the two orders.

Under a drawn slope, the floor and ceiling planes are the **mean** planes
$z_{\text{floor}}$, $z_{\text{ceiling}}$ of chapter 2: the image set is that
of the equivalent flat room.

**Validity.**

* Geometric acoustics: each image is a point source and each reflection is
  specular off an infinite plane. Edge diffraction and finite-size reflectors
  are ignored. The approximation holds when surfaces are large compared with
  the wavelength.
* Pruning uses the convex-room rule: a wall can reflect an image only if the
  image is in front of it. No visibility check is made against wall
  *segments*. For a rectangle the image set is exact. For other convex plans
  it is the standard approximation. For a re-entrant plan some images are not
  physically realisable, and the advisor warns about this (chapter 15).
* Reflection coefficients are real, angle-independent energy factors taken
  from the random-incidence $\alpha$. No phase change on reflection is
  modelled, so every boundary acts as rigid in phase.

## 7.2 Plan images

`images.js` `planImages(room, src, maxOrder)` grows the set by order. From
each image of the previous order, every wall except the one it was last
mirrored in is tried:

$$
\sigma = (\mathbf p - \mathbf a_w)\cdot\hat n_w^{\text{in}};\qquad \text{if } \sigma > 10^{-9}:\quad \mathbf p' = \mathbf p - 2\sigma\,\hat n_w^{\text{in}}
$$

Each image also carries the accumulated 2×2 reflection matrix

$$
\mathbf R_w = \mathbf I - 2\,\hat n_w\hat n_w^{\mathsf T} = \begin{pmatrix}1-2n_x^2 & -2n_xn_y\\ -2n_xn_y & 1-2n_y^2\end{pmatrix},\qquad \mathbf M' = \mathbf R_w\,\mathbf M
$$

stored as `M = [a, b, c, d]`, row-major. The field uses it to turn the
direction from an image to the listener back into the direction the real box
radiated (chapter 8), so that a box's pattern is evaluated in its own frame.

`images.js` `planOrderCap(room)` limits the plan order, because plan images
grow as roughly $N_{\text{walls}}^{\text{order}}$:

| walls | max plan order |
|---|---|
| ≤ 6 | 4 |
| 7–12 | 2 |
| > 12 | 1 |

`roomImages` uses $\min(\text{maxOrder}, \text{cap})$ for the plan part. The
height part still goes to `maxOrder`.

## 7.3 Height images

`images.js` `heightImages(z, z1, maxOrder, z0 = 0)` alternates between the
floor $z_0$ and the ceiling $z_1$, never mirroring twice in the same plane:

$$
z' = 2z_0 - z\ \ (\text{floor}),\qquad z' = 2z_1 - z\ \ (\text{ceiling})
$$

Each image counts its floor bounces $n_f$ and ceiling bounces $n_c$, and
carries `sign` $= (-1)^{n_f+n_c}$ (`zSign`). The field multiplies the
vertical component of the arrival direction by `zSign` to recover the
radiated direction, as $\mathbf M$ does in plan.

Each order adds two images, so up to order $N$ there are $2N+1$ height
images (including the original).

## 7.4 Reflection factors: specular only

`images.js` `specular(mat, b)` gives the energy a surface keeps in the mirror
direction:

$$
\rho^{\text{spec}}_b = (1-\alpha_b)(1-s_b)
$$

A material without `scatter` is treated as a mirror ($s=0$).

`images.js` `roomImages(room, src, maxOrder)` combines every plan image with
every height image whose total order is at most `maxOrder`. For a path
bouncing off walls $w_1, \ldots, w_k$, $n_f$ times off the floor and $n_c$
times off the ceiling, per band:

$$
\text{refl}_b = \prod_{i=1}^{k}(1-\alpha_{w_i,b})(1-s_{w_i,b})\cdot\big[(1-\alpha_{f,b})(1-s_{f,b})\big]^{n_f}\big[(1-\alpha_{c,b})(1-s_{c,b})\big]^{n_c}
$$

$$
\text{reflAbs}_b = \prod_{i=1}^{k}(1-\alpha_{w_i,b})\cdot(1-\alpha_{f,b})^{n_f}(1-\alpha_{c,b})^{n_c}
$$

$$
\text{scatterLoss}_b = \max\!\left(0,\ 1 - \frac{\text{refl}_b}{\text{reflAbs}_b}\right),\qquad \text{amp}_b = \sqrt{\text{refl}_b}
$$

* `refl` is the specular **energy** factor of the path.
* `reflAbs` is what the same path would keep if every surface were a mirror
  with the same absorption.
* `scatterLoss` is the fraction of the surviving energy that was scattered
  off the specular path rather than absorbed.
* `amp` is the **pressure** factor read by the wave sum.

With $s = 0$ everywhere, `refl` equals $\prod(1-\alpha)$ exactly.

The scattered energy $(1-\alpha)s$ is not lost; only absorption removes
energy. The wave sum ignores it because it has no coherent phase. The
echogram returns it to the room as a delayed diffuse tail (chapter 9).

## 7.5 Worked example

A 4 × 5 × 2.7 m box, a source at (2, 4, 1.2), wood floor, gypsum walls and
ceiling, but a QRD on the front wall. To order 1 there are 7 images (the
source, four walls, floor, ceiling). At 1 kHz:

| image | $\alpha$ | $s$ | refl | reflAbs | scatterLoss |
|---|---|---|---|---|---|
| direct | – | – | 1 | 1 | 0 |
| floor (wood) | 0.07 | 0.10 | 0.837 | 0.930 | 0.10 |
| ceiling (gypsum) | 0.04 | 0.10 | 0.864 | 0.960 | 0.10 |
| side and back walls (gypsum) | 0.04 | 0.10 | 0.864 | 0.960 | 0.10 |
| front wall (QRD) | 0.20 | 0.90 | 0.080 | 0.800 | 0.90 |

The QRD removes 92 % of that reflection's coherent energy
($\sqrt{0.080} = 0.28$ in pressure), but only 20 % of its energy leaves the
room. (Node, `roomImages`.)
