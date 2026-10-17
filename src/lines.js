// Rasterized segments between every pair of pegs at the working resolution,
// as lists of pixel indices. The solver only ever sums and subtracts along
// these lists, which is what makes a step cheap: no geometry at all.
//
// Lines are walked along their major axis one pixel at a time. A thread
// thinner than one working pixel is a single-pixel line whose weight is scaled
// down (see Threader); a thicker one adds parallel pixels on the minor axis.

export class LineTable {
  constructor(pegs, width, height, thickness = 1) {
    this.count = pegs.length;
    this.width = width;
    this.height = height;
    this.thickness = thickness;
    this.points = pegs.map((p) => ({
      x: p.x * (width - 1),
      y: p.y * (height - 1),
    }));
    this.lines = new Array(this.count * this.count).fill(null);
  }

  // Pixel indices of the segment between pegs a and b (cached, symmetric).
  get(a, b) {
    if (a > b) [a, b] = [b, a];
    const key = a * this.count + b;
    let line = this.lines[key];
    if (!line) {
      line = rasterizeLine(this.points[a], this.points[b], this.width, this.height, this.thickness);
      this.lines[key] = line;
    }
    return line;
  }

  // Build every line up front (optional; get() is lazy).
  precompute() {
    for (let a = 0; a < this.count; a++) for (let b = a + 1; b < this.count; b++) this.get(a, b);
    return this;
  }
}

export function rasterizeLine(p, q, width, height, thickness = 1) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  const major = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  // Offsets on the minor axis for thick lines: 1 pixel for thickness <= 1.5,
  // then one more pixel per unit, centered.
  const span = Math.max(1, Math.round(thickness));
  const offsets = [];
  for (let k = 0; k < span; k++) offsets.push(k - (span - 1) / 2);
  const out = new Int32Array((steps + 1) * span);
  let n = 0;
  let last = -1;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const x = p.x + dx * f;
    const y = p.y + dy * f;
    for (const o of offsets) {
      const px = Math.round(major === 'x' ? x : x + o);
      const py = Math.round(major === 'y' ? y : y + o);
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const idx = py * width + px;
      if (idx === last) continue;
      out[n++] = idx;
      last = idx;
    }
  }
  return out.subarray(0, n);
}
