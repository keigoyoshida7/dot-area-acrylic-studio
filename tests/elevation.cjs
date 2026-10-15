'use strict';
const assert = require('node:assert/strict');
const Geometry = require('../model.js');
const Transport = require('../transport.js');
const PHI = Geometry.PHI, k = 1 / PHI ** 2;
const original = { W: 1618, B: 1618 / PHI, D: 1618 / PHI, H: 1000, w: 1618 * k, d: 1618 / PHI * k, ox: 0, oz: 0, t: 5, density: 1.19, includeBase: false, includeTop: false, showStone: true, stoneHeight: 300, preset: 'golden' };
function close(actual, expected, relative = 1e-10) { assert.ok(Math.abs(actual - expected) <= relative * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`); }

// Legacy states have no placement offset; this helper also accepts a minimal height-only state.
assert.deepEqual(Geometry.elevations({ H: 1000 }), { lower: 0, upper: 1000, height: 1000, ceilingHeight: 2650, ceilingGap: 1650, fitsCeiling: true });
assert.deepEqual(Geometry.elevations({ H: 1000, baseElevation: 400 }), { lower: 400, upper: 1400, height: 1000, ceilingHeight: 2650, ceilingGap: 1250, fitsCeiling: true });
assert.equal(Geometry.elevations({ H: 1000, baseElevation: 1650 }).fitsCeiling, true);
assert.equal(Geometry.elevations({ H: 1000, baseElevation: 1650.01 }).fitsCeiling, false);
close(Geometry.elevations({ H: 1000, baseElevation: 1650.01 }).ceilingGap, -0.01);
assert.deepEqual(Geometry.elevations({ H: 700, baseElevation: 300 }, 3000), { lower: 300, upper: 1000, height: 700, ceilingHeight: 3000, ceilingGap: 2000, fitsCeiling: true });

// Placement is a world-space translation: local geometry and edge/face angles never change.
const elevated = { ...original, baseElevation: 400 };
const snapshot = JSON.stringify(elevated);
const floorGeometry = Geometry.calculate(original), raisedGeometry = Geometry.calculate(elevated);
assert.deepEqual(raisedGeometry.vertices, floorGeometry.vertices);
assert.deepEqual(raisedGeometry.edges, floorGeometry.edges);
assert.deepEqual(raisedGeometry.allFaces, floorGeometry.allFaces);
close(raisedGeometry.volume, floorGeometry.volume); close(raisedGeometry.mass, floorGeometry.mass);
Geometry.elevations(elevated);
assert.equal(JSON.stringify(elevated), snapshot);

// FIL placement elevation remains fixed as only the body dimensions are scaled.
const thinTall = { ...original, W: 100, B: 80, D: 100, H: 1000, w: 50, d: 50, baseElevation: 2200 };
const fit = Transport.calculate(thinTall, { clearance: 20, staging: false });
close(fit.best.scale, 0.41);
close(fit.roomLimit, 0.41);
close(fit.roomLimits.find(limit => limit.id === 'room-height').available, 410);
assert.ok(fit.best.binding.some(limit => limit.id === 'room-height'));
assert.equal(fit.scaledState.baseElevation, 2200);
close(fit.scaledState.H, 410);
const fittedLevels = Geometry.elevations(fit.scaledState);
close(fittedLevels.upper, 2610); close(fittedLevels.ceilingGap, 40);
assert.equal(fit.routeComplete, false);

// Every candidate pose obeys the same fixed installed bottom level and room-height allowance.
fit.orientations.forEach(pose => {
  assert.ok(thinTall.baseElevation + pose.roomStanding.height <= 2650 - 40 + 1e-9);
});
const roomAtFloor = Transport.calculate({ ...thinTall, baseElevation: 0 }, { staging: false });
close(roomAtFloor.best.scale, 2.61);
const roomRaised100 = Transport.calculate({ ...thinTall, baseElevation: 100 }, { staging: false });
close(roomRaised100.best.scale, 2.51);
const zeroMargin = Transport.calculate(thinTall, { clearance: 0, staging: false });
close(zeroMargin.best.scale, 0.45);
close(Geometry.elevations(zeroMargin.scaledState).ceilingGap, 0);

// Elevation changes the installed room limit, not the physical dimensions of measured openings.
const groundRoute = Transport.calculate(original), raisedRoute = Transport.calculate(elevated);
groundRoute.orientations.forEach((pose, index) => {
  const openingLimits = pose.limits.filter(limit => limit.kind === 'opening');
  const elevatedLimits = raisedRoute.orientations[index].limits.filter(limit => limit.kind === 'opening');
  assert.deepEqual(elevatedLimits, openingLimits);
});
const twice = Transport.scaleState(elevated, 2);
close(twice.H, 2000); assert.equal(twice.baseElevation, 400);
assert.equal(twice.t, elevated.t); assert.equal(twice.density, elevated.density);
assert.equal(twice.showStone, true); assert.equal(twice.stoneHeight, 300);
assert.equal(JSON.stringify(elevated), snapshot);

// Reject nonphysical elevations and overflow; a too-tall current body is measurable, not silently clamped.
[-1, NaN, Infinity, '100', null].forEach(baseElevation => {
  assert.throws(() => Geometry.elevations({ H: 1000, baseElevation }), RangeError);
  assert.throws(() => Transport.calculate({ ...original, baseElevation }), RangeError);
});
[0, -1, NaN, Infinity, '1000'].forEach(H => assert.throws(() => Geometry.elevations({ H }), RangeError));
[0, -1, NaN, Infinity, '2650'].forEach(ceiling => assert.throws(() => Geometry.elevations({ H: 1000 }, ceiling), RangeError));
assert.throws(() => Geometry.elevations({ H: 1e308, baseElevation: 1e308 }), RangeError);
assert.throws(() => Transport.calculate({ ...original, baseElevation: 2610 }, { clearance: 20 }), /有効高さが残りません/);
assert.throws(() => Transport.calculate({ ...original, baseElevation: 2700 }), /有効高さが残りません/);
assert.equal(Geometry.elevations({ H: 3000 }).fitsCeiling, false);
assert.ok(Geometry.elevations({ H: 3000 }).ceilingGap < 0);
console.log('Elevation checks passed: legacy defaults, exact floor levels, ceiling boundary, local geometry invariance, fixed placement during FIL scaling, installed room limits, fixed stone/thickness, invalid values.');
