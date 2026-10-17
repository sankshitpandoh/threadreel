import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InlinePool, Threader, createWorkerHandler, solveFrames } from '../src/index.js';
import { createNodePool } from '../src/node/index.js';
import { discImage, halfImage } from './helpers.js';

const options = { pegs: 40, size: 48, seed: 9, lines: 50 };

test('InlinePool and the worker pool agree with a plain Threader', async () => {
  const frames = [discImage(48), halfImage(48, 48), discImage(48, 8)];
  const expected = frames.map((f) => new Threader(options).solve(f).threads);
  const inline = new InlinePool(options);
  const a = await solveFrames(inline, frames);
  inline.close();
  assert.deepEqual(a.map((r) => r.threads), expected);

  const pool = createNodePool(options, 2);
  const seen = [];
  const b = await solveFrames(pool, frames, (r, i) => seen.push(i));
  pool.close();
  assert.deepEqual(b.map((r) => r.threads), expected);
  assert.deepEqual(seen.sort(), [0, 1, 2]);
});

test('closing a pool rejects what is still queued', async () => {
  const pool = createNodePool(options, 1);
  const p = pool.solve(discImage(48));
  pool.close();
  await assert.rejects(p, /pool closed/);
  await assert.rejects(pool.solve(discImage(48)), /pool closed/);
});

test('the worker handler answers init and solve, and reports errors', () => {
  const out = [];
  const handle = createWorkerHandler((m) => out.push(m));
  handle({ type: 'init', options });
  assert.deepEqual(out[0], { type: 'ready' });
  const im = discImage(48);
  handle({ type: 'solve', width: im.width, height: im.height, data: im.data });
  assert.equal(out[1].type, 'result');
  assert.equal(out[1].result.segments, 50);
  handle({ type: 'nonsense' });
  assert.match(out[2].error, /unknown message/);
});
