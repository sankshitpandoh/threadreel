import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LineTable, Threader, rasterizeLine, layoutPegs, prepareFrame, cropSquare, resizeImage, createImage } from '../src/index.js';
import { discImage, halfImage } from './helpers.js';

test('rasterizeLine covers a horizontal line pixel by pixel', () => {
  const line = rasterizeLine({ x: 0, y: 3 }, { x: 9, y: 3 }, 10, 10);
  assert.deepEqual(Array.from(line), [30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
});

test('rasterizeLine stays inside the image and thick lines add parallel pixels', () => {
  const thin = rasterizeLine({ x: 0, y: 0 }, { x: 19, y: 19 }, 20, 20, 1);
  assert.equal(thin.length, 20);
  const thick = rasterizeLine({ x: 0, y: 10 }, { x: 19, y: 10 }, 20, 20, 3);
  assert.equal(thick.length, 60);
  for (const i of thick) assert.ok(i >= 0 && i < 400);
});

test('LineTable caches symmetric lines', () => {
  const pegs = layoutPegs('circle', 16);
  const table = new LineTable(pegs, 32, 32, 1);
  assert.equal(table.get(2, 9), table.get(9, 2));
  assert.ok(table.get(0, 8).length > 20);
});

test('prepareFrame crops circles square and fits the working size', () => {
  const im = createImage(200, 100, [10, 20, 30, 255]);
  const sq = prepareFrame(im, 'circle', 50);
  assert.equal(sq.width, 50);
  assert.equal(sq.height, 50);
  const wide = prepareFrame(im, 'rectangle', 50);
  assert.equal(wide.width, 50);
  assert.equal(wide.height, 25);
  assert.equal(wide.data[0], 10);
  assert.equal(cropSquare(im).width, 100);
  assert.equal(resizeImage(im, 200, 100), im);
});

test('the search lowers the error and stops on its own', () => {
  const th = new Threader({ pegs: 60, size: 64, lines: 5000, seed: 7 });
  th.load(discImage(64));
  const before = th.error();
  assert.ok(before > 0.3);
  const steps = th.run();
  assert.ok(steps > 20, `expected a few dozen segments, got ${steps}`);
  assert.ok(steps < 5000, 'should stop before the cap');
  assert.ok(th.done);
  const r = th.result();
  assert.ok(r.error < before * 0.75, `error ${r.error} vs ${before}`);
  assert.equal(r.segments, steps);
  assert.equal(r.threads[0].pegs.length, steps + 1);
  for (const i of r.threads[0].pegs) assert.ok(i >= 0 && i < 60);
  assert.equal(r.pegs.length, 60);
  assert.equal(r.aspect, 1);
});

test('lines cap is respected', () => {
  const th = new Threader({ pegs: 40, size: 48, lines: 15, seed: 1 });
  th.load(discImage(48));
  assert.equal(th.run(), 15);
  assert.ok(th.done);
  assert.equal(th.step(), false);
});

test('thread goes where the picture is dark', () => {
  // On a half-black image, far more thread should cross the dark half.
  const th = new Threader({ pegs: 80, size: 64, shape: 'rectangle', lines: 400, seed: 3 });
  const r = th.solve(halfImage(64, 64));
  const pegs = r.pegs;
  let left = 0, right = 0;
  const t = r.threads[0].pegs;
  for (let i = 1; i < t.length; i++) {
    const mx = (pegs[t[i - 1]].x + pegs[t[i]].x) / 2;
    if (mx < 0.5) left++;
    else right++;
  }
  assert.ok(left > right * 3, `left ${left} right ${right}`);
});

test('seeded runs are reproducible, color mode uses three threads', () => {
  const a = new Threader({ pegs: 50, size: 48, seed: 11, mode: 'color' }).solve(discImage(48));
  const b = new Threader({ pegs: 50, size: 48, seed: 11, mode: 'color' }).solve(discImage(48));
  assert.deepEqual(a.threads, b.threads);
  assert.equal(a.threads.length, 3);
  assert.deepEqual(a.threads.map((t) => t.color), [[0, 1, 1], [1, 0, 1], [1, 1, 0]]);
});

test('a black background works on bright pictures', () => {
  const im = discImage(48);
  // invert: white disc on black
  for (let i = 0; i < im.data.length; i += 4) for (let c = 0; c < 3; c++) im.data[i + c] = 255 - im.data[i + c];
  const r = new Threader({ pegs: 50, size: 48, seed: 2, background: 'black' }).solve(im);
  assert.ok(r.segments > 10);
  assert.ok(r.error < r.initialError);
});

test('a frame of a different size rebuilds the geometry', () => {
  const th = new Threader({ pegs: 30, size: 32, seed: 1, shape: 'rectangle' });
  th.solve(discImage(32));
  const first = th.table;
  th.solve(discImage(32));
  assert.equal(th.table, first, 'same size reuses the table');
  const r = th.solve(halfImage(64, 32));
  assert.notEqual(th.table, first);
  assert.equal(r.aspect, 2);
  const circle = new Threader({ pegs: 30, size: 32, seed: 1 });
  assert.equal(circle.solve(halfImage(64, 32)).aspect, 1); // circle frames are square
});
