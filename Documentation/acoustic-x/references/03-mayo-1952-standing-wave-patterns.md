# 3 · Mayo 1952 — Standing-Wave Patterns in Studio Acoustics

> Mayo, C. G., "Standing-Wave Patterns in Studio Acoustics", *Acustica*, Vol. 2, No. 2,
> 1952, pp. 49–64.

**Kind:** journal paper, 16 pages. **Read it for:** the pressure maps in Acoustic X's
Modal Response window, and why bass absorbers go where those maps are brightest.

## What it is

Bolt and Knudsen ([reports 1](01-bolt-1946-normal-frequency-statistics.md) and
[2](02-knudsen-1932-resonances-in-small-rooms.md)) described room modes by their
*frequencies*. Mayo's paper turns to their *shapes*: where in a studio each standing wave
is loud and where it is silent, and what that means for placing microphones, loudspeakers
and absorbers. It was written when European broadcasters were building many small studios
and finding their bass uneven. Acoustic-X took the idea into its pressure display, which
draws a mode or a band of modes on a plane through the room. This report covers the
paper's main themes rather than its figures in detail.

## Big ideas

### 1. Every mode is a map, with loud walls and silent planes

**Summary.** In a rigid rectangular room, a mode's pressure varies as a product of
cosines,

$$\psi_n = \cos\frac{n_x \pi u}{L}\cos\frac{n_y \pi v}{W}\cos\frac{n_z \pi w}{H}$$

It is largest at every wall and in every corner, and zero on nodal planes. An axial mode
of order $n$ along a dimension $\ell$ has $n$ nodal planes, at $u/\ell = (2k-1)/2n$. A
tangential or oblique mode has a chequerboard of loud cells divided by nodal lines. The
pattern is fixed by the room. It does not move with the source.

**Challenge.** For a $6 \times 4.2 \times 2.8$ m room, find the nodal planes of mode 200
by hand: at $Y = 1.5$ m and $Y = 4.5$ m. In Modal Response, Mode 1, enter $2, 0, 0$ and
show it on a horizontal plane. Find the two dark bands and check their distance from the
front wall. Then enter $1, 1, 0$ and find the cross of nodal lines through the middle of the
room.

### 2. A band of modes adds up to loud corners and a quieter middle

**Summary.** What you hear at a seat is not one mode but all the modes a signal excites.
Modes of different frequencies add as energy. Their nodal planes fall in different places,
so in the middle of the room they partly fill each other's gaps. At the walls, edges and
corners every mode is at its maximum, so they all add there. The sum is a map that is
brightest in the corners and dimmer and smoother in the middle.

**Challenge.** In Modal Response, Mode 1, choose multi-mode summation with an LF cut-off
of 28 Hz and an HF cut-off of 90 Hz (thirteen modes, from 100 at 28.6 Hz to 120 at 86.5
Hz). Show relative sound pressure on a horizontal plane at $Z = 1.4$ m, display resolution
0.3 m. Find the value in a corner (1.00) and at the centre of the room, $X = 2.1$, $Y = 3.0$
m (about 0.55). Then move the plane to the floor and find how much the centre value rises
(to about 0.62), and say why: on the floor every height mode is at a maximum.

### 3. Pressure absorbers work where the pressure is

**Summary.** Porous and membrane absorbers take energy from the pressure, or from the air
motion a pressure gradient drives across them, at the surface they are mounted on. A
membrane absorber tuned to a mode does nothing for that mode if it sits on the mode's
nodal plane. Put it where the map is brightest and it works hardest. For one mode that is
any of its loud cells on the walls. For many modes at once it is the corners and edges,
where every mode is loud. This is the reasoning behind corner bass traps.

**Challenge.** Using the summed map of idea 2 at the floor, read the value at the middle of
the front wall ($X = 2.1$, $Y = 0$: about 0.84) and in a front corner (1.00). By the
argument above, rank three places for a bass trap: the middle of the room, the middle of the
front wall, and the corner. Then show mode 010 alone (40.8 Hz) and find where along the front
wall its pressure is zero: at $X = 2.1$ m, the middle. A trap there does nothing for that
mode. A trap in the corner does.

### 4. The source and the seat decide which modes count

**Summary.** A source drives a mode in proportion to $\psi_n$ at the source. A microphone
or listener picks it up in proportion to $\psi_n$ at the seat. So the mode's part in the
response goes as the product $\psi_n(\text{source})\,\psi_n(\text{seat})$. Placing either
on a nodal plane removes that mode from the response. Moving them is the cheapest
treatment there is.

**Challenge.** In the same room, put a speaker at $X = 1.2$, $Y = 0.5$, $Z = 1.2$ m and a
listener on the centre line at $X = 2.1$, $Y = 2.28$, $Z = 1.2$ m (38 % of the length).
Compute $\psi$ at each for modes 100, 010 and 200. You should find, for the speaker and the
listener: 0.97 and 0.37; 0.62 and 0.00; 0.87 and −0.73. Mode 010 is not heard at all on the
centre line. Mode 200 is coupled most strongly, with a product of about −0.63. In the SBIR
window, check which modes the *Mode excited by position* list flags for this speaker.

## Since then

Pressure maps became a standard way to teach room modes, and computer models now draw them
for any room shape. Later work kept the core results: corners are where pressure absorbers
work best for many modes, and source and listener position control the low-frequency
response as much as proportions do. Welti and Devantier (2006) and others used the same
coupling idea to place several subwoofers so that they cancel chosen modes at the seats.

## In this app

- [Modal Response, Pressure display](../03-modal-response.md#pressure-display) and
  [its math](../03-modal-response.md#the-math); `js/acoustx/classic.js` `modeShape`,
  `pressureField`, `MODE_WEIGHTS`.
- [SBIR, Mode excited by position](../04-sbir.md#mode-excited-by-position).
- [Engine chapter 5, Pressure nulls of an axial mode](../../acoustics/05-modes.md#pressure-nulls-of-an-axial-mode);
  `js/acoustics/room.js` `nullFractions`.
- [Engine chapter 8, Modal method](../../acoustics/08-field-methods.md#83-modal-method):
  the full source × seat sum; `js/acoustics/field.js` `prepareModal`, `modalDb`.
- [The advisor, the listening position](../../acoustics/15-advisor.md#152-the-listening-position-mix-seat)
  checks the seat against axial nulls.
- [Engine chapter 13, Sub placement](../../acoustics/13-subs-width.md) scores sub
  positions over the seats.
