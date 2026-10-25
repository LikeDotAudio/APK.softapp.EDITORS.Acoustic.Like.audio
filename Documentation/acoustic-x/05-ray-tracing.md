# 5 · Ray Tracing

Rays leave each speaker in every direction and are followed round the box, bounce after bounce. Every time one passes close to the listener, its energy and arrival time are recorded. The result is the room's **impulse answer** at the listening position: how loud each reflection is, how late, from which surfaces, and from which direction.

**Tabs:**
- **Room:** dimensions.
- **SPK:** positions; automatic speaker alignment.
- **LS:** the listening position, **Mouse Edit**, reset, sphere radius.
- **Acoustic:** the octave band, each surface's material and α, the specular absorbers' α.
- **Sim.:** number of reflections, the vertical and horizontal angles, display items, suppression, the SPK sources, follow time.
- **Time:** speech or music; the precedence and echo check (Haas); the backward-integrated decay with EDT, T20 and T30 (Schroeder).

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

  An orange dashed line marks the **echo limit**, 50 ms (speech) or 80 ms (music) after the direct sound, as chosen on the Time tab. A reflection past it and within 10 dB of the direct sound is a likely echo (next section). The line is drawn only when it falls inside the time axis.

## Precedence and echo (Haas)

**Time → Precedence & Echo (Haas)**, `references.js` `haasCheck`. [Haas 1951/1972](references/07-haas-1972-single-echo.md) played speech from two loudspeakers, one delayed, and asked when listeners heard one source, where, and when they heard an echo. This group reads the traced arrivals against his findings. Its thresholds are design readings of his curves, not his data.

It reads every traced arrival, before **Suppression** and before the charts' −60 dB cut, so hiding an order on the charts does not change it. The **direct** sound is the first arrival of order 0. Every reflection $i$ (order ≥ 1) is measured against it:

$$\Delta t_i = t_i - t_0 \ \text{(ms)}, \qquad \Delta L_i = L_i - L_0 \ \text{(dB)}$$

| Class | Condition | What the listener hears |
|---|---|---|
| pulls the image | $\Delta t \le 1$ ms and $\Delta L \ge -3$ dB | summing localisation: the image moves toward the reflection |
| fused | $1 < \Delta t \le 30$ ms | one sound, from the direction of the first arrival |
| likely echo | $\Delta t > T_e$ and $\Delta L \ge -10$ dB | a separate repeat |

$T_e$ is 50 ms for **speech** and 80 ms for **music**: music hides a late reflection better. The group also gives the **initial-time-delay gap**, the lag of the first reflection, $\text{ITDG} = \min_i \Delta t_i$. Beranek used it to rate halls ([chapter 6](06-reverb-time.md#hall-checks-beranek)). A second speaker's own direct sound is not a reflection, so it is never counted: two speakers make a phantom image, not an echo.

*Example, a made-up list:* the direct sound at 5 ms and 0 dB, then reflections at 5.6 ms −2 dB, 9 ms −4 dB, 30 ms −8 dB, 70 ms −6 dB and 90 ms −14 dB. The ITDG is 0.6 ms, and the 5.6 ms reflection pulls the image. The 9 ms and 30 ms ones fuse. For speech, the 70 ms one is a likely echo; the 90 ms one is too quiet. For music, nothing is past 80 ms and within 10 dB, so there is no echo.

*Example, traced:* the running room, $6 \times 4.2 \times 2.8$ m with $\alpha$ = 0.25 on every face, Speaker 1 alone at $(0.9, 0.8, 1.2)$, the listener at $(2.1, 2.28, 1.2)$, 2° rays, 14 reflections, a 0.3 m sphere. The direct sound arrives at 5.49 ms. The first reflections are the floor at 8.89 ms (−5.3 dB), the front wall at 9.60 ms (−6.0 dB), the left wall at 9.71 ms (−6.1 dB) and the ceiling at 10.83 ms (−7.0 dB). So the ITDG is 3.40 ms. Nothing pulls the image, 113 reflections fuse, and there are no likely echoes for speech or music: in a room this small, everything past 50 ms is more than 10 dB down.

## Decay (Schroeder)

**Time → Decay (Schroeder)**, `references.js` `schroederDecay`. [Schroeder 1965](references/08-schroeder-1965-reverberation-time.md) showed that integrating the squared impulse response backwards gives, in one pass, the average of many interrupted-noise decays. Here the impulse response is every traced arrival (again before Suppression and the −60 dB cut), each with energy $e_i = 10^{L_i/10}$:

$$E(t) = \sum_{t_i \ge t} e_i, \qquad D(t) = 10\log_{10}\frac{E(t)}{E(t_0)}\ \text{dB}$$

$D$ starts at 0 dB at the first arrival $t_0$ and falls as the energy still to come runs out. It is sampled every 1 ms. Three reverberation times are fitted to it, each a least-squares line over the samples between two levels, with slope $m$ in dB/ms:

$$T = -\frac{60}{m}\cdot\frac{1}{1000}\ \text{s}$$

| Figure | Fitted between |
|---|---|
| EDT (early decay time) | 0 and −10 dB |
| T20 | −5 and −25 dB |
| T30 | −5 and −35 dB |

Each is extrapolated to 60 dB. A figure shows — when the curve never reaches its lower level. The chart draws $D(t)$.

*Example, a check:* arrivals every 1 ms for 600 ms, falling 60 dB per 500 ms, give EDT = T20 = T30 = 0.50 s.

*Example, traced:* the same trace as above. With 14 reflections the curve ends at −56.3 dB after 235 ms, and EDT = 0.28 s, T20 = 0.22 s, T30 = 0.22 s. With 40 reflections it reaches −97.4 dB at 635 ms, and EDT = 0.28 s, T20 = 0.25 s, T30 = 0.30 s. Sabine gives 0.42 s for this room (Room figures, below) and Eyring 0.37 s.

The traced decay is shorter than both, for two reasons:
- the trace stops after the set number of reflections, so the tail is cut off;
- each surface sequence is kept once, and late sequences are missed when the rays have spread too thin to hit the sphere.

The Time tab says so: raise **Number of ref.** for T30. EDT, which uses only the first 10 dB, is the most reliable of the three here.

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
