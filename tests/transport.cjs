'use strict';
const assert = require('node:assert/strict');
const Geometry = require('../model.js');
const Transport = require('../transport.js');
const PHI = Geometry.PHI, GOLD = 1 / PHI ** 2;
const golden = { W: 1618, B: 1618 / PHI, D: 1618 / PHI, H: 1000, w: 1618 * GOLD, d: 1618 / PHI * GOLD, ox: 0, oz: 0, t: 5, density: 1.19, includeBase: false, includeTop: false, showStone: true, stoneWidth: 500, baseLock: true, basePlanLock: true, topLock: true, taper: GOLD, preset: 'golden' };
function close(actual, expected, relative = 1e-10) { assert.ok(Math.abs(actual - expected) <= relative * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`); }
function independentlyCheckConstraints(result) {
  const raw = { W: result.bounds.width, D: result.bounds.depth, H: result.bounds.height };
  result.orientations.forEach(pose => {
    assert.deepEqual(Object.values(pose.axes).slice().sort(), ['D', 'H', 'W']);
    close(pose.transport.width, raw[pose.axes.width] * pose.scale);
    close(pose.transport.height, raw[pose.axes.height] * pose.scale);
    close(pose.transport.depth, raw[pose.axes.depth] * pose.scale);
    Transport.FIL.openings.forEach(opening => {
      assert.ok(pose.transport.width <= opening.width - 2 * result.clearance + 1e-7);
      assert.ok(pose.transport.height <= opening.height - 2 * result.clearance + 1e-7);
    });
    assert.ok(pose.roomStanding.width <= 6640 - 2 * result.clearance + 1e-7);
    assert.ok(pose.roomStanding.depth <= 4620 - 2 * result.clearance + 1e-7);
    assert.ok(pose.roomStanding.height <= 2650 - 2 * result.clearance + 1e-7);
    if (result.staging) assert.ok(pose.transport.depth <= 1360 - 2 * result.clearance + 1e-7);
    assert.ok(pose.binding.length > 0);
    pose.binding.forEach(limit => close(limit.scale, pose.scale));
    const larger = pose.scale * (1 + 1e-5);
    assert.ok(pose.limits.some(limit => limit.dimension * larger > limit.available), 'a larger scale must violate at least one modeled limit');
  });
  assert.equal(result.routeComplete, false);
}
const original = JSON.stringify(golden);
const result = Transport.calculate(golden);
assert.equal(result.orientations.length, 6);
assert.equal(new Set(result.orientations.map(pose => pose.id)).size, 6);
assert.equal(result.best.id, 'D-W-H');
close(result.best.scale, 1030 / golden.D);
close(result.best.roomStanding.width, 1030 * PHI);
close(result.best.roomStanding.depth, 1030);
close(result.best.roomStanding.height, 1030 / golden.D * 1000);
assert.ok(result.best.binding.some(limit => limit.id === 'stairsMid-width'));
close(result.roomLimit, 2.61);
independentlyCheckConstraints(result);

// No clearance recovers the measured 1.07 m stair width; clearance is per edge, not total.
const zero = Transport.calculate(golden, { clearance: 0 });
close(zero.best.roomStanding.width, 1070 * PHI);
close(zero.best.roomStanding.depth, 1070);
const forty = Transport.calculate(golden, { clearance: 40 });
close(forty.best.transport.width, 990);
assert.ok(forty.best.scale < result.best.scale);
independentlyCheckConstraints(zero); independentlyCheckConstraints(forty);

// Manual selection must be honored even when it permits a smaller scale.
const manual = Transport.calculate(golden, { pose: 'W-H-D' });
assert.equal(manual.best.id, 'W-H-D'); close(manual.best.scale, 1030 / 1618);
assert.ok(manual.best.scale < result.best.scale);
independentlyCheckConstraints(manual);

// The optional door-depth assumption changes the optimal pose for the low preset.
const low = { ...golden, H: golden.W * GOLD };
const staged = Transport.calculate(low, { staging: true });
const unstaged = Transport.calculate(low, { staging: false });
assert.equal(staged.best.id, 'H-W-D');
close(staged.best.scale, 2010 / golden.W);
assert.equal(unstaged.best.id, 'H-D-W');
close(unstaged.best.scale, 1030 / low.H);
assert.ok(unstaged.best.scale > staged.best.scale);
assert.ok(!unstaged.best.limits.some(limit => limit.id === 'door-staging-depth'));
independentlyCheckConstraints(staged); independentlyCheckConstraints(unstaged);

// Exhibition height can limit a body that is transported on its side.
const tall = { ...golden, W: 100, B: 80, D: 100, H: 1000, w: 50, d: 50 };
const roomBound = Transport.calculate(tall, { staging: false });
close(roomBound.best.scale, 2.61);
assert.ok(roomBound.best.binding.some(limit => limit.id === 'room-height'));
independentlyCheckConstraints(roomBound);

// Rear width, not just W, must determine the actual standing bounding box.
const rearWider = { ...golden, W: 800, B: 1200, D: 900, H: 700, w: 400, d: 450, ox: 30, oz: -20 };
const rear = Transport.calculate(rearWider);
close(rear.bounds.width, 1200); close(rear.bounds.depth, 900); close(rear.bounds.height, 700);
independentlyCheckConstraints(rear);

// Scaling preserves all application settings and fixed material/stone assumptions without mutation.
const scaled = Transport.scaleState(golden, 2);
['W', 'B', 'D', 'H', 'w', 'd', 'ox', 'oz'].forEach(key => close(scaled[key], golden[key] * 2));
['t', 'density', 'showStone', 'stoneWidth', 'includeBase', 'includeTop', 'baseLock', 'basePlanLock', 'topLock', 'taper', 'preset'].forEach(key => assert.equal(scaled[key], golden[key]));
close(scaled.b, scaled.w - (scaled.W - scaled.B) * scaled.d / scaled.D);
assert.equal(JSON.stringify(golden), original);
assert.notEqual(scaled, golden);

// Corner measurements are immutable references, never a limiting dimension or a fit result.
assert.ok(Object.isFrozen(Transport.FIL));
assert.throws(() => { Transport.FIL.corner = 300; }, TypeError);
const before = Transport.calculate(golden).best.scale;
const ignoredCorner = Transport.calculate(golden, { corner: 1, cornerDistance: 999999 });
close(ignoredCorner.best.scale, before);
assert.ok(!ignoredCorner.best.limits.some(limit => /corner/i.test(limit.id)));
assert.equal(ignoredCorner.routeComplete, false);
assert.ok(ignoredCorner.unknowns.length > 0);

// Bad physical dimensions or options must fail instead of returning a plausible maximum.
[-1, 535, NaN, Infinity, '20'].forEach(clearance => assert.throws(() => Transport.calculate(golden, { clearance }), RangeError));
assert.throws(() => Transport.calculate(golden, { pose: 'invented' }), RangeError);
assert.throws(() => Transport.calculate(golden, { staging: 'false' }), RangeError);
assert.throws(() => Transport.calculate({ ...golden, H: 0 }), RangeError);
[0, -1, NaN, Infinity].forEach(scale => assert.throws(() => Transport.scaleState(golden, scale), RangeError));
console.log('Transport checks passed: six poses, all opening and room bounds, precise golden limits, clearance, staging, manual selection, wider rear, fixed thickness/stone, immutability, unknown route.');
