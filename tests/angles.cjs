'use strict';
const assert = require('node:assert/strict');
const Geometry = require('../model.js');
const Transport = require('../transport.js');
const PHI = Geometry.PHI, k = 1 / PHI ** 2;
const original = { W: 1618, B: 1618 / PHI, D: 1618 / PHI, H: 1000, w: 1618 * k, d: 1618 / PHI * k, ox: 0, oz: 0, t: 5, density: 1.19, includeBase: false, includeTop: false, showStone: true, baseLock: true, basePlanLock: true, topLock: true, taper: k, preset: 'golden' };
function close(actual, expected, relative = 1e-10) { assert.ok(Math.abs(actual - expected) <= relative * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`); }
function independentAngles(model) {
  model.edges.filter(edge => edge.kind === 'side').forEach(edge => {
    const a = model.vertices[edge.a], b = model.vertices[edge.b];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    close(edge.inclination, Math.asin(Math.abs(dy) / edge.length) * 180 / Math.PI);
    close(edge.frontInclination, Math.acos(Math.abs(dx) / Math.hypot(dx, dy)) * 180 / Math.PI);
  });
}
const snapshot = JSON.stringify(original);
const spatialState = Geometry.slopePreset(original, 'spatial');
const frontState = Geometry.slopePreset(original, 'front');
assert.equal(JSON.stringify(original), snapshot);
assert.notEqual(spatialState, original);
close(spatialState.H, 339.41578259867686); close(spatialState.oz, -124.99737422466626);
close(frontState.H, 318.5284391902398); close(frontState.ox, 0); close(frontState.oz, 0);
const spatial = Geometry.calculate(spatialState), front = Geometry.calculate(frontState);
spatial.edges.filter(edge => edge.kind === 'side').forEach(edge => { close(edge.inclination, 32.5); close(edge.length, 631.7067374067129); });
front.edges.filter(edge => ['AE', 'BF'].includes(edge.id)).forEach(edge => close(edge.frontInclination, 32.5));
assert.ok(Math.abs(front.edges.find(edge => edge.id === 'AE').inclination - 32.5) > 1);
assert.ok(Math.abs(spatial.edges.find(edge => edge.id === 'AE').frontInclination - 32.5) > 1);
[original, spatialState, frontState].forEach(state => independentAngles(Geometry.calculate(state)));
['W', 'B', 'D', 'w', 'd', 't', 'density', 'showStone', 'includeBase', 'includeTop', 'baseLock', 'basePlanLock', 'topLock', 'taper', 'preset'].forEach(key => {
  assert.equal(spatialState[key], original[key]); assert.equal(frontState[key], original[key]);
});
close(spatial.state.W / spatial.state.B, PHI); close(spatial.state.w / spatial.state.b, PHI);
// The special offset is necessary: a centered top gives unequal actual front/rear inclinations.
const centered = Geometry.calculate({ ...spatialState, oz: 0 });
assert.ok(Math.abs(centered.edges.find(edge => edge.id === 'AE').inclination - centered.edges.find(edge => edge.id === 'CG').inclination) > 1);
// General similar isosceles trapezoids (including rectangles) are supported, independently of lock flags.
[
  { ...original, W: 1800, B: 1200, D: 1400, w: 900, d: 700, topLock: false },
  { ...original, W: 1200, B: 1200, D: 800, w: 480, d: 320 },
  { ...original, W: 1100, B: 1400, D: 1200, w: 440, d: 480 }
].forEach(state => {
  const model = Geometry.calculate(Geometry.slopePreset(state, 'spatial'));
  model.edges.filter(edge => edge.kind === 'side').forEach(edge => close(edge.inclination, 32.5));
  independentAngles(model);
});
// Uniform geometric scaling leaves the target angles intact.
const larger = { ...original };
['W', 'B', 'D', 'H', 'w', 'd', 'ox', 'oz'].forEach(key => larger[key] *= 2);
const scaled = Geometry.slopePreset(larger, 'spatial');
close(scaled.H, spatialState.H * 2); close(scaled.oz, spatialState.oz * 2); assert.equal(scaled.t, original.t);
// Applying the FIL uniform-size candidate preserves the selected angle definition.
['spatial', 'front'].forEach(mode => {
  const candidate = Transport.calculate(Geometry.slopePreset(original, mode));
  const transported = Geometry.calculate(candidate.scaledState);
  transported.edges.filter(edge => mode === 'spatial' ? edge.kind === 'side' : ['AE', 'BF'].includes(edge.id)).forEach(edge => close(mode === 'spatial' ? edge.inclination : edge.frontInclination, 32.5));
  assert.equal(candidate.scaledState.t, original.t);
  assert.equal(candidate.scaledState.showStone, original.showStone);
  assert.equal(candidate.routeComplete, false);
});
assert.throws(() => Geometry.slopePreset(original, 'other'), RangeError);
assert.throws(() => Geometry.slopePreset({ ...original, d: original.d * 0.9 }, 'spatial'), RangeError);
assert.throws(() => Geometry.slopePreset({ ...original, w: original.W, d: original.D }, 'front'), RangeError);
assert.throws(() => Geometry.slopePreset({ ...original, H: 0 }, 'front'), RangeError);
// Far-outside circumcenter can push the top beyond its base; reject rather than hide invalid geometry.
assert.throws(() => Geometry.slopePreset({ ...original, W: 3000, B: 500, D: 100, w: 1500, d: 50 }, 'spatial'), RangeError);
console.log('Angle checks passed: four real 32.5° edges, two projected 32.5° lines, distinct definitions, similar trapezoids, rectangles, scale invariance, input preservation, invalid cases.');
