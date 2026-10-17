// The string-art search. One Threader holds the frame geometry (pegs and the
// rasterized lines between them) and solves any number of frames of the same
// size, one after the other.
//
// The picture is turned into one "remaining" buffer per thread color: how much
// of each pixel the thread still has to cover, 0..1. Each step looks at every
// peg the current thread could go to next, measures the average remaining
// along that line, and takes the best one. Laying the thread subtracts its
// weight along the line. A segment with average remaining m and weight w
// changes the squared error by w(w - 2m) per pixel, so the search stops when
// the best m drops below w/2 (plus minGain): no segment would help anymore.
// With `exhaust` it keeps going until the line budget is spent, which is how
// classic string art (and the original tool) works.

import { prepareFrame, luminance, channel } from './image.js';
import { LineTable } from './lines.js';
import { normalizeOptions, threadColors } from './options.js';
import { layoutPegs, pegsTooClose } from './pegs.js';
import { Random } from './random.js';

export class Threader {
  constructor(options = {}) {
    this.options = normalizeOptions(options);
    this.random = new Random(this.options.seed);
    this.table = null; // built on the first frame, keyed by its size
    this.frame = null;
  }

  // Load a frame (any size; it is cropped and shrunk here) and reset the search.
  load(image) {
    const o = this.options;
    // Tie-breaks restart from the seed on every frame, so a frame's result does
    // not depend on which frames the same Threader solved before it.
    this.random = new Random(o.seed);
    const im = prepareFrame(image, o.shape, o.size);
    const { width, height } = im;
    if (!this.table || this.table.width !== width || this.table.height !== height) {
      const pegs = layoutPegs(o.shape, o.pegs, width / height);
      const px = (o.thickness / 1000) * Math.max(width, height);
      this.table = new LineTable(pegs, width, height, px);
      this.table.pegs = pegs;
      this.table.pixelThickness = px;
      this.table.blocked = buildBlocked(o.shape, pegs);
    }
    const colors = threadColors(o.mode, o.background);
    const bg = o.background === 'white' ? 1 : 0;
    const remaining = colors.map(() => new Float32Array(width * height));
    const totals = new Float64Array(colors.length);
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
      if (o.mode === 'mono') {
        const l = luminance(im.data, p, bg);
        const r = bg ? 1 - l : l;
        remaining[0][i] = r;
        totals[0] += r;
      } else {
        for (let c = 0; c < 3; c++) {
          const v = channel(im.data, p, c, bg);
          const r = bg ? 1 - v : v;
          remaining[c][i] = r;
          totals[c] += r;
        }
      }
    }
    const sum = totals.reduce((a, b) => a + b, 0) || 1;
    this.frame = {
      width,
      height,
      remaining,
      share: Array.from(totals, (t) => t / sum),
      threads: colors.map((color) => ({ color, pegs: [], recent: [], mask: new Uint8Array(this.table.count) })),
      weight: o.opacity * Math.min(1, this.table.pixelThickness),
      segments: 0,
      done: o.lines === 0,
      initialError: 0,
    };
    this.frame.initialError = this.error();
    return this;
  }

  get done() {
    return !this.frame || this.frame.done;
  }

  get segments() {
    return this.frame ? this.frame.segments : 0;
  }

  // Add one segment. Returns false once the frame is finished.
  step() {
    const f = this.frame;
    if (!f || f.done) return false;
    const o = this.options;
    if (f.segments >= o.lines) {
      f.done = true;
      return false;
    }
    const t = this.pickThread();
    const thread = f.threads[t];
    const remaining = f.remaining[t];
    let from, to;
    if (thread.pegs.length === 0) {
      const best = this.bestStart(remaining);
      if (!best) return this.finish(t);
      [from, to] = best;
      thread.pegs.push(from);
    } else {
      from = thread.pegs[thread.pegs.length - 1];
      to = this.bestNext(remaining, from, thread.mask);
      if (to < 0) return this.finish(t);
    }
    thread.pegs.push(to);
    if (o.recent > 0) {
      thread.recent.push(to);
      thread.mask[to] = 1;
      if (thread.recent.length > o.recent) thread.mask[thread.recent.shift()] = 0;
    }
    const line = this.table.get(from, to);
    const w = f.weight;
    for (let i = 0; i < line.length; i++) remaining[line[i]] -= w;
    f.segments++;
    return true;
  }

  // Run up to `max` more steps (default: to the end). Returns steps taken.
  run(max = Infinity) {
    let n = 0;
    while (n < max && this.step()) n++;
    return n;
  }

  // Solve a whole frame in one call.
  solve(image) {
    this.load(image);
    this.run();
    return this.result();
  }

  // A thread that found no useful segment is finished; the frame is done once
  // every thread is.
  finish(t) {
    const f = this.frame;
    f.threads[t].exhausted = true;
    if (f.threads.every((th) => th.exhausted)) f.done = true;
    return !f.done && this.step();
  }

  // In color mode, grow the thread that is furthest behind its share of the
  // picture's darkness (or brightness). Exhausted threads are skipped.
  pickThread() {
    const f = this.frame;
    if (f.threads.length === 1) return 0;
    let best = -1;
    let bestRatio = Infinity;
    for (let t = 0; t < f.threads.length; t++) {
      const th = f.threads[t];
      if (th.exhausted) continue;
      const share = f.share[t] || 1e-9;
      const ratio = Math.max(0, th.pegs.length - 1) / share;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = t;
      }
    }
    return best;
  }

  // Average remaining along a line.
  potential(remaining, line) {
    let s = 0;
    for (let i = 0; i < line.length; i++) s += remaining[line[i]];
    return s / line.length;
  }

  // Below this average remaining, a segment does more harm than good.
  threshold() {
    if (this.options.exhaust) return -Infinity;
    return this.frame.weight / 2 + this.options.minGain;
  }

  bestNext(remaining, from, mask) {
    const n = this.table.count;
    const blocked = this.table.blocked[from];
    const limit = this.threshold();
    let best = limit;
    let picks = [];
    for (let to = 0; to < n; to++) {
      if (to === from || blocked[to] || mask[to]) continue;
      const line = this.table.get(from, to);
      let s = 0;
      for (let i = 0; i < line.length; i++) s += remaining[line[i]];
      const p = s / line.length;
      if (p > best) {
        best = p;
        picks = [to];
      } else if (p === best && picks.length) {
        picks.push(to);
      }
    }
    return picks.length ? this.random.pick(picks) : -1;
  }

  // The first segment of a thread: the best pair among a thinned-out set of
  // pegs (every k-th, so large peg counts stay quick).
  bestStart(remaining) {
    const n = this.table.count;
    const stride = 1 + Math.floor(n / 100);
    const limit = this.threshold();
    let best = limit;
    let picks = [];
    for (let a = 0; a < n; a += stride) {
      const blocked = this.table.blocked[a];
      for (let b = a + 1; b < n; b += stride) {
        if (blocked[b]) continue;
        const p = this.potential(remaining, this.table.get(a, b));
        if (p > best) {
          best = p;
          picks = [[a, b]];
        } else if (p === best && picks.length) {
          picks.push([a, b]);
        }
      }
    }
    return picks.length ? this.random.pick(picks) : null;
  }

  // Root-mean-square of what is left to cover (negative = overshoot), 0..1.
  error() {
    const f = this.frame;
    let s = 0;
    let n = 0;
    for (const r of f.remaining) {
      for (let i = 0; i < r.length; i++) s += r[i] * r[i];
      n += r.length;
    }
    return Math.sqrt(s / Math.max(1, n));
  }

  // The threads so far, as plain data the renderer understands.
  result() {
    const f = this.frame;
    const o = this.options;
    return {
      width: f.width,
      height: f.height,
      aspect: f.width / f.height,
      shape: o.shape,
      mode: o.mode,
      background: o.background,
      opacity: o.opacity,
      thickness: o.thickness,
      pegs: this.table.pegs.map((p) => ({ x: p.x, y: p.y })),
      threads: f.threads.map((th) => ({ color: th.color, pegs: th.pegs.slice() })),
      segments: f.segments,
      error: this.error(),
      initialError: f.initialError,
    };
  }
}

function buildBlocked(shape, pegs) {
  return pegs.map((a) => {
    const row = new Uint8Array(pegs.length);
    pegs.forEach((b, j) => {
      if (a === b || pegsTooClose(shape, a, b)) row[j] = 1;
    });
    return row;
  });
}
