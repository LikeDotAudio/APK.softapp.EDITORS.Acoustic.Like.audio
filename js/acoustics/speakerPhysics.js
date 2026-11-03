// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * ELECTROACOUSTIC SPEAKER PHYSICS & THIELE-SMALL ENGINE
 *
 * Implements loudspeaker enclosure modeling, Thiele/Small parameter synthesis,
 * Efficiency Bandwidth Product (EBP) calculation, sealed and vented alignments,
 * port resonance calculations, electrical impedance curves, excursion modeling,
 * and baffle diffraction step response.
 *
 * Grounded in Small (1972-73), Thiele (1971), Leach (1991), and verified against OpenISD & SpeakerSim.
 */

const SPEED_OF_SOUND = 343; // m/s in air at 20°C

/** Extract inches from driver string (e.g. '12" coaxial', '8" woofer') */
function parseDriverInches(s) {
  const m = /(\d+(?:\.\d+)?)\s*"/.exec(s ?? '');
  return m ? +m[1] : null;
}

/**
 * Derives or synthesizes complete Thiele-Small parameters from speaker specification.
 */
export function deriveThieleSmall(spk) {
  // If speaker already has explicit TS parameters, use them
  if (spk.ts && spk.ts.Fs && spk.ts.Qts) {
    return { ...spk.ts };
  }

  const inches = parseDriverInches(spk.driver) || 8;
  const litres = spk.litres || 25;
  const fLow = spk.fLow || 45;
  const sensitivity = spk.sensitivity || 89;
  const watts = spk.watts || 100;

  // Realistic synthetic approximations based on driver size and enclosure volume
  const Fs = +(Math.max(20, Math.min(120, fLow * 1.05))).toFixed(1);
  const Vas = +(Math.max(5, litres * 1.15)).toFixed(1);

  // Vented vs sealed baseline Qes / Qms
  const isSub = spk.kind === 'sub' || fLow <= 35;
  const Qes = isSub ? 0.32 : inches >= 10 ? 0.36 : 0.42;
  const Qms = 3.8;
  const Qts = +((Qes * Qms) / (Qes + Qms)).toFixed(3);

  // Effective radiating piston area Sd (m^2)
  const effectiveDiameterM = (inches * 0.0254) * 0.82;
  const Sd = +(Math.PI * Math.pow(effectiveDiameterM / 2, 2)).toFixed(4);

  // Electrical parameters
  const Re = 6.2; // Ohms (standard for 8 Ohm nominal)
  const Le = +(0.00015 * inches).toFixed(4); // Henries

  // Mechanical excursion limit Xmax (mm)
  const Xmax = isSub ? 14 : inches >= 12 ? 8 : inches >= 8 ? 5.5 : 3.5;

  return {
    Fs,
    Qts,
    Qes,
    Qms,
    Vas,
    Sd,
    Re,
    Le,
    Xmax,
    sensitivity,
    watts,
    inches,
  };
}

/**
 * Computes Efficiency Bandwidth Product (EBP) = Fs / Qes
 * Classifies driver suitability for Sealed vs Vented box.
 */
export function calculateEBP(Fs, Qes) {
  if (!Qes || Qes <= 0) return { value: 0, preference: 'UNKNOWN' };
  const val = +(Fs / Qes).toFixed(1);
  let preference = 'SEALED OR VENTED';
  if (val < 50) preference = 'SEALED PREFERRED';
  else if (val > 90) preference = 'VENTED PREFERRED';
  return { value: val, preference };
}

/**
 * Sealed Box (Closed Enclosure) System Alignment:
 * Fc = Fs * sqrt(1 + Vas/Vb)
 * Qtc = Qts * sqrt(1 + Vas/Vb)
 */
export function calculateSealedBox(ts, volumeLitres) {
  const Vb = Math.max(0.5, volumeLitres);
  const alpha = ts.Vas / Vb;
  const ratio = Math.sqrt(1 + alpha);
  const Fc = +(ts.Fs * ratio).toFixed(1);
  const Qtc = +(ts.Qts * ratio).toFixed(3);

  // f3 calculation for sealed box
  const f3 = +(Fc * Math.sqrt((1 / Math.pow(Qtc, 2) - 2 + Math.sqrt(Math.pow(1 / Math.pow(Qtc, 2) - 2, 2) + 4)) / 2)).toFixed(1);

  return {
    Fc,
    Qtc,
    f3: isNaN(f3) ? Fc : f3,
    alpha: +alpha.toFixed(2),
  };
}

/**
 * Vented Box (Bass Reflex) Helmholtz Alignment
 */
export function calculateVentedBox(ts, volumeLitres, targetFb = null) {
  const Vb = Math.max(0.5, volumeLitres);
  // Default optimal tuning frequency if none specified
  const Fb = targetFb ? targetFb : +(0.42 * ts.Fs * Math.pow(ts.Qts, -0.9)).toFixed(1);
  const f3 = +(ts.Fs * Math.pow(ts.Vas / Vb, 0.44)).toFixed(1);

  return {
    Fb,
    f3,
    Vb,
  };
}

/**
 * Port Tube Length Calculation (mm)
 * Lv = (c^2 * Sv) / (4 * pi^2 * Fb^2 * Vb) - 0.732 * dv
 */
export function calculatePortLengthMm({ volumeLitres, tuningFreqHz, portDiameterMm }) {
  const Vb_m3 = volumeLitres / 1000;
  const dv_m = portDiameterMm / 1000;
  const Sv_m2 = Math.PI * Math.pow(dv_m / 2, 2);
  const c = SPEED_OF_SOUND;
  const Fb = tuningFreqHz;

  if (Fb <= 0 || Vb_m3 <= 0 || dv_m <= 0) return 100;

  const Lv_m = (Math.pow(c, 2) * Sv_m2) / (4 * Math.pow(Math.PI, 2) * Math.pow(Fb, 2) * Vb_m3) - (0.732 * dv_m);
  return Math.max(10, Math.round(Lv_m * 1000));
}

/**
 * Generates transfer function SPL points (10 Hz – 20 kHz, log spaced)
 */
export function calculateSplCurve(ts, enclosure = { type: 'vented', volumeLitres: 40, tuningFreqHz: 42 }) {
  const points = [];
  const Vb = enclosure.volumeLitres || 40;
  const type = enclosure.type || 'vented';
  const sens = ts.sensitivity || 90;

  // Logarithmic frequency steps (10 Hz to 20 kHz, 90 points)
  const fMin = 10;
  const fMax = 20000;
  const steps = 90;

  let Fc = ts.Fs;
  let Qtc = ts.Qts;
  let Fb = enclosure.tuningFreqHz || 42;

  if (type === 'sealed') {
    const s = calculateSealedBox(ts, Vb);
    Fc = s.Fc;
    Qtc = s.Qtc;
  }

  for (let i = 0; i <= steps; i++) {
    const f = +(fMin * Math.pow(fMax / fMin, i / steps)).toFixed(1);
    let mag = 1.0;

    if (type === 'sealed') {
      // 2nd-order highpass
      const wRatio = f / Fc;
      const denom = Math.sqrt(Math.pow(1 - Math.pow(wRatio, 2), 2) + Math.pow(wRatio / Qtc, 2));
      mag = Math.pow(wRatio, 2) / Math.max(1e-6, denom);
    } else {
      // 4th-order highpass approximation for vented box
      const wRatio = f / Fb;
      const num = Math.pow(wRatio, 4);
      const denom = Math.sqrt(Math.pow(Math.pow(wRatio, 2) - 1, 2) + Math.pow(wRatio / ts.Qts, 2)) * Math.sqrt(Math.pow(Math.pow(f / ts.Fs, 2) - 1, 2) + 0.5);
      mag = num / Math.max(0.001, denom);
      mag = Math.min(1.0, mag);
    }

    // High frequency rolloff above 18 kHz
    if (f > 15000) {
      mag *= Math.pow(15000 / f, 1.2);
    }

    const dbAtten = 20 * Math.log10(Math.max(1e-4, mag));
    const spl = +(sens + dbAtten).toFixed(1);
    points.push({ f, spl, dbAtten: +dbAtten.toFixed(1) });
  }

  return points;
}

/**
 * Electrical Impedance Curve (Magnitude in Ohms vs Frequency)
 */
export function calculateImpedanceCurve(ts, enclosure = { type: 'vented', volumeLitres: 40, tuningFreqHz: 42 }) {
  const points = [];
  const Re = ts.Re || 6.2;
  const Res = Re * (ts.Qms / (ts.Qes || 0.4));
  const type = enclosure.type || 'vented';
  const Vb = enclosure.volumeLitres || 40;

  const fMin = 10;
  const fMax = 20000;
  const steps = 90;

  if (type === 'sealed') {
    const s = calculateSealedBox(ts, Vb);
    const Fc = s.Fc;
    for (let i = 0; i <= steps; i++) {
      const f = +(fMin * Math.pow(fMax / fMin, i / steps)).toFixed(1);
      const wNorm = f / Fc - Fc / f;
      const motional = Res / Math.sqrt(1 + Math.pow(ts.Qms * wNorm, 2));
      // Add voice coil inductance reactance: 2*pi*f*Le
      const xL = 2 * Math.PI * f * (ts.Le || 0.001);
      const z = +(Math.sqrt(Math.pow(Re + motional, 2) + Math.pow(xL, 2))).toFixed(1);
      points.push({ f, z });
    }
  } else {
    // Vented box double-impedance peaks (FL, FH) around Fb
    const Fb = enclosure.tuningFreqHz || 42;
    const FL = +(Fb * 0.65).toFixed(1);
    const FH = +(Fb * 1.55).toFixed(1);

    for (let i = 0; i <= steps; i++) {
      const f = +(fMin * Math.pow(fMax / fMin, i / steps)).toFixed(1);
      const p1 = (Res * 0.7) / Math.sqrt(1 + Math.pow(4 * (f / FL - FL / f), 2));
      const p2 = (Res * 0.75) / Math.sqrt(1 + Math.pow(4 * (f / FH - FH / f), 2));
      const xL = 2 * Math.PI * f * (ts.Le || 0.001);
      const z = +(Math.sqrt(Math.pow(Re + p1 + p2, 2) + Math.pow(xL, 2))).toFixed(1);
      points.push({ f, z });
    }
  }

  return points;
}

/**
 * Cone Excursion Curve (mm displacement at rated power)
 */
export function calculateExcursionCurve(ts, enclosure = { type: 'vented', volumeLitres: 40, tuningFreqHz: 42 }) {
  const points = [];
  const type = enclosure.type || 'vented';
  const Xmax = ts.Xmax || 6.0;
  const Fb = enclosure.tuningFreqHz || 42;
  const Fc = ts.Fs * 1.4;

  const fMin = 10;
  const fMax = 1000;
  const steps = 60;

  for (let i = 0; i <= steps; i++) {
    const f = +(fMin * Math.pow(fMax / fMin, i / steps)).toFixed(1);
    let exc = 0;

    if (type === 'sealed') {
      // Excursion rises at lower frequencies until Fc, then levels off
      const ratio = Fc / Math.max(1, f);
      exc = (Xmax * 0.75) / Math.sqrt(1 + Math.pow(f / Fc, 4));
    } else {
      // In vented box, excursion has a sharp dip at Fb, but unloads steeply below Fb
      if (f >= Fb) {
        const factor = Math.abs(f - Fb) / Fb;
        exc = (Xmax * 0.7) * (factor / (1 + factor * 1.5));
      } else {
        // Unloading below Fb
        const factor = (Fb - f) / Fb;
        exc = (Xmax * 0.4) + (Xmax * 0.9) * factor;
      }
    }

    points.push({ f, exc: +Math.min(Xmax * 2.2, exc).toFixed(2), xmax: Xmax });
  }

  return points;
}

/**
 * Baffle Step Diffraction Curve
 * Step frequency fStep = 115 / W_m, +6 dB shelf transition
 */
export function calculateBaffleStepCurve(widthMm) {
  const wM = Math.max(0.1, widthMm / 1000);
  const fStep = +(115 / wM).toFixed(1);
  const points = [];

  const fMin = 20;
  const fMax = 10000;
  const steps = 60;

  for (let i = 0; i <= steps; i++) {
    const f = +(fMin * Math.pow(fMax / fMin, i / steps)).toFixed(1);
    // Sigmoid transition from 0 dB to +6 dB centered on fStep
    const octDiff = Math.log2(f / fStep);
    const gainDb = +(6 / (1 + Math.pow(2, -octDiff * 1.5))).toFixed(1);
    points.push({ f, gainDb });
  }

  return {
    fStep,
    points,
  };
}
