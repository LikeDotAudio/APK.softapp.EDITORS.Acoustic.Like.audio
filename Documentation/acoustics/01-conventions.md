# 1. Conventions, bands and constants

Every other chapter relies on the definitions here. They live in
`js/acoustics/bands.js` and `js/acoustics/geometry.js`.

## 1.1 Units and coordinates

| Quantity | Unit |
|---|---|
| length, position | m |
| time | s (ms where a name ends in `Ms`) |
| frequency | Hz |
| level | dB SPL re 20 µPa, unless a value is called a deviation or "relative" |
| angle | degrees in the data, radians inside trigonometry (`DEG` $=\pi/180$) |

The plan uses the CAD's sheet frame: $x$ to the right, $y$ up the sheet,
metres. Height $z$ is measured up from the sheet's zero, and the floor of a
flat room sits at $z=0$. A plan bearing is in degrees counter-clockwise
from $+x$, so `frontDeg = 90` means the front wall is at the top of the sheet.

## 1.2 Octave bands

```
BANDS       = [125, 250, 500, 1000, 2000, 4000]   Hz
BAND_LABELS = ['125 Hz', … , '4 kHz']
```

Every per-band array in the engine (material $\alpha$ and $s$, air loss,
$RT_{60}$, image reflection factors) is indexed by the same index
$b = 0\ldots5$. When a method works at a single frequency $f$ it reads the
band whose centre is nearest in log frequency:

$$
b(f) = \arg\min_i \left|\ln\frac{f}{f_i}\right|
$$

This is `js/acoustics/field.js` `nearestBand` and, with the same formula,
`js/acoustics/sbir.js` `bandFor`. Below 125 Hz band 0 is used and above
4 kHz band 5, so the extreme bands also cover everything outside the table.

## 1.3 Speed of sound

$$
c = 343\ \text{m/s}
$$

`js/acoustics/bands.js` `C`, about 20 °C. It is a constant: nothing in the
engine depends on temperature. `js/acoustics/layouts.js` `layoutCheck`
writes the literal `343`, which is the same value.

## 1.4 Air absorption

`AIR_DB_PER_M` holds the attenuation per metre, $a_b$ in dB/m, at 20 °C and
50 % RH. The source comment cites ISO 9613-1, rounded:

| band | 125 | 250 | 500 | 1k | 2k | 4k |
|---|---|---|---|---|---|---|
| $a_b$ (dB/m) | 0.00044 | 0.0013 | 0.0027 | 0.005 | 0.009 | 0.0229 |

The methods use it in two ways.

**On a path.** Over a path of length $r$ the energy loses $a_b r$ dB (the
amplitude loses $a_b r/2$ in dB terms, i.e. $10^{-a_b r/20}$ as a factor).
The wave sum, the energy method and the echogram all apply it this way.

**As an intensity coefficient** $m$ (1/m), the form that goes into Sabine and
Eyring (`airM`):

$$
m_b = \frac{a_b}{10\log_{10}e} = \frac{a_b}{4.343}
$$

So the energy decays as $e^{-m r}$. For example, $m = 0.00062\ \text{m}^{-1}$
at 500 Hz and $0.0053\ \text{m}^{-1}$ at 4 kHz.

## 1.5 Level arithmetic

| function | computes |
|---|---|
| `bands.js` `dbSum(levels)` | $10\log_{10}\sum_i 10^{L_i/10}$ (non-finite terms skipped; $-\infty$ for none) |
| `bands.js` `toEnergy(db)` | $10^{L/10}$, 0 for non-finite $L$ |
| `bands.js` `toDb(e)` | $10\log_{10} e$, $-\infty$ for $e \le 0$ |

"Energy" here means a quantity proportional to mean-square pressure,
$p^2/p_0^2$. Incoherent sources add in this domain. Coherent ones add as
complex pressure (chapter 8).

## 1.6 Plane geometry (`js/acoustics/geometry.js`)

A polygon is a list of vertices $\{x,y\}$, implicitly closed.

**Signed area** (shoelace), `signedArea`:

$$
A = \tfrac12\sum_i (x_i y_{i+1} - x_{i+1} y_i)
$$

It is positive for a counter-clockwise loop. `ensureCCW` reverses a loop whose
$A<0$.

**Centroid**, `centroid`:

$$
\bar x = \frac{\sum_i (x_i+x_{i+1})\,c_i}{3\sum_i c_i},\quad
\bar y = \frac{\sum_i (y_i+y_{i+1})\,c_i}{3\sum_i c_i},\quad
c_i = x_i y_{i+1}-x_{i+1}y_i
$$

A degenerate loop (area below $10^{-12}$) returns its first vertex.

**Point in polygon**, `pointInPolygon`, uses the even–odd ray-crossing test.

**Simplification**, `simplifyPolygon(poly, eps = 1e-3)`, drops a vertex
when its perpendicular distance to the line through its two neighbours is at
most `eps`, or when it lies within `eps` of the previous vertex. If fewer than
three vertices would remain, the input is returned unchanged.

**Convexity**, `isConvex`, checks that the $z$ components of the cross products
of consecutive edges all have the same sign. Collinear triples
($|z|<10^{-9}$) are skipped.

**Mirror across a wall line**, `mirrorPoint(p, a, n)`, where $\hat n$ is the
wall's unit normal and $a$ a point on it:

$$
d = (\mathbf p-\mathbf a)\cdot\hat n,\qquad \mathbf p' = \mathbf p - 2d\,\hat n
$$

**Distance to a segment**, `distToSegment`, clamps the projection parameter to
$[0,1]$.

**Segment intersection**, `segmentCross(p, q, a, b)`, solves
$\mathbf p + t(\mathbf q-\mathbf p) = \mathbf a + u(\mathbf b-\mathbf a)$ and
returns $\{t,u\}$ when both lie in $[0,1]$. Parallel segments
($|\text{den}|<10^{-12}$) return `null`.

**Angle difference**, `angleDiff(a, b)`, gives the signed smallest $a-b$,
wrapped to $(-180°, 180°]$.
