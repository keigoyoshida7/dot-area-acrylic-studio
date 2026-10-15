(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.Transport = factory(root.Geometry);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geometry) {
  'use strict';
  if (!Geometry || typeof Geometry.calculate !== 'function') throw new Error('Geometry を先に読み込んでください。');
  function freeze(value) {
    Object.keys(value).forEach(function (key) { if (value[key] && typeof value[key] === 'object') freeze(value[key]); });
    return Object.freeze(value);
  }
  var FIL = freeze({
    openings: [
      { id: 'stairsStart', name: '階段入口', width: 1120, height: 2400 },
      { id: 'stairsMid', name: '階段途中', width: 1070, height: 3040 },
      { id: 'door', name: '搬入口', width: 1130, height: 2050 }
    ],
    room: { width: 6640, depth: 4620, height: 2650 },
    corner: 1500,
    doorDepth: 1360
  });
  var POSES = freeze([
    { id: 'D-W-H', name: '幅方向を縦に・奥行方向を開口幅に', axes: { width: 'D', height: 'W', depth: 'H' } },
    { id: 'D-H-W', name: '正立・奥行方向を開口幅に', axes: { width: 'D', height: 'H', depth: 'W' } },
    { id: 'H-W-D', name: '幅方向を縦に・高さ方向を開口幅に', axes: { width: 'H', height: 'W', depth: 'D' } },
    { id: 'H-D-W', name: '奥行方向を縦に・高さ方向を開口幅に', axes: { width: 'H', height: 'D', depth: 'W' } },
    { id: 'W-H-D', name: '正立・幅方向を開口幅に', axes: { width: 'W', height: 'H', depth: 'D' } },
    { id: 'W-D-H', name: '奥行方向を縦に・幅方向を開口幅に', axes: { width: 'W', height: 'D', depth: 'H' } }
  ]);
  function fail(message) { throw new RangeError(message); }
  function scaleState(state, scale) {
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) fail('倍率は 0 より大きい有限の数値にしてください。');
    var normalized = Geometry.calculate(state).state;
    var result = Object.assign({}, state);
    ['W', 'B', 'D', 'H', 'w', 'd', 'ox', 'oz'].forEach(function (key) { result[key] = normalized[key] * scale; });
    result.b = result.w - (result.W - result.B) * result.d / result.D;
    // Installation elevation, thickness, density, stone dimensions and application flags are unchanged.
    return result;
  }
  function calculate(state, options) {
    options = options || {};
    var clearance = options.clearance === undefined ? 20 : options.clearance;
    if (typeof clearance !== 'number' || !Number.isFinite(clearance) || clearance < 0 || clearance > 500) fail('片側の余裕は 0〜500 mm の有限の数値にしてください。');
    if (options.staging !== undefined && typeof options.staging !== 'boolean') fail('扉の先に直線で収める仮定は ON または OFF で指定してください。');
    var staging = options.staging === undefined ? true : options.staging;
    var poseId = options.pose === undefined ? 'auto' : options.pose;
    if (poseId !== 'auto' && !POSES.some(function (pose) { return pose.id === poseId; })) fail('搬送姿勢を一覧から選択してください。');
    var geometry = Geometry.calculate(state);
    var installation = Geometry.elevations(state, FIL.room.height);
    var minimum = [0, 1, 2].map(function (axis) { return Math.min.apply(Math, geometry.vertices.map(function (vertex) { return vertex[axis]; })); });
    var maximum = [0, 1, 2].map(function (axis) { return Math.max.apply(Math, geometry.vertices.map(function (vertex) { return vertex[axis]; })); });
    var bounds = { width: maximum[0] - minimum[0], depth: maximum[2] - minimum[2], height: maximum[1] - minimum[1], min: minimum, max: maximum };
    var dimensions = { W: bounds.width, D: bounds.depth, H: bounds.height };
    var c2 = 2 * clearance;
    var roomHeightAvailable = FIL.room.height - installation.lower - c2;
    if (!(roomHeightAvailable > 0)) fail('底面の設置高さと上下の余裕を差し引くと、展示室の有効高さが残りません。');
    function limit(id, label, available, dimension, kind, axis) {
      if (!(available > 0) || !(dimension > 0) || !Number.isFinite(available / dimension)) fail('余裕を差し引いた有効寸法が成立しません。寸法と余裕を確認してください。');
      return { id: id, label: label, scale: available / dimension, available: available, dimension: dimension, kind: kind, axis: axis };
    }
    var roomLimits = [
      limit('room-width', '展示室の幅（正立）', FIL.room.width - c2, bounds.width, 'room', 'W'),
      limit('room-depth', '展示室の奥行（正立）', FIL.room.depth - c2, bounds.depth, 'room', 'D'),
      limit('room-height', '展示室の高さ（設置高さ・上下の余裕を控除）', roomHeightAvailable, bounds.height, 'room', 'H')
    ];
    var roomLimit = Math.min.apply(Math, roomLimits.map(function (entry) { return entry.scale; }));
    var orientations = POSES.map(function (pose) {
      var limits = [];
      FIL.openings.forEach(function (opening) {
        limits.push(limit(opening.id + '-width', opening.name + 'の幅', opening.width - c2, dimensions[pose.axes.width], 'opening', pose.axes.width));
        limits.push(limit(opening.id + '-height', opening.name + 'の高さ', opening.height - c2, dimensions[pose.axes.height], 'opening', pose.axes.height));
      });
      if (staging) limits.push(limit('door-staging-depth', '扉の先に直線で収める奥行（仮定）', FIL.doorDepth - c2, dimensions[pose.axes.depth], 'assumption', pose.axes.depth));
      limits = limits.concat(roomLimits);
      var scale = Math.min.apply(Math, limits.map(function (entry) { return entry.scale; }));
      var binding = limits.filter(function (entry) { return Math.abs(entry.scale - scale) <= 1e-10 * Math.max(1, scale); });
      return {
        id: pose.id, name: pose.name, axes: Object.assign({}, pose.axes), scale: scale, limits: limits, binding: binding,
        transport: { width: dimensions[pose.axes.width] * scale, height: dimensions[pose.axes.height] * scale, depth: dimensions[pose.axes.depth] * scale },
        roomStanding: { width: bounds.width * scale, depth: bounds.depth * scale, height: bounds.height * scale }
      };
    });
    var best;
    if (poseId === 'auto') {
      best = orientations.reduce(function (current, candidate) {
        var tolerance = 1e-12 * Math.max(1, current.scale, candidate.scale);
        if (candidate.scale > current.scale + tolerance) return candidate;
        if (Math.abs(candidate.scale - current.scale) <= tolerance && candidate.transport.depth < current.transport.depth - 1e-9) return candidate;
        return current;
      });
    } else best = orientations.find(function (pose) { return pose.id === poseId; });
    return {
      best: best, orientations: orientations, roomLimit: roomLimit, roomLimits: roomLimits,
      scaledState: scaleState(state, best.scale), bounds: bounds, routeComplete: false,
      clearance: clearance, staging: staging,
      cornerReference: { distance: FIL.corner, footprintDiagonal: Math.hypot(best.transport.width, best.transport.depth) },
      unknowns: [
        '直角の曲がり角は、角から角までの距離だけでは旋回できるか判定できません。両側の有効通路幅と踊り場の平面形状が必要です。',
        '階段の勾配・段鼻・手すり・踊り場と、搬送中の傾け方や持ち替えに必要な空間は未計算です。',
        '六つの直交姿勢で開口断面と展示室を比較した上限です。経路全体の通過と、展示室で正立へ戻せることは未確認です。'
      ]
    };
  }
  return { FIL: FIL, POSES: POSES, calculate: calculate, scaleState: scaleState };
});
