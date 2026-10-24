# 5 · Ray Tracing

Rays leave each speaker in every direction and are followed round the box, bounce after bounce. Every time one passes close to the listener, its energy and arrival time are recorded. The result is the room's **impulse answer** at the listening position: how loud each reflection is, how late, from which surfaces, and from which direction.

**Tabs:**
- **Room:** dimensions.
- **SPK:** positions; automatic speaker alignment.
- **LS:** the listening position, **Mouse Edit**, reset, sphere radius.
- **Acoustic:** the octave band, each surface's material and α, the specular absorbers' α.
- **Sim.:** number of reflections, the vertical and horizontal angles, display items, suppression, the SPK sources, follow time.

## Equal-area rays

`classic.js` `equalAreaDirections`. Angles are taken off the speaker's **0 axis**, the line from its acoustic centre to the listener: horizontal positive clockwise seen from above, vertical positive up. The vertical angle $\phi$ steps by $\Delta$ from *Begin* to *End* (default −90° to +90°). At each $\phi$, the ring of horizontal directions across the span $H$ (default 360°) holds

$$n(\phi) = \max\!\left(1,\ \operatorname{round}\frac{H\cos\phi}{\Delta}\right)$$

rays, evenly spaced. A ring's circumference shrinks as $\cos\phi$ toward the poles, so this keeps **each ray standing for the same area of the sphere**. A ray can then carry an equal share of the energy without being weighted. The horizontal step therefore has no input of its own: it follows the vertical one, as in the original.

The total over the full sphere is close to $4\pi/\Delta^2$ (with $\Delta$ in radians): 1652 rays at 5°, 10 318 at 2° and 41 258 at 1°, per speaker. Each local direction $(f, r, u)$ is turned into the room by the speaker's axis frame (`raysToward`):

$$\hat f = \frac{P_l - P_s}{|P_l - P_s|}, \qquad \hat r = \frac{(-\hat f_Y,\ \hat f_X,\ 0)}{|\cdot|}, \qquad \hat u = \hat r \times \hat f$$

**Automatic speaker alignment** re-aims the axis at the listener whenever either moves. Turned off, the axis stays on the listener position it had at that moment.

## Following a ray

`classic.js` `traceRays`. From position $p$ with unit direction $\hat d$, the next surface is the nearest plane ahead:

$$t_\text{hit} = \min_{\text{faces}} \frac{\text{plane} - p_k}{\hat d_k}, \quad t > 0$$

At a hit the ray reflects **specularly**: the component of $\hat d$ normal to that face changes sign. Its energy is multiplied by $(1 - \alpha)$ of what it struck, in the chosen octave band. That α is the face's material, or a specular absorber's α if the hit falls inside one of the absorber rectangles SBIR placed ([chapter 4](04-sbir.md)). Rays are followed for the **number of reflections** minus one bounces. The default of 14 is the direct sound and 13 reflections. A ray is dropped once its energy is under $10^{-9}$.

## Catching it: the receiver sphere

On each leg from $p$ to the next hit, the ray's closest approach to the listener $P_l$ is at $s = (P_l - p)\cdot\hat d$, with a miss distance $\big|(P_l - p) - s\hat d\big|$. If that is within the **sphere radius** $R$ (default 0.3 m) and $0 < s < t_\text{hit}$, the ray is **heard**. Its path length is $D = (\text{travelled}) + s$, and its energy is

$$E = \frac{\prod_\text{bounces}(1 - \alpha)\;\cdot\;10^{-a D/10}}{D^2}$$

where $a$ is the air absorption in dB/m ([chapter 2](02-general-parameters.md)) and $1/D^2$ is the inverse-square law. Its level relative to the direct sound is

$$L = 10\log_{10}\frac{E}{E_0}, \qquad E_0 = \frac{10^{-a d_0/10}}{d_0^2}$$

where $d_0$ is the direct distance. It arrives at $t = D / c$, in ms.

Many neighbouring rays follow the same sequence of surfaces: they are the same reflection, the one an image source would give. The trace therefore keeps **one arrival per sequence**, the strongest. In a box this reproduces the image-source arrivals. The test suite checks the direct sound and the floor bounce against them, in time and level.

With several speakers, each speaker's levels are referred to its own direct sound. They are then shifted by $20\log_{10}(d_{0,\min}/d_0)$, so the nearest speaker's direct sound is 0 dB.

**Suppression:** the direct sound and the first, second and third reflections can each be excluded from every display. Fourth and later reflections can't, as in the original.

## The charts

- **Energy / Surface** (top): in *Total energy* mode, the energy sum of every kept arrival that touched each surface, $10\log_{10}\sum 10^{L/10}$. In *Single impulse* mode, the surfaces of the impulse picked below.
- **Energy / Time** (bottom): each arrival as a bar, coloured by order (red direct, blue first, light blue second, green later). Two blue lines mark the **10 dB window**: the strongest arrival, and 10 dB under it.

  A reflection inside that window is strong enough to colour the sound by comb filtering. The usual aim is that every reflection in the first 15–20 ms sits at least 10 dB under the direct sound. **Next / Prev** steps through the arrivals, and a click picks the nearest.

## Polar energy

`classic.js` `polarEnergy`. The arrivals are summed as energy into 36 sectors of 10° by the bearing they come **from**: 0° toward the front wall, clockwise, $\beta = \operatorname{atan2}(-\hat d_X,\ \hat d_Y)$ of the arriving ray's reversed direction. Each sector is in dB relative to the strongest.

The Plan View draws this as a yellow polar plot round the listener, with a radius proportional to $1 + L/30$, and two blue circles at 0 dB and −10 dB. A lobe reaching past the inner circle is a direction from which reflections arrive within 10 dB of the strongest.

## Room figures (Data View)

`classic.js` `roomFigures`, in the chosen band, with $\bar\alpha = \sum S_i\alpha_i / \sum S_i$:

| Figure | Formula |
|---|---|
| RT60 (Sabine) | $T = 0.161\,V / (S\bar\alpha)$ s |
| Mean free path | $\text{MFP} = 4V/S$, the average distance between reflections |
| Room constant | $R = S\bar\alpha/(1 - \bar\alpha)$ m² |
| Critical distance | $D_c = 0.141\sqrt{QR}$ m, with $Q = 2$ (a speaker against a boundary) |
| Pref. # of reflections | $\lceil \text{follow}\cdot T\cdot c / \text{MFP} \rceil$: the reflections a ray needs to track that share of the decay |
| Follow time | $\min\!\big(1,\ (n-1)\,\text{MFP}/(c\,T)\big)$: the share of RT60 the trace covers with $n$ reflections |

The critical distance is where the direct and reverberant levels are equal.

*Example:* a $6 \times 4.2 \times 2.8$ m room, $V$ = 70.56 m³, $S$ = 107.52 m², with $\bar\alpha = 0.25$:

| Figure | Value |
|---|---|
| $T$ | 0.42 s |
| MFP | 2.63 m |
| $R$ | 35.8 m² |
| $D_c$ | 1.19 m |
| Pref. # (to follow 50 %) | 28 reflections |

## Comb nulls by surface

The report lists, for each speaker and each of the six surfaces, the first-order reflection's extra path $\Delta d = |I - P_l| - d_0$ (from the image $I$ in that surface) and its delay $\Delta t = \Delta d / c$. That delay combs the response:

$$f_\text{null,1} = \frac{1}{2\Delta t}, \qquad f_{\text{null},k} = \frac{2k - 1}{2\Delta t}, \qquad \text{spacing} = \frac{1}{\Delta t}$$

As the original said, these are where nulls *would* be, listed for cross-checking a measurement, not proof that they are there. Absorption at the reflection point makes them shallower.
