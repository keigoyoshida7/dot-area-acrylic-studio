'use strict';
const assert = require('node:assert/strict');
const Geometry = require('../model.js');
const Transport = require('../transport.js');
const PHI = Geometry.PHI, GOLD = 1 / PHI ** 2;
const original = { W: 1618, B: 1618 / PHI, D: 1618 / PHI, H: 1000, w: 1618 * GOLD, d: 1618 / PHI * GOLD, ox: 0, oz: 0, t: 5, density: 1.19, baseElevation: 0, showStone: true, topLock: true };
const low = { ...original, H: original.W * GOLD };
function close(actual, expected, relative = 1e-10) { assert.ok(Math.abs(actual - expected) <= relative * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`); }
function byId(result, id) { return result.metrics.find(metric => metric.id === id); }

// Independently normalize the low shape by H: W:D:H = phi²:phi:1, not phi:phi:1.
close(low.W / low.H, PHI ** 2);
close(low.D / low.H, PHI);
const proportions = Geometry.proportions(low);
assert.equal(proportions.metrics.length, 7);
assert.equal(new Set(proportions.metrics.map(metric => metric.id)).size, 7);
assert.equal(proportions.tolerance, 1e-8);
assert.equal(proportions.similarTop, true);
assert.ok(proportions.metrics.every(metric => metric.matches));
['basePlan', 'topPlan', 'baseAspect', 'topAspect', 'depthHeight'].forEach(id => close(byId(proportions, id).actual, PHI));
close(byId(proportions, 'widthHeight').actual, PHI ** 2);
close(byId(proportions, 'widthHeight').target, PHI ** 2);
close(byId(proportions, 'topScale').actual, GOLD);
close(byId(proportions, 'topScale').depthActual, GOLD);
assert.equal(byId(proportions, 'topScale').sameScale, true);
assert.equal(byId(proportions, 'topScale').targetSymbol, '1/φ²');

// Golden plans alone do not make the vertical dimensions golden in the original taller preset.
const originalRatios = Geometry.proportions(original);
assert.equal(byId(originalRatios, 'depthHeight').matches, false);
assert.equal(byId(originalRatios, 'widthHeight').matches, false);
['basePlan', 'topPlan', 'baseAspect', 'topAspect', 'topScale'].forEach(id => assert.equal(byId(originalRatios, id).matches, true));

// FIL scaling changes absolute dimensions, while translation and installation height change no ratios.
const scaledState = Transport.calculate(low).scaledState;
const scaled = Geometry.proportions(scaledState);
proportions.metrics.forEach((metric, index) => {
  close(scaled.metrics[index].actual, metric.actual);
  assert.equal(scaled.metrics[index].matches, metric.matches);
});
close(byId(scaled, 'topScale').depthActual, GOLD);
const offset = Geometry.proportions({ ...low, ox: 50, oz: -30, baseElevation: 700 });
assert.deepEqual(offset, proportions);

// Arbitrary dimensions are measured as entered; none of these seven target ratios happens to match.
const custom = { ...original, W: 1600, B: 1100, D: 1250, H: 700, w: 700, d: 500, topLock: false };
const snapshot = JSON.stringify(custom), customRatios = Geometry.proportions(custom);
assert.ok(customRatios.metrics.every(metric => !metric.matches));
assert.equal(customRatios.similarTop, false);
assert.equal(JSON.stringify(custom), snapshot);
close(byId(customRatios, 'basePlan').actual, 1600 / 1100);
close(byId(customRatios, 'basePlan').relativeDeviation, ((1600 / 1100) - PHI) / PHI);
assert.ok(byId(customRatios, 'basePlan').relativeDeviation < 0);
assert.ok(byId(customRatios, 'depthHeight').relativeDeviation > 0);

// The upper width can match the target while its independent depth does not: never report both as golden.
const nonSimilar = Geometry.proportions({ ...original, d: original.d * 0.9, topLock: false });
const topScale = byId(nonSimilar, 'topScale');
close(topScale.actual, GOLD); close(topScale.relativeDeviation, 0);
close(topScale.depthActual, GOLD * 0.9); close(topScale.depthRelativeDeviation, -0.1);
assert.equal(topScale.matches, false); assert.equal(topScale.sameScale, false); assert.equal(nonSimilar.similarTop, false);
assert.equal(byId(nonSimilar, 'topPlan').matches, false);
assert.equal(byId(nonSimilar, 'topAspect').matches, false);

// Both existing golden-scale shortcuts remain recognized with their exact target symbols.
const alternateScale = Geometry.proportions({ ...low, w: low.W / PHI, d: low.D / PHI });
assert.equal(alternateScale.similarTop, true);
assert.equal(byId(alternateScale, 'topScale').matches, true);
assert.equal(byId(alternateScale, 'topScale').targetSymbol, '1/φ');
close(byId(alternateScale, 'topScale').target, 1 / PHI);
assert.equal(byId(alternateScale, 'topPlan').matches, true);
const mixedScales = Geometry.proportions({ ...low, w: low.W / PHI, d: low.D / PHI ** 2 });
assert.equal(byId(mixedScales, 'topScale').targetSymbol, '1/φ');
assert.equal(byId(mixedScales, 'topScale').matches, false);
assert.equal(byId(mixedScales, 'topScale').sameScale, false);
close(byId(mixedScales, 'topScale').relativeDeviation, 0);
assert.ok(byId(mixedScales, 'topScale').depthRelativeDeviation < 0);
const reverseMixed = Geometry.proportions({ ...low, w: low.W / PHI ** 2, d: low.D / PHI });
assert.equal(byId(reverseMixed, 'topScale').targetSymbol, '1/φ²');
assert.equal(byId(reverseMixed, 'topScale').matches, false);
assert.equal(reverseMixed.similarTop, false);

// Matching uses relative tolerance and retains the deviation sign for the percentage UI.
const insideTolerance = Geometry.proportions({ ...low, H: low.H * (1 + 0.5e-8) });
assert.equal(byId(insideTolerance, 'depthHeight').matches, true);
assert.ok(byId(insideTolerance, 'depthHeight').relativeDeviation < 0);
const outsideTolerance = Geometry.proportions({ ...low, H: low.H * (1 + 2e-8) });
assert.equal(byId(outsideTolerance, 'depthHeight').matches, false);
assert.equal(byId(outsideTolerance, 'widthHeight').matches, false);
assert.throws(() => Geometry.proportions({ ...low, H: 0 }), RangeError);
assert.throws(() => Geometry.proportions({ ...low, w: 0 }), RangeError);
console.log('Proportion checks passed: low phi²:phi:1 dimensions, golden plan ratios, signed deviations, FIL invariance, offsets, custom/non-similar upper geometry, relative tolerance, input preservation.');
