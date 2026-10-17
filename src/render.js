// Drawing a solved frame. Two renderers share one geometry:
//
//   drawResult(ctx, result, opts)   onto a Canvas 2D context (browser, OffscreenCanvas)
//   rasterize(result, opts)         into a plain RGBA image, with our own anti-aliased
//                                   line drawing (Node, tests)
//
// Threads on a white background subtract light (multiply); on black they add it.

import { threadColors } from './options.js';

export const RENDER_DEFAULTS = Object.freeze({
  width: 1000,
  height: undefined, // from the result's aspect
  upTo: Infinity, // draw only the first N segments (across all threads, in solve order)
  showPegs: false,
  pegColor: '#c4432b',
  opacity: undefined, // defaults to what the frame was solved with
  thickness: undefined,
});

export function frameSize(result, opts = {}) {
  const width = Math.round(opts.width || RENDER_DEFAULTS.width);
  const height = Math.round(opts.height || width / result.aspect);
  return { width, height };
}

export function backgroundColor(result) {
  return result.background === 'white' ? [255, 255, 255] : [0, 0, 0];
}

export function threadWidth(result, width, height, thickness) {
  return ((thickness ?? result.thickness) / 1000) * Math.max(width, height);
}

// The segments of each thread limited to the first `upTo` segments overall.
// Threads are grown in turn by share, so we spread the budget the same way.
export function segmentBudget(result, upTo) {
  const counts = result.threads.map((t) => Math.max(0, t.pegs.length - 1));
  const total = counts.reduce((a, b) => a + b, 0);
  if (!(upTo < total)) return counts;
  const f = upTo / total;
  return counts.map((c) => Math.floor(c * f));
}

// Total length of thread in a frame, in units of the frame's longer side.
// Multiply by the real size of the board to get metres of thread.
export function threadLength(result, upTo = Infinity) {
  const budget = segmentBudget(result, upTo);
  const sx = result.aspect >= 1 ? 1 : result.aspect;
  const sy = result.aspect >= 1 ? 1 / result.aspect : 1;
  let total = 0;
  result.threads.forEach((thread, t) => {
    for (let i = 0; i < budget[t]; i++) {
      const a = result.pegs[thread.pegs[i]];
      const b = result.pegs[thread.pegs[i + 1]];
      total += Math.hypot((a.x - b.x) * sx, (a.y - b.y) * sy);
    }
  });
  return total;
}

export function drawResult(ctx, result, opts = {}) {
  const o = { ...RENDER_DEFAULTS, ...opts };
  const { width, height } = frameSize(result, o);
  const bg = backgroundColor(result);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${bg.join(',')})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = result.background === 'white' ? 'multiply' : 'lighter';
  ctx.lineWidth = Math.max(0.3, threadWidth(result, width, height, o.thickness));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = o.opacity ?? result.opacity;
  const budget = segmentBudget(result, o.upTo);
  result.threads.forEach((thread, t) => {
    const n = budget[t];
    if (n <= 0) return;
    const c = thread.color.map((v) => Math.round(v * 255));
    ctx.strokeStyle = `rgb(${c.join(',')})`;
    // One stroke per segment: a single self-crossing path would be painted
    // only once, and the crossings are where the picture lives.
    let p = result.pegs[thread.pegs[0]];
    for (let i = 1; i <= n; i++) {
      const q = result.pegs[thread.pegs[i]];
      ctx.beginPath();
      ctx.moveTo(p.x * width, p.y * height);
      ctx.lineTo(q.x * width, q.y * height);
      ctx.stroke();
      p = q;
    }
  });
  if (o.showPegs) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = o.pegColor;
    const r = Math.max(1.5, 0.004 * Math.max(width, height));
    for (const p of result.pegs) {
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.restore();
  return { width, height };
}

// Software renderer: returns { width, height, data } RGBA.
export function rasterize(result, opts = {}) {
  const o = { ...RENDER_DEFAULTS, ...opts };
  const { width, height } = frameSize(result, o);
  const subtract = result.background === 'white';
  const px = new Float32Array(width * height * 3);
  px.fill(subtract ? 1 : 0);
  const alpha = o.opacity ?? result.opacity;
  const lw = Math.max(0.3, threadWidth(result, width, height, o.thickness));
  const budget = segmentBudget(result, o.upTo);
  result.threads.forEach((thread, t) => {
    const n = budget[t];
    for (let i = 0; i < n; i++) {
      const a = result.pegs[thread.pegs[i]];
      const b = result.pegs[thread.pegs[i + 1]];
      strokeSegment(px, width, height, a.x * width, a.y * height, b.x * width, b.y * height, lw, alpha, thread.color, subtract);
    }
  });
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    data[j] = px[i] * 255;
    data[j + 1] = px[i + 1] * 255;
    data[j + 2] = px[i + 2] * 255;
    data[j + 3] = 255;
  }
  if (o.showPegs) {
    const r = Math.max(1.5, 0.004 * Math.max(width, height));
    const c = hexToRgb(o.pegColor);
    for (const p of result.pegs) fillDisc(data, width, height, p.x * width, p.y * height, r, c);
  }
  return { width, height, data };
}

// Anti-aliased thick segment: walk the major axis, cover pixels on the minor
// axis by their distance to the line. Each pixel is touched once per segment.
function strokeSegment(px, width, height, x0, y0, x1, y1, lw, alpha, color, subtract) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return;
  const half = lw / 2;
  const swap = Math.abs(dy) > Math.abs(dx);
  // In swapped space the major axis is x.
  let ax = swap ? y0 : x0, ay = swap ? x0 : y0, bx = swap ? y1 : x1, by = swap ? x1 : y1;
  if (ax > bx) {
    const tx = ax, ty = ay;
    ax = bx; ay = by; bx = tx; by = ty;
  }
  const slope = (by - ay) / (bx - ax);
  const cos = (bx - ax) / len; // perpendicular distance = |minor offset| * cos
  const reach = half / cos + 1;
  const majorMax = swap ? height : width;
  const minorMax = swap ? width : height;
  const mStart = Math.max(0, Math.floor(ax - half));
  const mEnd = Math.min(majorMax - 1, Math.ceil(bx + half));
  const k0 = 1 - alpha * (1 - color[0]);
  const k1 = 1 - alpha * (1 - color[1]);
  const k2 = 1 - alpha * (1 - color[2]);
  const a0 = alpha * color[0], a1 = alpha * color[1], a2 = alpha * color[2];
  const stride = swap ? 3 : width * 3;
  for (let m = mStart; m <= mEnd; m++) {
    const center = m + 0.5;
    // Clamp to the segment, so the ends get round-ish caps.
    const cm = center < ax ? ax : center > bx ? bx : center;
    const along = ay + slope * (cm - ax);
    const cap = (center - cm) * cos; // distance past the end, 0 inside the segment
    const cap2 = cap * cap;
    let n = Math.floor(along - reach);
    if (n < 0) n = 0;
    let nEnd = Math.ceil(along + reach);
    if (nEnd > minorMax - 1) nEnd = minorMax - 1;
    let i = swap ? (m * width + n) * 3 : (n * width + m) * 3;
    for (; n <= nEnd; n++, i += stride) {
      const off = (n + 0.5 - along) * cos;
      const dist = cap2 === 0 ? (off < 0 ? -off : off) : Math.sqrt(off * off + cap2);
      let cov = half + 0.5 - dist;
      if (cov <= 0) continue;
      if (cov > 1) cov = 1;
      if (subtract) {
        if (cov === 1) {
          px[i] *= k0; px[i + 1] *= k1; px[i + 2] *= k2;
        } else {
          px[i] *= 1 - cov * (1 - k0); px[i + 1] *= 1 - cov * (1 - k1); px[i + 2] *= 1 - cov * (1 - k2);
        }
      } else {
        const r = px[i] + cov * a0, g = px[i + 1] + cov * a1, b = px[i + 2] + cov * a2;
        px[i] = r > 1 ? 1 : r; px[i + 1] = g > 1 ? 1 : g; px[i + 2] = b > 1 ? 1 : b;
      }
    }
  }
}

function fillDisc(data, width, height, cx, cy, r, color) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(height - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(width - 1, Math.ceil(cx + r)); x++) {
      const cov = r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (cov <= 0) continue;
      const a = cov > 1 ? 1 : cov;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - a) + color[c] * a;
    }
  }
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export { threadColors };
