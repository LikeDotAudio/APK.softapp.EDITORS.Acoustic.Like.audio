# 3. Materials, scattering, patches and mixed surfaces

Modules: `js/acoustics/materials.js`, `js/acoustics/patches.js`,
the `effective` mixer in `js/acoustics/room.js`, and `buildAlpha` in
`js/acoustics/isolation.js`.

## 3.1 What a material is

A material (`materials.js` `MATERIALS`, built by the local factory `m`) holds:

| field | meaning | unit |
|---|---|---|
| `alpha[b]` | random-incidence absorption coefficient per octave band | – |
| `scatter[b]` | scattering coefficient per octave band | – |
| `tl` | single-number transmission loss | dB |
| `category`, `color` | grouping and display | – |

The source comment says the values are typical published textbook figures,
rounded and intended for design work rather than as test data. The
categories follow the AcousticRooms library (facebookresearch, CC BY 4.0), as
the comment says.

### Clamping

$$
\alpha_b \leftarrow \min(0.99,\ \max(0,\alpha_b)),\qquad s_b \leftarrow \min(0.99,\ \max(0,s_b))
$$

$\alpha<1$ keeps Eyring's $\ln(1-\bar\alpha)$ finite. $s<1$ keeps a specular
part in every reflection. Note that `opening` is entered with $\alpha = 1$ and
is also clamped to 0.99 on every band.

### Scattering from one number

Each material is given a single scattering value $s_{1\text{k}}$. The comment
reads it as the 1 kHz value, the band where ISO 17497-1 random-incidence data
is usually quoted. One of three spectral shapes $k_b$ spreads it across the
bands:

$$
s_b = \operatorname{round}_3\!\big(\min(0.99,\ s_{1\text{k}}\,k_b)\big)
$$

| shape | $k_{125}$ | $k_{250}$ | $k_{500}$ | $k_{1\text{k}}$ | $k_{2\text{k}}$ | $k_{4\text{k}}$ | used for |
|---|---|---|---|---|---|---|---|
| `flat` | 1 | 1 | 1 | 1 | 1 | 1 | smooth hard surfaces |
| `rough` | 0.5 | 0.6 | 0.8 | 1 | 1.1 | 1.2 | brick, wool, carpet, people |
| `qrd` | 0.15 | 0.45 | 1 | 1 | 1 | 1 | well diffusers (design band ≈ 500 Hz) |

For example, the QRD (`diffuser`, $s_{1\text{k}} = 0.9$) gives
$s = [0.135, 0.405, 0.9, 0.9, 0.9, 0.9]$, and brick ($0.3$, rough) gives
$[0.15, 0.18, 0.24, 0.3, 0.33, 0.36]$.

### Lookup

`materials.js` `lookup(id)` accepts a material id or a product id (a product
points at a material). It returns `null` for an unknown id. `material(id)`
falls back to `gypsum` (`DEFAULT_WALL`) instead. Patches use `lookup` so that
an unknown palette id produces a warning rather than silently becoming drywall.

`PRODUCTS` are fixed-size blocks $[w, h]$ in metres (a 600×600 QRD, a door,
a console). Acoustically each one is its material over the area it covers.

## 3.2 Patches: painting a surface

A patch is a polygon on a CAD layer naming a palette id. The layer decides
which surface it lands on (`patches.js` `layPatches`):

* `Elevation Front/Back/Left/Right`: the walls of that face, read in the
  elevation's own frame.
* Any layer whose name starts with the word "ceiling" (`isCeilingLayer`,
  regex `^ceiling\b`, case-insensitive): the ceiling, read in plan.
* Anything else: the floor, read in plan.

The result is a list of pieces `{ surface, wall, area, points3d, material }`.

### Patches on walls

`patches.js` `wallPieces(room, face, sheetPoly)`:

1. **Frame.** The origin is the bottom-left corner of the elevation loop drawn on
   that layer (`elevationOrigin`). With no loop drawn, it is the bottom-left of
   the outline `seedOutline` would draw. A sheet point maps to $(t, z)$ the same
   way `profileFromLoop` maps it (chapter 2): $d = x - x_0$, $z = y - y_0$,
   and $t = \text{span} - d$ for left and back, $t = d$ otherwise.
2. **Ownership.** Each wall of the face covers a stretch $[t_{lo}, t_{hi}]$ of
   the face's span axis (`faceCoords`). Where two walls overlap in $t$, the
   one with the largest depth $d$ (furthest out through that face) owns the
   stretch, because that is the wall the elevation shows.
3. **Strip integration.** Breakpoints in $t$ are the patch vertices, the wall
   ends, the profile vertices and 48 even steps (`STEPS`). In each strip
   $[t_0,t_1]$ the patch's vertical spans at the strip's midpoint are clipped
   to that wall's local floor and ceiling (`heightsAtXY`). Their total length
   is $h_{\text{strip}}$.
4. **Foreshortening.** A wall at angle $\theta$ to the face axis appears
   narrower in the elevation by $\lvert\cos\theta\rvert$, so the strip's area
   on the wall is

$$
\Delta S = h_{\text{strip}}\,(t_1-t_0)\,\frac{\ell_{\text{wall}}}{t_{hi}-t_{lo}}
= \frac{h_{\text{strip}}\,(t_1-t_0)}{\lvert\cos\theta\rvert}
$$

Contiguous strips on one wall form one piece. The comment says the area is
exact for any polygon, with linear slopes between breakpoints.

### Patches on the floor and ceiling

`patches.js` `planPieces(room, surface, sheetPoly)` integrates the
intersection of patch and plan in vertical strips at the combined breakpoints.
For a flat room the area is $\sum (y_1-y_0)\,\Delta x$. Under a slope, each
span is cut into cells of about $\max(L,W)/32$, and each cell is stretched by
the local surface slope, found by central differences with $h = 2$ cm:

$$
\Delta S = \Delta x\,\Delta y\,\sqrt{1 + \left(\frac{\partial z}{\partial x}\right)^2 + \left(\frac{\partial z}{\partial y}\right)^2}
$$

The outline returned for drawing is a Sutherland–Hodgman clip of the patch
against the plan, or of the plan against the patch, whichever of the two is
convex. When both are concave the patch is returned as drawn. The area does
not depend on this clip.

## 3.3 Mixing: the effective material of a surface

`room.js` `effective(base, area, pieces)` combines a surface's base material
with the pieces on it. Let $S$ be the surface area and $S^{\text{raw}}_p$
the pieces' areas. Overlapping patches are not unioned. Instead, all pieces
are scaled down alike if they add up to more than the surface:

$$
k = \min\!\left(1,\ \frac{S}{\sum_p S^{\text{raw}}_p}\right),\qquad S_p = k\,S^{\text{raw}}_p,\qquad S_0 = S - \sum_p S_p
$$

where part 0 is the bare base material. Then, over the parts $j$:

**Absorption**, area-weighted:

$$
\alpha^{\text{eff}}_b = \frac{1}{S}\sum_j S_j\,\alpha_{j,b}
$$

so the room's $A_b$ rises by exactly $S_p(\alpha_p - \alpha_0)$ for each patch.

**Scattering**, weighted by reflected energy, because $s$ is a fraction of
what is reflected:

$$
s^{\text{eff}}_b = \frac{\sum_j S_j(1-\alpha_{j,b})\,s_{j,b}}{\sum_j S_j(1-\alpha_{j,b})}
$$

If nothing is reflected (denominator below $10^{-12}$), it falls back to an
area-weighted mean.

**Transmission**, weighted as transmission coefficients:

$$
\tau = \frac{1}{S}\sum_j S_j\,10^{-\text{TL}_j/10},\qquad \text{TL}^{\text{eff}} = \operatorname{round}_1\!\big(-10\log_{10}\tau\big)
$$

so a small opening dominates the TL of a large wall. The effective material
also records `base` (the catalogue id underneath) and `patched` (the m²
covered after the cap).

### Worked example

A 4 × 5 m wood floor (20 m²) with a 2 × 3 m patch of `carpet-pad`:

| band | 125 | 250 | 500 | 1k | 2k | 4k |
|---|---|---|---|---|---|---|
| $\alpha$ wood | 0.15 | 0.11 | 0.10 | 0.07 | 0.06 | 0.07 |
| $\alpha$ carpet | 0.08 | 0.24 | 0.57 | 0.69 | 0.71 | 0.73 |
| $\alpha^{\text{eff}}$ | 0.129 | 0.149 | 0.241 | 0.256 | 0.255 | 0.268 |
| $s^{\text{eff}}$ | 0.132 | 0.138 | 0.137 | 0.138 | 0.140 | 0.142 |

At 500 Hz: $\alpha^{\text{eff}} = (14\cdot0.10 + 6\cdot0.57)/20 = 0.241$, and
the room's $A_{500}$ goes from 5.43 to $5.43 + 6(0.57-0.10) = 8.25$ m².
TL: $\tau = (14\cdot10^{-4} + 6\cdot10^{-5})/20$, giving 41.4 dB. (Node, `buildRoom`.)

## 3.4 Construction adds a little bass absorption

What the walls and floor are built of (chapter 12) can add low-frequency
absorption $\Delta\alpha_b$ (`isolation.js` `buildAlpha`: `WALL_BUILDS[…].lfAlpha`,
`FLOOR_BUILDS[…].lfAlpha`). In `buildRoom` it is combined with the facing
material as an independent absorber:

$$
\alpha'_b = \min\!\big(0.99,\ \alpha_b + \Delta\alpha_b(1-\alpha_b)\big)
$$

This applies to every wall's base material and to the floor's, before
patches are mixed in. The ceiling gets no build absorption.

## 3.5 How the methods use $\alpha$ and $s$

The model the comments attribute to EASE, ODEON and CATT splits the energy
arriving at a surface three ways:

$$
\underbrace{\alpha}_{\text{absorbed}} \;+\; \underbrace{(1-\alpha)(1-s)}_{\text{specular}} \;+\; \underbrace{(1-\alpha)\,s}_{\text{diffuse}} \;=\; 1
$$

* Reverberation formulas and the 4/R field use $\alpha$ only (chapters 4, 8).
* Image sources and the wave sum carry only the specular part (chapter 7).
* The echogram hands the diffuse part back as a delayed tail (chapter 9).
* First reflections and flutter use the specular part (chapters 9, 11).
* SBIR uses $(1-\alpha)$ only, with no scattering (chapter 10).
