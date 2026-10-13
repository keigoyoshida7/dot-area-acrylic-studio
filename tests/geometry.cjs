'use strict';
const assert = require('node:assert/strict');
const { PHI, calculate, validate } = require('../model.js');
const base = { W: 1000, D: 1000, H: 1000, w: 1000, d: 1000, ox: 0, oz: 0, t: 3, density: 1.2 };
function close(actual, expected, relative = 1e-10) { assert.ok(Math.abs(actual - expected) <= relative * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`); }
function sub(a, b) { return a.map((value, i) => value - b[i]); }
function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function distance(a, b) { return Math.hypot(...sub(a, b)); }
function triangleArea(a, b, c) { return Math.hypot(...cross(sub(b, a), sub(c, a))) / 2; }
function meshVolumeAndCentroid(result) {
  let volume = 0, first = [0, 0, 0];
  result.allFaces.forEach(face => {
    const indices = face.id === 'base' ? face.indices : face.indices.slice().reverse();
    [[indices[0], indices[1], indices[2]], [indices[0], indices[2], indices[3]]].forEach(triangle => {
      const [a, b, c] = triangle.map(index => result.vertices[index]);
      const tetra = dot(a, cross(b, c)) / 6;
      volume += tetra;
      first = first.map((value, i) => value + tetra * (a[i] + b[i] + c[i]) / 4);
    });
  });
  return { volume, centroid: first.map(value => value / volume) };
}
function checkFaces(result) {
  assert.equal(result.allJoints.length, 12);
  result.allJoints.forEach(joint => {
    assert.equal(joint.faces.length, 2);
    const edge = result.edges.find(edge => edge.id === joint.id);
    joint.faces.forEach(id => {
      const face = result.allFaces.find(face => face.id === id);
      assert.ok(face.indices.includes(edge.a) && face.indices.includes(edge.b), `${joint.id} must belong to ${id}`);
    });
  });
  const front = result.faces.find(face => face.id === 'front');
  close(result.allJoints.find(joint => joint.id === 'AB').angle, front.bottomDihedral);
  close(result.allJoints.find(joint => joint.id === 'EF').angle, front.topDihedral);
  result.allFaces.forEach(face => {
    const p = face.indices.map(index => result.vertices[index]);
    close(face.area, triangleArea(p[0], p[1], p[2]) + triangleArea(p[0], p[2], p[3]));
    close(face.angles.reduce((sum, value) => sum + value, 0), 360);
    close(Math.hypot(...face.normal), 1);
    const raw = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    close(dot(raw, sub(p[3], p[0])) / Math.hypot(...raw), 0, 1e-8);
    face.points2d.forEach((point, i) => {
      const next = face.points2d[(i + 1) % 4];
      close(Math.hypot(next[0] - point[0], next[1] - point[1]), distance(p[i], p[(i + 1) % 4]));
    });
    const midpoint = p.reduce((sum, point) => sum.map((value, i) => value + point[i] / 4), [0, 0, 0]);
    const interior = [0, result.state.H / 2, 0];
    assert.ok(dot(face.normal, sub(midpoint, interior)) > 0, `${face.id} normal must point outward`);
  });
  const mesh = meshVolumeAndCentroid(result);
  close(result.volume, mesh.volume);
  result.centroid.forEach((value, i) => close(value, mesh.centroid[i], 1e-8));
}
// Missing B retains old rectangular-plan files; cube has known geometry and normals.
const cube = calculate(base);
close(cube.state.B, 1000); close(cube.state.b, 1000);
assert.equal(cube.edges.length, 12); assert.equal(cube.faces.length, 4); assert.equal(cube.planFaces.length, 2); assert.equal(cube.allFaces.length, 6);
cube.edges.forEach(edge => close(edge.length, 1000));
cube.allFaces.forEach(face => { close(face.area, 1e6); face.angles.forEach(angle => close(angle, 90)); });
cube.joints.forEach(joint => { close(joint.angle, 90); close(joint.bevel, 45); });
cube.allJoints.forEach(joint => { close(joint.angle, 90); close(joint.bevel, 45); });
close(cube.volume, 1e9); close(cube.area, 4e6); close(cube.mass, 14.4); checkFaces(cube);
// Uniform taper keeps BOTH plan front/rear ratios equal to phi.
const goldenState = { ...base, W: PHI * 1000, B: 1000, D: 1000, H: 1000, w: 1000, d: 1000 / PHI };
const golden = calculate(goldenState);
close(golden.state.b, 1000 / PHI);
close(golden.state.W / golden.state.B, PHI); close(golden.state.w / golden.state.b, PHI);
close(golden.baseArea, (PHI + 1) / 2 * 1e6);
close(golden.topArea, golden.baseArea / PHI ** 2);
close(golden.volume, goldenState.H / 3 * (golden.baseArea + golden.topArea + Math.sqrt(golden.baseArea * golden.topArea)));
close(golden.edges.find(edge => edge.id === 'BC').length, Math.hypot(1000, (PHI - 1) * 500));
checkFaces(golden);
// For a straight trapezoidal prism the vertical seam angles equal its known plan corners.
const prism = calculate({ ...goldenState, w: goldenState.W, d: goldenState.D });
close(prism.volume, prism.baseArea * goldenState.H);
prism.joints.forEach((joint, i) => close(joint.angle, prism.planFaces[0].angles[i]));
close(prism.centroid[1], goldenState.H / 2);
close(prism.centroid[2], goldenState.D * (goldenState.B - goldenState.W) / (6 * (goldenState.W + goldenState.B)));
checkFaces(prism);
// Independent top dimensions and offsets preserve planar panels without silently enforcing phi.
const shiftedState = { ...goldenState, w: 1040, d: 560, ox: 80, oz: -65, t: 8 };
const shifted = calculate(shiftedState);
assert.ok(Math.abs(shifted.state.w / shifted.state.b - PHI) > 0.01);
checkFaces(shifted);
const unshifted = calculate({ ...shiftedState, ox: 0, oz: 0 });
close(shifted.volume, unshifted.volume);
const mirror = calculate({ ...shiftedState, ox: -shiftedState.ox });
[['AE', 'BF'], ['DH', 'CG']].forEach(([a, b]) => close(shifted.edges.find(edge => edge.id === a).length, mirror.edges.find(edge => edge.id === b).length));
close(shifted.area, mirror.area);
// Selectable base/top sheets change material quantities only.
const closed = calculate({ ...shiftedState, includeBase: true, includeTop: true });
close(closed.area, shifted.area); close(closed.volume, shifted.volume);
close(closed.panelArea, shifted.area + shifted.baseArea + shifted.topArea);
close(closed.materialVolume, closed.panelArea * shiftedState.t);
close(closed.mass, closed.materialVolume * shiftedState.density / 1e6);
assert.equal(calculate({ ...shiftedState, t: 0 }).mass, 0);
// Varied shapes check coplanarity, true-size cuts and independent mesh integration.
for (let i = 0; i < 15; i++) {
  const W = 1400 + i * 37, B = 780 + i * 11, D = 940 + i * 13, d = 280 + i * 17;
  const maximumFront = (W + B) / 2 + (W - B) * d / (2 * D);
  const w = maximumFront * 0.77;
  const state = { ...base, W, B, D, H: 420 + i * 31, w, d, ox: (i % 3 - 1) * 25, oz: (i % 4 - 1.5) * 18 };
  assert.equal(validate(state).valid, true, JSON.stringify(validate(state)));
  checkFaces(calculate(state));
}
// Scaling lengths scales areas/volumes and preserves joint angles.
const doubledState = { ...shiftedState };
['W', 'B', 'D', 'H', 'w', 'd', 'ox', 'oz', 't'].forEach(key => doubledState[key] *= 2);
const doubled = calculate(doubledState);
close(doubled.area, shifted.area * 4); close(doubled.volume, shifted.volume * 8); close(doubled.mass, shifted.mass * 8);
doubled.joints.forEach((joint, i) => close(joint.angle, shifted.joints[i].angle));
// Width/depth-only checks cannot detect corners outside a narrow rear base.
const invalidFootprint = { ...goldenState, w: 1500, d: 200, oz: 390 };
assert.ok(invalidFootprint.w <= invalidFootprint.W && invalidFootprint.d <= invalidFootprint.D);
assert.equal(validate(invalidFootprint).valid, false);
[{ H: 0 }, { B: 0 }, { w: 0 }, { t: -1 }, { density: 0 }, { W: Infinity }, { ox: 3000 }, { oz: 3000 }, { w: 100, d: 900 }].forEach(invalid => {
  const state = { ...goldenState, ...invalid };
  assert.equal(validate(state).valid, false);
  assert.throws(() => calculate(state), RangeError);
});
assert.equal(validate(goldenState).valid, true);
assert.ok(validate({ ...goldenState, t: 100 }).warnings.length > 0);
console.log('Geometry checks passed: compatibility, golden trapezoid plans, six planar faces, true-size cuts, independent offsets, volume/centroid mesh verification, materials, scaling, validation.');
