// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveThieleSmall,
  calculateEBP,
  calculateSealedBox,
  calculateVentedBox,
  calculatePortLengthMm,
  calculateSplCurve,
  calculateImpedanceCurve,
  calculateExcursionCurve,
  calculateBaffleStepCurve,
} from '../js/acoustics/speakerPhysics.js';

test('deriveThieleSmall extracts or synthesizes consistent T/S parameters', () => {
  const spk = {
    driver: '12" coaxial',
    litres: 44,
    fLow: 45,
    fHigh: 20000,
    sensitivity: 93,
    watts: 100,
  };
  const ts = deriveThieleSmall(spk);
  assert.ok(ts.Fs > 30 && ts.Fs < 70, `Fs=${ts.Fs} should be in 30-70 Hz range for 12" driver`);
  assert.ok(ts.Vas > 20 && ts.Vas < 120, `Vas=${ts.Vas} should be in realistic range`);
  assert.ok(ts.Qts > 0.2 && ts.Qts < 0.8, `Qts=${ts.Qts} should be in realistic range`);
  assert.ok(ts.Qes > 0 && ts.Qms > ts.Qes);
  assert.ok(ts.Re > 3 && ts.Re < 16);
  assert.ok(ts.Sd > 0.03); // > 300 cm^2
});

test('calculateEBP classifies driver suitability accurately', () => {
  // Sealed driver: Fs = 40, Qes = 0.9 -> EBP = 44.4 -> Sealed
  const sealedEBP = calculateEBP(40, 0.9);
  assert.strictEqual(sealedEBP.value, 44.4);
  assert.strictEqual(sealedEBP.preference, 'SEALED PREFERRED');

  // Vented driver: Fs = 45, Qes = 0.35 -> EBP = 128.6 -> Vented
  const ventedEBP = calculateEBP(45, 0.35);
  assert.strictEqual(ventedEBP.value, 128.6);
  assert.strictEqual(ventedEBP.preference, 'VENTED PREFERRED');

  // Flexible driver: Fs = 40, Qes = 0.55 -> EBP = 72.7 -> Either
  const flexibleEBP = calculateEBP(40, 0.55);
  assert.strictEqual(flexibleEBP.preference, 'SEALED OR VENTED');
});

test('calculateSealedBox calculates correct Fc and Qtc', () => {
  // Fs = 40, Qts = 0.4, Vas = 60 L, Vb = 20 L -> alpha = 3 -> sqrt(1+3) = 2
  // Fc = 40 * 2 = 80 Hz, Qtc = 0.4 * 2 = 0.8
  const res = calculateSealedBox({ Fs: 40, Qts: 0.4, Vas: 60 }, 20);
  assert.strictEqual(res.Fc, 80);
  assert.strictEqual(res.Qtc, 0.8);
  assert.strictEqual(res.f3, 71.8);
});

test('calculateVentedBox and calculatePortLengthMm calculate Helmholtz resonance and tube length', () => {
  // Vb = 40 L, Fb = 42 Hz, port dia = 70 mm
  const portLenMm = calculatePortLengthMm({ volumeLitres: 40, tuningFreqHz: 42, portDiameterMm: 70 });
  assert.ok(portLenMm > 80 && portLenMm < 250, `Port length ${portLenMm} mm is realistic`);
});

test('calculateSplCurve generates valid log-spaced frequency points', () => {
  const ts = { Fs: 45, Qts: 0.38, Vas: 50, sensitivity: 90 };
  const curve = calculateSplCurve(ts, { type: 'vented', volumeLitres: 44, tuningFreqHz: 42 });
  assert.ok(curve.length >= 80);
  assert.strictEqual(curve[0].f, 10);
  assert.ok(curve[curve.length - 1].f >= 20000);
  // High frequencies should approach sensitivity level
  const at1k = curve.find((pt) => pt.f >= 1000 && pt.f <= 1100);
  assert.ok(Math.abs(at1k.spl - 90) < 3);
});

test('calculateImpedanceCurve shows impedance peaks at resonance', () => {
  const ts = { Fs: 45, Qts: 0.38, Qes: 0.42, Qms: 4.0, Re: 6.2, Vas: 50 };
  const curve = calculateImpedanceCurve(ts, { type: 'sealed', volumeLitres: 30 });
  assert.ok(curve.length > 0);
  // Peak should be higher than DC Re
  const maxZ = Math.max(...curve.map((pt) => pt.z));
  assert.ok(maxZ > ts.Re * 3, `Max impedance peak ${maxZ} should be significantly higher than Re ${ts.Re}`);
});

test('calculateBaffleStepCurve shows +6 dB transition over baffle frequency', () => {
  const curve = calculateBaffleStepCurve(240); // 240 mm wide baffle
  assert.ok(curve.fStep > 400 && curve.fStep < 550);
  const lowGain = curve.points[0].gainDb;
  const highGain = curve.points[curve.points.length - 1].gainDb;
  assert.ok(lowGain <= 0.2);
  assert.ok(highGain >= 5.8 && highGain <= 6.0);
});
