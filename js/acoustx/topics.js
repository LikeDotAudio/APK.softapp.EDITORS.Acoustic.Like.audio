// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * TOPICS — the history and the sources behind a group of controls
 *
 * A fieldset whose legend is a key here grows a 📖 button; it opens a small
 * pop-up with where the idea came from and which of the suggested
 * references (Documentation/acoustic-x/references/) to read, each a link
 * into Help. Keyed by the legend text, so a window opts in by naming its
 * group the way this table does. `history` is plain text, short: who, when,
 * what changed since. `refs` are report numbers.
 */

/** Report number → [file under Documentation/acoustic-x/references/, short citation]. */
export const REPORTS = {
  1: ['01-bolt-1946-normal-frequency-statistics.md', 'Bolt 1946'],
  2: ['02-knudsen-1932-resonances-in-small-rooms.md', 'Knudsen 1932'],
  3: ['03-mayo-1952-standing-wave-patterns.md', 'Mayo 1952'],
  4: ['04-louden-1971-dimension-ratios.md', 'Louden 1971'],
  5: ['05-sepmeyer-1965-normal-modes.md', 'Sepmeyer 1965'],
  6: ['06-bonello-1979-room-mode-criterion.md', 'Bonello 1979'],
  7: ['07-haas-1972-single-echo.md', 'Haas 1951/1972'],
  8: ['08-schroeder-1965-reverberation-time.md', 'Schroeder 1965'],
  9: ['09-beranek-1962-music-acoustics-architecture.md', 'Beranek 1962'],
  10: ['10-beranek-1954-acoustics.md', 'Beranek 1954'],
  11: ['11-rettinger-1973-acoustic-design-noise-control.md', 'Rettinger 1973'],
  12: ['12-everest-1989-master-handbook.md', 'Everest 1989'],
  13: ['13-everest-1988-budget-recording-studio.md', 'Everest 1988'],
  14: ['14-dantonio-konnert-1984-rfz-rpg.md', "D'Antonio & Konnert 1984"],
  15: ['15-dantonio-konnert-1986-new-materials.md', "D'Antonio & Konnert 1986"],
  16: ['16-berger-1984-sbir.md', 'Berger 1984'],
  17: ['17-egan-1988-architectural-acoustics.md', 'Egan 1988'],
  18: ['18-eargle-1989-sound-system-design.md', 'Eargle 1989'],
  19: ['19-fitzroy-1959-reverberation-formula.md', 'Fitzroy 1959'],
  20: ['20-tipler-1991-physics.md', 'Tipler 1991'],
  21: ['21-elmore-1969-physics-of-waves.md', 'Elmore & Heald 1969'],
  22: ['22-franz-1990-elektro-akustik.md', 'Franz 1990'],
  23: ['23-helmholtz-1954-sensations-of-tone.md', 'Helmholtz 1863/1954'],
  24: ['24-fasold-1987-bau-und-raumakustik.md', 'Fasold, Sonntag & Winkler 1987'],
  25: ['25-hall-1980-musical-acoustics.md', 'Hall 1980'],
  26: ['26-cooper-1988-building-a-recording-studio.md', 'Cooper 1988'],
};

/** Legend → { history, refs }. */
export const TOPICS = {
  // ── Modal Response
  'Enter Input Data': {
    history: 'Room modes of a rigid box were worked out by Rayleigh (1877) and put to rooms by Knudsen (1932) and by Morse and Bolt in the 1930s–40s. Small rooms are judged by their modes because below the Schroeder frequency the room rings at a few separate frequencies, not as a diffuse field.',
    refs: [2, 1, 21],
  },
  'Favourable Room Ratios': {
    history: 'Ratios have been proposed since the 1940s: Bolt (1946) charted an area of good ratios, Sepmeyer (1965) computed three, Louden (1971) searched a grid and ranked what it found, Volkmann and others argued for geometric series. Cox, D’Antonio & Avis (2004) showed the best ratio also depends on where the source and listener are.',
    refs: [1, 5, 4, 12],
  },
  'Bonello Criterion': {
    history: 'Oscar Bonello (AES preprint 1530, 1979; JAES 1981) counted modes per third octave, the band the ear integrates over: the count must not fall, and coincidences are allowed only in bands of five or more. Later listening tests found it only loosely predicts preference, but it catches the worst rooms fast.',
    refs: [6, 1],
  },
  'Modes per 1/3 Octave — actual against ideal': {
    history: 'The blue ideal is Bolt’s 1946 average mode count, after Morse: a volume term with surface and edge corrections. The green bars are what this box actually has. Bonello (1979) read the same histogram as a pass/fail test.',
    refs: [1, 6],
  },
  'Bolt Area': {
    history: 'Bolt (1946) computed how irregular the mode spacing is over a grid of ratios and charted the region where it is smoothest — the “Bolt area” handbooks have reprinted since. This map is computed the same way, with this app’s score; the dashed lines are the ITU-R BS.1116 bounds (after Walker), which grew out of that tradition.',
    refs: [1, 12, 4],
  },
  'Spacing Index (Louden)': {
    history: 'Louden (1971) scored every ratio on a grid by the spread of its low mode spacing and published the ranking; 1 : 1.4 : 1.9 came first. A ratio is scale-free, so the index uses the lowest 30 modes whatever the size.',
    refs: [4],
  },
  'Axial Spacing (Everest)': {
    history: 'Everest’s handbooks (1981–2009) teach checking the axial modes by hand: no two the same, and no gap wider than about 20 Hz below 300 Hz (after Gilford, 1959). It is the quickest test there is, and the bluntest.',
    refs: [12, 13],
  },
  'Enter Mode Index': {
    history: 'Each mode is named by three whole numbers, the half-waves it fits along length, width and height (Rayleigh’s notation). Mayo (1952) mapped the pressure patterns of studio modes to show where absorbers work and where they do nothing.',
    refs: [3, 21],
  },
  'Mode Decay (Knudsen)': {
    history: 'Knudsen (1932) heard small rooms ring at their modes and measured decays that beat, with two slopes. Morse & Bolt then showed each mode decays at its own rate, set by the walls it presses on: an axial mode loses energy only weakly to the walls it runs along. The curve here is the band’s modes struck together and left to ring.',
    refs: [2, 1],
  },
  'Mode Directions (Sepmeyer)': {
    history: 'Sepmeyer (1965) computed, with an early computer, not only the frequencies but the directions of rectangular-room modes, and how they spread over angle; even spread in angle as well as in frequency was part of what made his ratios good.',
    refs: [5],
  },
  'Display Parameter': {
    history: 'Mayo’s 1952 maps showed pressure, and where it peaks: pressure absorbers (porous material, membranes) belong where the pressure is high — for many modes at once, the corners.',
    refs: [3, 12],
  },
  // ── SBIR
  'Speaker Critical Frequency': {
    history: 'Russ Berger’s Tech Topic (Syn-Aud-Con, 1984) named Speaker Boundary Interference Response: the notch a loudspeaker’s own reflection off a nearby wall cuts at c/4d. Allison had measured the effect in the 1970s. Acoustic-X searched positions to minimise it, and this window still does.',
    refs: [16, 12],
  },
  'Mode Excited By Position': {
    history: 'A loudspeaker drives a mode in proportion to the mode’s pressure where it stands, and a listener hears it in proportion to the pressure at the seat (Morse & Bolt; Mayo 1952). Moving either one changes which modes count.',
    refs: [3, 16],
  },
  'Valid Listening Window': {
    history: 'The reflection-free zone of D’Antonio & Konnert (1984): absorb or redirect the early side and ceiling reflections round the mix position, so the direct sound and the diffuse return from the back are all that arrive in the first 15–20 ms. It grew from Davis’s LEDE rooms (1980) and Haas’s precedence work.',
    refs: [14, 7],
  },
  'Specular Absorbers': {
    history: 'Placing absorbers at the mirror points — where a source’s image sees the listener in each wall — is the textbook way to clear the first reflections. Everest and D’Antonio both teach it.',
    refs: [14, 12],
  },
  Absorption: {
    history: 'Absorption coefficients are measured in a reverberation chamber (Sabine’s method, now ISO 354). Porous absorbers work best a quarter-wave from a wall; resonant ones (membranes, Helmholtz, perforated panels) are tuned to a band.',
    refs: [17, 11, 12],
  },
  // ── Ray tracing
  Trace: {
    history: 'Ray tracing for rooms began with Krokstad, Strøm & Sørsdal (1968), after image-source methods; Acoustic-X followed equal-area rays for up to fourteen bounces and caught them in a sphere at the listener. Every modern program (ODEON, CATT, EASE) still does a version of this.',
    refs: [10, 12],
  },
  'Precedence & Echo (Haas)': {
    history: 'Helmut Haas’s 1951 Göttingen dissertation (JAES translation 1972) showed a reflection within about 30 ms fuses with the direct sound, which keeps the direction, and can be up to 10 dB louder before listeners are disturbed. Later ones are heard as echoes. Delayed loudspeakers and the reflection-free window both rest on it.',
    refs: [7, 14],
  },
  'Decay (Schroeder)': {
    history: 'Schroeder (1965) showed that integrating the squared impulse response backwards gives, in one shot, the average of infinitely many noise decays. ISO 3382 has used it for EDT, T20 and T30 ever since. Here it integrates the traced arrivals, so the tail ends where the trace stops.',
    refs: [8],
  },
  // ── Reverb time
  'Calculation Method': {
    history: 'Sabine (1900) found T = 0.161 V / A; Eyring (1930) corrected it for dead rooms; Fitzroy (1959) averaged the three axes separately, which suits rooms whose absorption sits on one pair of surfaces. All three assume some diffuse field; small rooms only approach one.',
    refs: [19, 10, 17],
  },
  'Criteria Type': {
    history: 'Target reverb times come from experience: Beranek’s 1962 survey of 54 halls for music, EBU Tech 3276 for control rooms, cinema guidance for film. A target is a range, and it rises toward the bass in rooms for music (the bass ratio).',
    refs: [9, 12, 17],
  },
  'Hall Checks (Beranek)': {
    history: 'Beranek (1962) rated 54 concert halls from interviews with conductors and critics and tied the ratings to measurable things: the initial-time-delay gap, the mid reverb time and the bass ratio (T125 + T250) / (T500 + T1000). He revised the scheme in 1996 and 2004.',
    refs: [9],
  },
  'RT60 Of Empty Room (s)': {
    history: 'Measuring the empty room first and then adding treatment by area is how Acoustic-X worked, and how practice still works. Schroeder’s backward integration (1965) made the measurement repeatable.',
    refs: [8, 12],
  },
  // ── Calculator and general
  Environment: {
    history: 'The speed of sound rises about 0.6 m/s per °C (Laplace’s adiabatic correction to Newton, 1816). Air absorption at high frequencies depends on humidity; ISO 9613-1 (1993) fixed the method.',
    refs: [20, 21],
  },
  'Inverse Square Law': {
    history: 'A point source spreads its power over a sphere, so intensity falls as 1/r²: 6 dB per doubling of distance. A line source spreads over a cylinder: 3 dB. Every physics text derives it (Tipler, Elmore & Heald).',
    refs: [20, 18],
  },
  'Level Addition': {
    history: 'Uncorrelated sources add in power (two equal ones give +3 dB); the same signal in phase adds in pressure (+6 dB). The decibel itself came from Bell Labs telephony in the 1920s.',
    refs: [20, 22],
  },
  'Frequency / Wavelength / Period': {
    history: 'λ = c / f: from 17 m at 20 Hz to 17 mm at 20 kHz. Whether a room, a panel or a diffuser well is big or small is always a matter of its size against the wavelength.',
    refs: [20, 21, 25],
  },
  'Comb-Filter': {
    history: 'A delayed copy of a sound cancels it wherever the delay is an odd number of half periods: nulls at 1/2Δt, 3/2Δt, … The console reflection and SBIR are both comb filters.',
    refs: [16, 12],
  },
  'Mass Law & Rw': {
    history: 'Single walls follow the mass law, about 6 dB more loss per doubling of mass or of frequency, until coincidence, where the wall’s bending waves match the sound’s trace and it lets sound through. Double walls dip at their mass–air–mass resonance, then gain fast. ISO 717-1 condenses a curve to one number, Rw; the American STC (ASTM E413) does the same with its own contour.',
    refs: [11, 17, 24],
  },
  Resonators: {
    history: 'Helmholtz (1863) used tuned bottles to pick partials out of a sound; the same resonator, built into walls, absorbs a band. Perforated and slotted panels over an air gap are arrays of them; membrane (panel) absorbers trade the neck for a limp sheet. Rettinger and Everest gave the design formulas studio builders use.',
    refs: [23, 11, 12, 13],
  },
  'QRD Diffuser': {
    history: 'Schroeder (1975) showed that wells of depth set by a number sequence scatter sound evenly; D’Antonio & Konnert made the quadratic-residue diffuser a product (RPG, 1983 on) and built the RFZ room around it. It works from about the design frequency up to where the wells are half a wavelength wide.',
    refs: [15, 14],
  },
  'Background Noise (NC)': {
    history: 'Beranek introduced the noise-criterion (NC) curves in 1957 to rate background noise from ventilation and plant by one number. Studios aim at NC 15–20. Later curves (NR, RC, NCB) refined the shape; NC is still the common language with mechanical engineers.',
    refs: [17, 13, 26, 11],
  },
  'Speech & Gain': {
    history: 'Peutz (1971) related the articulation loss of consonants to distance, reverb time and directivity; Don and Carolyn Davis (Syn-Aud-Con) gave the potential-acoustic-gain equation for feedback. STI (Houtgast & Steeneken, 1970s) later replaced %ALcons as the measure, and this app computes STI elsewhere.',
    refs: [18],
  },
  'Ceiling Speakers': {
    history: 'Distributed ceiling systems are laid on a grid from the coverage angle and the height above the ear: edge to edge is cheapest, centre to centre is the most even. Eargle’s handbook gives the three standard spacings.',
    refs: [18],
  },
  'Piston & Box': {
    history: 'Beranek’s 1954 Acoustics treats a loudspeaker as a piston in a baffle, using circuit analogies: below ka ≈ 1 it radiates in all directions; above it narrows. Thiele and Small (1971–73) gave the closed-box and vented-box alignments still used to design enclosures.',
    refs: [10, 22],
  },
  'Electrical Levels': {
    history: 'dBu is referred to 0.775 V (1 mW in 600 Ω, the old telephone line), dBV to 1 V. Sensitivity (dB at 1 W, 1 m) and amplifier power give the SPL a system can make.',
    refs: [22, 18],
  },
  'Impedance Step': {
    history: 'A wave meeting a change of characteristic impedance ρc reflects; the bigger the mismatch, the more. Air against a wall is a mismatch of tens of thousands, which is why rigid walls reflect almost everything and absorption needs porous or resonant structure.',
    refs: [21, 20],
  },
  'Two Tones': {
    history: 'Helmholtz (1863) explained dissonance as the roughness of beating partials and described combination tones. Plomp & Levelt (1965) measured the roughness curve against the critical band; Hall’s text teaches both.',
    refs: [23, 25],
  },
  Loudness: {
    history: 'Fletcher & Munson (1933) drew the equal-loudness contours (now ISO 226); the phon is the level of an equally loud 1 kHz tone. Stevens (1936) made the sone: twice the sones, twice as loud, about every 10 phons.',
    refs: [25, 22],
  },
};

/** The topic for a legend, or null. */
export const topicFor = (legend) => (typeof legend === 'string' ? (TOPICS[legend] ?? null) : null);
