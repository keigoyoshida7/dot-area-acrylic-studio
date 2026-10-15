(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Geometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PHI = (1 + Math.sqrt(5)) / 2;
  var DEG = 180 / Math.PI;
  var INPUTS = ['W', 'B', 'D', 'H', 'w', 'd', 'ox', 'oz', 't', 'density'];
  var NAMES = { W: '下底の前幅', B: '下底の後幅', D: '下底の奥行き', H: '垂直高さ', w: '上底の前幅', d: '上底の奥行き', ox: '上底の左右位置', oz: '上底の前後位置', t: '板厚', density: '密度' };
  function normalized(state) {
    var result = {};
    INPUTS.forEach(function (key) {
      var value = state && state[key];
      if (key === 'B' && value === undefined) value = state && state.W;
      if (value === undefined && (key === 'ox' || key === 'oz' || key === 't')) value = 0;
      result[key] = typeof value === 'number' ? value : Number(value);
    });
    // Parallel corresponding plan edges keep all four lateral panels planar.
    result.b = result.w - (result.W - result.B) * result.d / result.D;
    result.includeBase = !!(state && state.includeBase === true);
    result.includeTop = !!(state && state.includeTop === true);
    return result;
  }
  function topPlan(s) {
    return [[s.ox - s.w / 2, s.oz - s.d / 2], [s.ox + s.w / 2, s.oz - s.d / 2], [s.ox + s.b / 2, s.oz + s.d / 2], [s.ox - s.b / 2, s.oz + s.d / 2]];
  }
  function validate(state) {
    var s = normalized(state);
    var errors = [], warnings = [];
    INPUTS.forEach(function (key) {
      if (!Number.isFinite(s[key])) errors.push(NAMES[key] + 'を有限の数値で入力してください。');
    });
    ['W', 'B', 'D', 'H', 'w', 'd', 'density'].forEach(function (key) {
      if (Number.isFinite(s[key]) && s[key] <= 0) errors.push(NAMES[key] + 'は 0 より大きい値にしてください。');
    });
    if (Number.isFinite(s.t) && s.t < 0) errors.push('板厚は 0 以上にしてください。');
    if (!errors.length && !Number.isFinite(s.b)) errors.push('上底の後幅を有限の値で計算できません。寸法の範囲を確認してください。');
    if (Number.isFinite(s.b) && s.b <= 0) errors.push('上底の後幅が 0 以下になります。上底の前幅を広げるか、奥行きを小さくしてください。');
    if (!errors.length) {
      var epsilon = 1e-9 * Math.max(1, s.W, s.B, s.D);
      var outsideDepth = false, outsideWidth = false;
      topPlan(s).forEach(function (point) {
        var x = point[0], z = point[1];
        if (z < -s.D / 2 - epsilon || z > s.D / 2 + epsilon) outsideDepth = true;
        var halfWidth = s.W / 2 + (s.B - s.W) / (2 * s.D) * (z + s.D / 2);
        if (Math.abs(x) > halfWidth + epsilon) outsideWidth = true;
      });
      if (outsideDepth) errors.push('上底の前後位置または奥行きが下底の範囲を超えています。');
      if (outsideWidth) errors.push('上底の幅または左右位置が下底の台形の範囲を超えています。');
      if (s.t > Math.min(s.W, s.B, s.D, s.H, s.w, s.b, s.d) / 10) warnings.push('板厚が形状に対して大きいため、面積 × 板厚による材積の概算誤差が増えます。');
      if (s.t >= Math.min(s.W, s.B, s.D, s.H, s.w, s.b, s.d)) warnings.push('板厚が最小寸法以上です。実際の内寸・接合が成立するか確認してください。');
    }
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function length(a) { return Math.hypot(a[0], a[1], a[2]); }
  function distance(a, b) { return length(sub(a, b)); }
  function unit(a) { var n = length(a); return a.map(function (v) { return v / n; }); }
  function clamp(value) { return Math.max(-1, Math.min(1, value)); }
  function angle2(previous, current, next) {
    var u = [previous[0] - current[0], previous[1] - current[1]];
    var v = [next[0] - current[0], next[1] - current[1]];
    return Math.atan2(Math.abs(u[0] * v[1] - u[1] * v[0]), u[0] * v[0] + u[1] * v[1]) * DEG;
  }
  function faceMetrics(vertices, definition) {
    var p = definition.indices.map(function (index) { return vertices[index]; });
    var baseline = unit(sub(p[1], p[0]));
    var topVector = sub(p[3], p[0]);
    var along = dot(topVector, baseline);
    var across = unit(topVector.map(function (value, i) { return value - along * baseline[i]; }));
    var points2d = p.map(function (point) { var v = sub(point, p[0]); return [dot(v, baseline), dot(v, across)]; });
    var rawNormal = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    var normal = definition.normal || unit(rawNormal.map(function (value) { return -value; }));
    var edgeLengths = p.map(function (point, i) { return distance(point, p[(i + 1) % 4]); });
    var bottom = edgeLengths[0], top = edgeLengths[2];
    var sh = points2d[3][1];
    var angles = points2d.map(function (point, i) { return angle2(points2d[(i + 3) % 4], point, points2d[(i + 1) % 4]); });
    var bottomDihedral = Math.acos(clamp(normal[1])) * DEG;
    return {
      id: definition.id, name: definition.name, indices: definition.indices, points2d: points2d,
      bottom: bottom, top: top, topOffset: points2d[3][0], slantHeight: sh,
      area: (bottom + top) * sh / 2, angles: angles,
      diagonals: [distance(p[0], p[2]), distance(p[1], p[3])], edgeLengths: edgeLengths,
      perimeter: edgeLengths.reduce(function (total, value) { return total + value; }, 0),
      normal: normal, lean: Math.atan2(normal[1], Math.hypot(normal[0], normal[2])) * DEG,
      bottomDihedral: bottomDihedral, topDihedral: 180 - bottomDihedral
    };
  }
  function calculate(state) {
    var check = validate(state);
    if (!check.valid) {
      var error = new RangeError(check.errors.join(' '));
      error.errors = check.errors;
      throw error;
    }
    var s = normalized(state);
    var W = s.W, B = s.B, D = s.D, H = s.H, w = s.w, b = s.b, d = s.d;
    var ox = s.ox, oz = s.oz;
    var vertices = [
      [-W / 2, 0, -D / 2], [W / 2, 0, -D / 2], [B / 2, 0, D / 2], [-B / 2, 0, D / 2],
      [ox - w / 2, H, oz - d / 2], [ox + w / 2, H, oz - d / 2], [ox + b / 2, H, oz + d / 2], [ox - b / 2, H, oz + d / 2]
    ];
    var pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    var edges = pairs.map(function (pair, index) {
      var edge = { id: String.fromCharCode(65 + pair[0]) + String.fromCharCode(65 + pair[1]), a: pair[0], b: pair[1], length: distance(vertices[pair[0]], vertices[pair[1]]), kind: index < 4 ? 'bottom' : index < 8 ? 'top' : 'side' };
      if (edge.kind === 'side') {
        var delta = sub(vertices[pair[1]], vertices[pair[0]]);
        edge.inclination = Math.atan2(Math.abs(delta[1]), Math.hypot(delta[0], delta[2])) * DEG;
        edge.frontInclination = Math.atan2(Math.abs(delta[1]), Math.abs(delta[0])) * DEG;
      }
      return edge;
    });
    var faces = [
      { id: 'front', name: '前面', indices: [0, 1, 5, 4] },
      { id: 'right', name: '右側面', indices: [1, 2, 6, 5] },
      { id: 'back', name: '背面', indices: [2, 3, 7, 6] },
      { id: 'left', name: '左側面', indices: [3, 0, 4, 7] }
    ].map(function (definition) { return faceMetrics(vertices, definition); });
    var planFaces = [
      { id: 'base', name: '下底', indices: [0, 1, 2, 3], normal: [0, -1, 0] },
      { id: 'top', name: '上底', indices: [4, 5, 6, 7], normal: [0, 1, 0] }
    ].map(function (definition) { return faceMetrics(vertices, definition); });
    var seamDefinitions = [{ id: 'AE', faces: [0, 3] }, { id: 'BF', faces: [0, 1] }, { id: 'CG', faces: [1, 2] }, { id: 'DH', faces: [2, 3] }];
    var joints = seamDefinitions.map(function (joint) {
      var theta = Math.acos(clamp(dot(faces[joint.faces[0]].normal, faces[joint.faces[1]].normal))) * DEG;
      return { id: joint.id, faces: joint.faces.map(function (index) { return faces[index].id; }), angle: 180 - theta, bevel: theta / 2, normalAngle: theta };
    });
    var allFaces = faces.concat(planFaces);
    var allJoints = edges.map(function (edge) {
      var adjacent = allFaces.filter(function (face) { return face.indices.indexOf(edge.a) !== -1 && face.indices.indexOf(edge.b) !== -1; });
      var theta = Math.acos(clamp(dot(adjacent[0].normal, adjacent[1].normal))) * DEG;
      return { id: edge.id, faces: adjacent.map(function (face) { return face.id; }), angle: 180 - theta, bevel: theta / 2, normalAngle: theta };
    });
    // Area and first moments are degree <= 3 polynomials in normalized height.
    // Simpson integration is exact, including independent top dimensions and offsets.
    var sections = [0, 0.5, 1].map(function (u) {
      var front = W + (w - W) * u, rear = B + (b - B) * u, depth = D + (d - D) * u;
      var sectionArea = (front + rear) * depth / 2;
      var centroidZ = oz * u + depth * (rear - front) / (6 * (front + rear));
      return { u: u, area: sectionArea, centroidZ: centroidZ };
    });
    var weights = [1, 4, 1];
    var areaIntegral = sections.reduce(function (sum, section, i) { return sum + weights[i] * section.area; }, 0);
    var uMoment = sections.reduce(function (sum, section, i) { return sum + weights[i] * section.area * section.u; }, 0);
    var zMoment = sections.reduce(function (sum, section, i) { return sum + weights[i] * section.area * section.centroidZ; }, 0);
    var volume = H * areaIntegral / 6;
    var area = faces.reduce(function (total, face) { return total + face.area; }, 0);
    var baseArea = planFaces[0].area, topArea = planFaces[1].area;
    var panelArea = area + (s.includeBase ? baseArea : 0) + (s.includeTop ? topArea : 0);
    var materialVolume = panelArea * s.t;
    return {
      PHI: PHI, state: s, vertices: vertices, edges: edges, faces: faces, planFaces: planFaces, allFaces: allFaces, joints: joints, allJoints: allJoints,
      volume: volume, area: area, sideArea: area, panelArea: panelArea, materialVolume: materialVolume, mass: materialVolume * s.density / 1e6,
      baseArea: baseArea, topArea: topArea, closedSurfaceArea: area + baseArea + topArea,
      edgeTotal: edges.reduce(function (total, edge) { return total + edge.length; }, 0),
      bottomDiagonal: planFaces[0].diagonals[0], topDiagonal: planFaces[1].diagonals[0],
      spaceDiagonals: [[0, 6], [1, 7], [2, 4], [3, 5]].map(function (pair) { return { id: String.fromCharCode(65 + pair[0]) + String.fromCharCode(65 + pair[1]), a: pair[0], b: pair[1], length: distance(vertices[pair[0]], vertices[pair[1]]) }; }),
      centroid: [ox * uMoment / areaIntegral, H * uMoment / areaIntegral, zMoment / areaIntegral],
      warnings: check.warnings
    };
  }
  function slopePreset(state, mode) {
    if (mode !== 'spatial' && mode !== 'front') throw new RangeError('32.5°パターンは実際の斜辺または正面投影から選択してください。');
    var s = calculate(state).state;
    var k = s.w / s.W;
    if (!(k > 0 && k < 1) || Math.abs(s.d / s.D - k) > 1e-9 || Math.abs(s.b / s.B - k) > 1e-9) {
      throw new RangeError('32.5°パターンには、底面より小さい相似形の上面が必要です。上面の幅と奥行の比率をそろえてください。');
    }
    var result = Object.assign({}, state, { B: s.B, b: s.b, ox: 0, oz: 0 });
    var tangent = Math.tan(32.5 / DEG);
    if (mode === 'spatial') {
      // Every isosceles trapezoid is cyclic. Homothety about its circumcenter
      // gives equal horizontal travel for all four corresponding corner edges.
      var centerZ = (s.B * s.B - s.W * s.W) / (8 * s.D);
      var radius = Math.hypot(s.W / 2, -s.D / 2 - centerZ);
      result.oz = (1 - k) * centerZ;
      result.H = (1 - k) * radius * tangent;
    } else {
      result.H = Math.abs(s.W - s.w) / 2 * tangent;
    }
    var check = validate(result);
    if (!check.valid) throw new RangeError('この底面では32.5°パターンが成立しません。' + check.errors.join(' '));
    return result;
  }
  function elevations(state, ceilingHeight) {
    var lower = state && state.baseElevation !== undefined ? state.baseElevation : 0;
    var height = state && state.H;
    if (ceilingHeight === undefined) ceilingHeight = 2650;
    if (typeof lower !== 'number' || !Number.isFinite(lower) || lower < 0) throw new RangeError('底面の床からの高さは 0 以上の有限の数値にしてください。');
    if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) throw new RangeError('本体の高さは 0 より大きい有限の数値にしてください。');
    if (typeof ceilingHeight !== 'number' || !Number.isFinite(ceilingHeight) || ceilingHeight <= 0) throw new RangeError('天井の床からの高さは 0 より大きい有限の数値にしてください。');
    var upper = lower + height;
    if (!Number.isFinite(upper)) throw new RangeError('上面の床からの高さを有限の値で計算できません。寸法を確認してください。');
    var ceilingGap = ceilingHeight - upper;
    return { lower: lower, upper: upper, height: height, ceilingHeight: ceilingHeight, ceilingGap: ceilingGap, fitsCeiling: ceilingGap >= 0 };
  }
  return { PHI: PHI, calculate: calculate, validate: validate, slopePreset: slopePreset, elevations: elevations };
});
