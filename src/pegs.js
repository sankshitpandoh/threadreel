// Peg layouts. Pegs are returned in normalized frame coordinates, x and y in
// 0..1, going around the frame once. `aspect` is width / height of the frame.
//
// Each peg carries `t`, its position along the perimeter in 0..1, and for
// rectangles `side` (0 top, 1 right, 2 bottom, 3 left). Both are used to tell
// which pairs of pegs make useless segments: neighbors on a circle, or two pegs
// on the same side of a rectangle.

export function layoutPegs(shape, count, aspect = 1) {
  if (shape === 'rectangle') return rectanglePegs(count, aspect);
  // 'circle' frames are always square; 'ellipse' follows the frame.
  return ellipsePegs(count, shape === 'circle' ? 1 : aspect);
}

function ellipsePegs(count, aspect) {
  // Equal arc-length spacing around an ellipse inscribed in the frame.
  const rx = aspect >= 1 ? 0.5 : 0.5 * aspect; // in units of the frame height
  const ry = aspect >= 1 ? 0.5 / aspect : 0.5;
  const steps = Math.max(4000, count * 40);
  const lengths = new Float64Array(steps + 1);
  let px = rx, py = 0;
  for (let i = 1; i <= steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    lengths[i] = lengths[i - 1] + Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  const total = lengths[steps];
  const pegs = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / count;
    while (j < steps && lengths[j + 1] < target) j++;
    const span = lengths[j + 1] - lengths[j] || 1;
    const f = (target - lengths[j]) / span;
    const a = (2 * Math.PI * (j + f)) / steps;
    pegs.push({
      x: 0.5 + 0.5 * Math.cos(a),
      y: 0.5 + 0.5 * Math.sin(a),
      t: k / count,
    });
  }
  return pegs;
}

function rectanglePegs(count, aspect) {
  const w = aspect >= 1 ? 1 : aspect;
  const h = aspect >= 1 ? 1 / aspect : 1;
  const perimeter = 2 * (w + h);
  const pegs = [];
  for (let k = 0; k < count; k++) {
    const d = (perimeter * k) / count;
    let x, y, side;
    if (d < w) {
      x = d; y = 0; side = 0;
    } else if (d < w + h) {
      x = w; y = d - w; side = 1;
    } else if (d < 2 * w + h) {
      x = w - (d - w - h); y = h; side = 2;
    } else {
      x = 0; y = h - (d - 2 * w - h); side = 3;
    }
    pegs.push({ x: x / w, y: y / h, t: k / count, side });
  }
  return pegs;
}

// True when a thread between these two pegs cannot be useful: they sit on the
// same side of a rectangle, or within 1/16th of the way round an ellipse.
export function pegsTooClose(shape, a, b) {
  if (shape === 'rectangle') return a.side === b.side;
  const d = Math.abs(a.t - b.t);
  return Math.min(d, 1 - d) <= 1 / 16;
}
