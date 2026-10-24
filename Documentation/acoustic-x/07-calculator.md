# 7 · Calculator

`js/acoustx/acoustx.js` (the Calculator window), using `classic.js`. Its tabs are **U**, **ISL**, **Add**, **Wave** and **Comb**.

## U — units conversion

Pick **IMP to MKS** or **MKS to IMP**, a quantity, and a value (`classic.js` `convert`). The factors are exact by definition, except the last two:

| Quantity | MKS | IMP | MKS per IMP |
|---|---|---|---|
| length | m | ft | 0.3048 |
| short length | mm | in | 25.4 |
| area | m² | ft² | 0.09290304 |
| volume | m³ | ft³ | 0.028316846592 |
| absorption | metric sabin (m²) | sabin (ft²) | 0.09290304 |
| speed | m/s | ft/s | 0.3048 |
| mass | kg | lb | 0.45359237 |
| surface density | kg/m² | lb/ft² | 4.882427636 |
| pressure | Pa | psi | 6894.757293 |

Temperature converts as $t_\text{°C} = (t_\text{°F} - 32)\cdot 5/9$.

## ISL — inverse square law

`classic.js` `inverseSquare`. Given a level $L_1$ measured at distance $d_1$, the level at $d_2$ is:

$$\text{Spherical (point source):}\quad L_2 = L_1 - 20\log_{10}\frac{d_2}{d_1}$$
$$\text{Cylindrical (line source):}\quad L_2 = L_1 - 10\log_{10}\frac{d_2}{d_1}$$

A point source loses 6.02 dB per doubling of distance; a line source loses 3.01 dB.

*Example:* 94 dB at 1 m gives 81.96 dB at 4 m spherically, and 87.98 dB cylindrically.

## Add — level addition

`classic.js` `addLevels`. Separate the levels with commas.

**Energy**, for uncorrelated sources, sums the powers:
$$L = 10\log_{10}\sum_i 10^{L_i/10}$$

**Pressure**, for the same signal in phase, sums the pressures:
$$L = 20\log_{10}\sum_i 10^{L_i/20}$$

Two equal energy levels add 3.01 dB; two in phase add 6.02 dB.

*Example:* 90 + 87 + 84 dB as energy is 92.44 dB; 90 + 90 dB in phase is 96.02 dB.

## Wave — frequency, wavelength, period

$$\lambda = \frac{c}{f}, \qquad T = \frac{1}{f}$$

where $c = c(t)$ is the speed of sound at the temperature entered ([chapter 2](02-general-parameters.md)). Type into any one of frequency, wavelength or period, and the other two follow. Metric or imperial applies to the wavelength and to the speed shown.

## Comb — comb-filter nulls

A reflection that arrives $\Delta t$ after the direct sound, or travels $\Delta d = c\,\Delta t$ further, cancels where it is an odd number of half-periods late (`classic.js` `combNulls`):

$$f_k = \frac{2k - 1}{2\,\Delta t}, \qquad k = 1, 2, 3, \dots \qquad \text{spacing} = \frac{1}{\Delta t}$$

Enter either the time or the path difference. The window shows the first three nulls and the spacing.

*Example:* a console-top reflection 1.5 ms late nulls at 333, 1000 and 1667 Hz, every 667 Hz.
