# 2 · General parameters

**Acoustic X ▾ → General Parameters…** has three tabs:

- **General:** temperature, humidity, Display Axis and units.
- **Modal Response:** favourable ratios and modal weights. See [chapter 3](03-modal-response.md).
- **SBIR:** search limits, the minimum distance between speakers, and surround options. See [chapter 4](04-sbir.md).

The temperature sets the speed of sound for every Acoustic X window. The humidity, together with the temperature, sets the air absorption the ray trace applies.

## Speed of sound

`classic.js` `speedOfSound(t)`: an ideal gas, with the speed scaling as the square root of the absolute temperature:

$$c(t) = 331.3\,\sqrt{1 + \frac{t}{273.15}} \quad \text{m/s}$$

where $t$ is in °C.

| $t$ | 0 °C | 20 °C | 30 °C |
|---|---|---|---|
| $c$ | 331.30 m/s | 343.21 m/s | 349.02 m/s |

The main app uses a fixed $c = 343$ m/s (`js/acoustics/bands.js` `C`), and its mode tables are built at that speed. Since $f \propto c/\text{size}$, Acoustic X gets a mode's frequency at another temperature by evaluating those tables for a box scaled by $343/c$ (`dimsAtC`). The mode indices are unchanged, and the frequencies come out as they would at $c$. The SBIR deviation does the same thing in frequency, evaluating at $f \cdot 343/c$.

## Air absorption — ISO 9613-1

`classic.js` `airDbPerM(f, t, rh, p_a)` implements ISO 9613-1:1993, equations 3 to 5. These are the absorption of pure tones by the atmosphere, from the relaxation of oxygen and nitrogen.

Let $T = t + 273.15$ K, $T_0 = 293.15$ K, $T_{01} = 273.16$ K and $p_r = p_a / 101.325$ kPa.

The saturation vapour pressure and the molar concentration of water vapour, in %:

$$p_\text{sat}/p_r = 10^{\,-6.8346\,(T_{01}/T)^{1.261} + 4.6151}, \qquad h = \frac{h_r\, p_\text{sat}}{p_r}$$

where $h_r$ is the relative humidity in %.

The relaxation frequencies of oxygen and nitrogen:

$$f_{rO} = p_r\left(24 + 4.04\times10^4\, h\, \frac{0.02 + h}{0.391 + h}\right)$$
$$f_{rN} = p_r\,(T/T_0)^{-1/2}\left(9 + 280\, h\, e^{-4.170\left[(T/T_0)^{-1/3} - 1\right]}\right)$$

The attenuation coefficient, in dB per metre:

$$\alpha = 8.686\, f^2\left[1.84\times10^{-11}\, p_r^{-1}\,(T/T_0)^{1/2} + (T/T_0)^{-5/2}\left(\frac{0.01275\, e^{-2239.1/T}}{f_{rO} + f^2/f_{rO}} + \frac{0.1068\, e^{-3352/T}}{f_{rN} + f^2/f_{rN}}\right)\right]$$

At 20 °C (the values match the standard's tables):

| $f$ | 125 Hz | 500 Hz | 1 kHz | 4 kHz | 8 kHz |
|---|---|---|---|---|---|
| 50 % RH | 0.44 dB/km | 2.73 | 4.66 | 29.7 | 105 |
| 20 % RH | 0.71 | 2.59 | 6.53 | 74.7 | 217 |

Dry air takes much more of the treble. In a small room this matters little: a 13-bounce ray path in a 6 m room is about 30 m long, and 30 m × 30 dB/km is 0.9 dB at 4 kHz.

Ray Tracing applies it per metre travelled, at the centre frequency of the chosen octave band. A **measured** empty-room RT ([chapter 6](06-reverb-time.md)) already contains the air, so none is added to it.
