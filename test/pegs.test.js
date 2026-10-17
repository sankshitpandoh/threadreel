import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutPegs, pegsTooClose, normalizeOptions, threadColors } from '../src/index.js';

test('circle pegs lie on the unit circle, evenly spaced', () => {
  const pegs = layoutPegs('circle', 100, 16 / 9);
  assert.equal(pegs.length, 100);
  for (const p of pegs) {
    assert.ok(Math.abs(Math.hypot(p.x - 0.5, p.y - 0.5) - 0.5) < 1e-6);
  }
  const gaps = pegs.map((p, i) => {
    const q = pegs[(i + 1) % pegs.length];
    return Math.hypot(p.x - q.x, p.y - q.y);
  });
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1e-3);
});

test('ellipse pegs follow the frame aspect with near-equal arc spacing', () => {
  const pegs = layoutPegs('ellipse', 200, 2);
  assert.equal(pegs.length, 200);
  for (const p of pegs) {
    assert.ok(p.x >= -1e-9 && p.x <= 1 + 1e-9 && p.y >= -1e-9 && p.y <= 1 + 1e-9);
    const dx = (p.x - 0.5) * 2; // ellipse rx = 1 (in frame-height units) -> frame width 2
    const dy = (p.y - 0.5) * 1;
    assert.ok(Math.abs(Math.hypot(dx / 1, dy / 0.5) - 1) < 1e-6);
  }
  const gaps = pegs.map((p, i) => {
    const q = pegs[(i + 1) % pegs.length];
    return Math.hypot((p.x - q.x) * 2, p.y - q.y);
  });
  assert.ok(Math.max(...gaps) / Math.min(...gaps) < 1.05);
});

test('rectangle pegs sit on the border, with the four corners', () => {
  const pegs = layoutPegs('rectangle', 40, 1.5);
  assert.equal(pegs.length, 40);
  for (const p of pegs) {
    const onEdge = Math.abs(p.x) < 1e-9 || Math.abs(p.x - 1) < 1e-9 || Math.abs(p.y) < 1e-9 || Math.abs(p.y - 1) < 1e-9;
    assert.ok(onEdge, `peg ${JSON.stringify(p)} is not on the border`);
    assert.ok(p.side >= 0 && p.side <= 3);
  }
  assert.deepEqual([pegs[0].x, pegs[0].y], [0, 0]);
  const sides = new Set(pegs.map((p) => p.side));
  assert.equal(sides.size, 4);
});

test('pegsTooClose blocks neighbors on a circle and same-side pegs on a rectangle', () => {
  const circle = layoutPegs('circle', 64);
  assert.ok(pegsTooClose('circle', circle[0], circle[1]));
  assert.ok(pegsTooClose('circle', circle[0], circle[63]));
  assert.ok(!pegsTooClose('circle', circle[0], circle[32]));
  const rect = layoutPegs('rectangle', 40, 1);
  assert.ok(pegsTooClose('rectangle', rect[0], rect[1]));
  assert.ok(!pegsTooClose('rectangle', rect[0], rect[15]));
});

test('options are validated and clamped', () => {
  const o = normalizeOptions({ pegs: 10000, opacity: 2, lines: -5 });
  assert.equal(o.pegs, 2000);
  assert.equal(o.opacity, 1);
  assert.equal(o.lines, 0);
  assert.throws(() => normalizeOptions({ shape: 'hexagon' }));
  assert.throws(() => normalizeOptions({ mode: 'sepia' }));
  assert.deepEqual(threadColors('mono', 'white'), [[0, 0, 0]]);
  assert.deepEqual(threadColors('color', 'black'), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});
