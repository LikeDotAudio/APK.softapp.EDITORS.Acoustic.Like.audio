# 6. Sources and receivers: level, response, mounting, directivity

Modules: `js/acoustics/devices.js`, `js/acoustics/patterns.js`.

## 6.1 Loudspeaker level

A loudspeaker is specified the way a datasheet specifies it:

| field | meaning | unit |
|---|---|---|
| `sensitivity` | on-axis SPL at 1 m for 1 W | dB SPL |
| `watts` | amplifier power | W |
| `maxSpl` | the most it makes before limiting | dB SPL |
| `fLow`, `fHigh` | −10 dB points of its range (0 means unlimited) | Hz |
| `lowpass` | crossover of a sub (0 means none) | Hz |
| `drive` | `'power'` or `'spl'` | – |
| `level` | on-axis SPL at 1 m when `drive = 'spl'` | dB SPL |

`devices.js` `speakerLevel(spk)`:

$$
L_{\text{demand}} =
\begin{cases}
\text{sensitivity} + 10\log_{10}\max(W,\ 10^{-3}) & \text{power drive}\\
\text{level} & \text{SPL drive}
\end{cases}
\qquad
L_{1\text{m}} = \min(L_{\text{demand}},\ L_{\max})
$$

`headroom` $= L_{\max} - L_{\text{demand}}$ (negative when the box is
limiting). Power drive applies only when sensitivity and watts are both finite
and `drive` is not `'spl'`. `wattsFor(spk, spl)` inverts this:
$W = 10^{(\text{SPL}-\text{sensitivity})/10}$. For example, 100 dB from an
87 dB/W box needs 19.95 W.

The library monitor (87 dB/W, 5 W) gives $87 + 10\log_{10}5 = 93.99$ dB at
1 m, with 18.0 dB of headroom to its 112 dB maximum.

## 6.2 Frequency response

`devices.js` `responseGain(freq, spk)` is a linear magnitude made of
Butterworth-shaped terms: a 4th-order high-pass at the bottom, a 2nd-order
low-pass at the top, and an optional 4th-order crossover:

$$
\lvert H(f)\rvert = \frac{1}{\sqrt{1+(f/f_x)^{8}}}\cdot\frac{1}{\sqrt{1+\left(\dfrac{K_{hp}f_{\text{low}}}{f}\right)^{8}}}\cdot\frac{1}{\sqrt{1+\left(\dfrac{f}{f_{\text{high}}/K_{lp}}\right)^{4}}}
$$

Each term is omitted when its frequency is 0. The corner factors are chosen so
that each quoted frequency sits exactly at −10 dB. A Butterworth of order $n$
has $\lvert H\rvert^2 = 1/(1+x^{2n})$, and setting this to 1/10 gives
$x = 9^{1/2n}$:

$$
K_{hp} = 9^{1/8} \approx 1.316,\qquad K_{lp} = 9^{1/4} \approx 1.732
$$

The crossover term is `lowpassGain(freq, fc)`, $-3$ dB at $f_x$.

`devices.js` `sourceDb(spk, freq)` is what every method uses as the source:
on-axis SPL at 1 m at frequency $f$:

$$
L_0(f) = L_{1\text{m}} + 20\log_{10}\max\!\big(\lvert H(f)\rvert,\ 10^{-12}\big)
$$

Example: the monitor ($f_{\text{low}} = 45$, $f_{\text{high}} = 22000$ Hz)
reads −10.0 dB at 45 Hz and at 22 kHz, and −0.0002 dB at 1 kHz. The sub
preset ($f_{\text{low}} = 30$, crossover 100 Hz) reads −10.0 dB at 30 Hz,
−3.0 dB at 100 Hz and −24.1 dB at 200 Hz.

**Assumption.** These responses are magnitude only. The wave sum (chapter 8)
gives each box zero phase of its own, so the only phase comes from the path
length and `delayMs`. The filters' phase shift does not enter, and neither
does any crossover interaction between a sub and the mains.

## 6.3 Mounting

`devices.js` `MOUNTS` gives the solid angle the box radiates into and the
low-frequency pressure gain that implies:

| mount | solid angle | gain |
|---|---|---|
| `free` | $4\pi$ | 0 dB |
| `flush` | $2\pi$ | +6 dB |
| `corner` | $\pi$ | +12 dB |
| `trihedral` | $\pi/2$ | +18 dB |

The methods use the gain in two different ways:

* The **energy method** adds it as a number. `field.js` `mountGainDb` adds
  the gain where the box radiates as a point source, $f \le$ `omniBelow`
  (250 Hz for a box that does not give one), and nothing above.
* The **wave method** never adds it. With the box near a boundary, its image
  source arrives almost in phase, which produces the same gain from the
  physics. The engine's test suite checks that a source 1 mm from a rigid
  wall gains about +6 dB at 50 Hz (node gives +5.7 dB, with the far images
  of a 1000 m room included).

The echogram (chapter 9) leaves its discrete arrivals to the images, as the
wave method does, and adds the gain to its late reverberant tail, as the
energy method's reverberant field does.

## 6.4 Size

`devices.js` `boxSize(spk)` draws a box from its internal volume
$V_\ell$ (litres) with fixed proportions $h:w:d$ = 1.6 : 1 : 1.2 (monitor)
or 1 : 1.15 : 1.1 (sub):

$$
k = \sqrt[3]{\frac{V_\ell/1000}{h\,w\,d}},\qquad (w, h, d)\cdot k
$$

A 12 L monitor comes out 0.18 × 0.29 × 0.22 m (w × h × d). This is for
drawing only and has no acoustic effect.

## 6.5 Directivity

### Aim frame

`patterns.js` `frame(aimDeg, tiltDeg)` gives the forward, right and up unit
vectors for a bearing $\phi$ (CCW from $+x$) and tilt $\vartheta$ (up
positive):

$$
\hat f = (\cos\phi\cos\vartheta,\ \sin\phi\cos\vartheta,\ \sin\vartheta),\quad
\hat r = (\sin\phi,\ -\cos\phi,\ 0),\quad
\hat u = (-\cos\phi\sin\vartheta,\ -\sin\phi\sin\vartheta,\ \cos\vartheta)
$$

### First-order patterns

`patterns.js` `shapeGain(pattern, fr, dir)`. With
$\cos\theta = \hat f\cdot\hat d$:

$$
G(\theta) = \max\!\Big(-30,\ 20\log_{10}\max\big(\lvert a + (1-a)\cos\theta\rvert,\ 10^{-6}\big)\Big)\ \text{dB}
$$

| pattern | $a$ |
|---|---|
| omni | 1 |
| subcardioid | 0.7 |
| cardioid | 0.5 |
| supercardioid | 0.37 |
| hypercardioid | 0.25 |
| figure8 | 0 |

The floor is −30 dB (`FLOOR_DB`). Example: a cardioid is −6.02 dB at 90°
and is floored to −30 dB at 180°.

### Horn

For `horn`, the direction is split into a horizontal angle
$\varphi_h = \operatorname{atan2}(\hat r\cdot\hat d,\ \hat f\cdot\hat d)$ and a
vertical angle $\varphi_v = \operatorname{atan2}(\hat u\cdot\hat d,\ \hat f\cdot\hat d)$.
The gain is then

$$
G = \max\!\left(-30,\ -6\,\rho^4\right)\ \text{dB},\qquad \rho^2 = \left(\frac{\varphi_h}{\Theta_h/2}\right)^2 + \left(\frac{\varphi_v}{\Theta_v/2}\right)^2
$$

where $\Theta_h$ and $\Theta_v$ are the rated coverage angles (`hCov`,
`vCov`, each at least 10°). The result is −6 dB at the rated edge. Inside
the coverage it is nearly flat (−0.4 dB halfway to the edge), and past the
edge it falls fast, as a constant-directivity horn does. A 90° horn reads
−0.4 dB at 22.5°, −6 dB at 45° and −30 dB (the floor) at 67.5° and beyond.

### The pattern fades at low frequency

`patterns.js` `patternWeight(freq, omniBelow)`. With
$x = \log_2(f/f_{\text{omni}})$:

$$
t = \operatorname{clamp}\!\left(\frac{x+1}{2},\ 0,\ 1\right),\qquad w = t^2(3-2t)
$$

a smoothstep in log frequency: 0 an octave below `omniBelow`, 0.5 at it, and
1 an octave above. For `omniBelow` = 300 Hz the weights at 150, 212, 300, 424
and 600 Hz are 0, 0.156, 0.5, 0.843 and 1. With no `omniBelow` the weight is 1.

`patterns.js` `deviceGain(dev, dir, freq)` scales the pattern **in dB**:

$$
G_{\text{dev}}(\hat d, f) = w(f)\cdot G(\hat d)
$$

A microphone uses the same function for sound arriving from direction
$\hat d$.

### Directivity factor

`patterns.js` `directivityQ(dev, freq)` computes the on-axis intensity over
the mean intensity across the sphere, sampled at 1500 Fibonacci-sphere points
$\hat d_i$:

$$
Q = \frac{N}{\sum_{i=1}^{N} 10^{G_{\text{dev}}(\hat d_i, f)/10}}
$$

This assumes the on-axis gain is 0 dB and is the maximum, which holds for all
patterns here. `field.js` `cachedQ` caches $Q$ by pattern, coverage,
`omniBelow` and frequency.

| pattern | $Q$ (node) | ideal first-order value |
|---|---|---|
| omni | 1.000 | 1 |
| subcardioid ($a=0.7$) | 1.923 | – |
| cardioid | 3.000 | 3 |
| supercardioid ($a=0.37$) | 3.714 | ≈ 3.7 |
| hypercardioid | 4.000 | 4 |
| figure8 | 3.000 | 3 |
| horn 90×50 | 18.2 | – |
| horn 60×40 | 31.5 | – |

The cardioid monitor with `omniBelow` = 300 Hz has $Q$ = 3.00 at 1 kHz,
2.00 at 300 Hz and 1 at 150 Hz.

A microphone's $Q$ divides the reverberant energy it picks up (chapter 8). It
measures how much of a diffuse field the capsule rejects.

## 6.6 Listeners

`devices.js` `MIC_PRESETS`: listeners are omni receivers at ear height, in
tiers with a weight that sets how much each seat counts in room-wide
averages (chapters 13, 16):

| tier | weight |
|---|---|
| mixer | 3 |
| producer | 2 |
| client | 1.5 |
| entourage | 1 |

Measurement presets (omni, cardioid, supercardioid, figure8) have no tier.
`isListener(m)` tests for a tier.
