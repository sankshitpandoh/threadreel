import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Threader, rasterize, toSVG, toInstructions, buildTimeline, segmentBudget, frameSize } from '../src/index.js';
import { discImage } from './helpers.js';

const result = new Threader({ pegs: 40, size: 48, seed: 5, lines: 60 }).solve(discImage(48));

test('rasterize paints the background and darkens where thread lies', () => {
  const im = rasterize(result, { width: 120 });
  assert.equal(im.width, 120);
  assert.equal(im.height, 120);
  assert.equal(im.data.length, 120 * 120 * 4);
  let dark = 0;
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i] < 200) dark++;
  assert.ok(dark > 200, `expected plenty of dark pixels, got ${dark}`);
  // corners are outside the circle: untouched white
  assert.equal(im.data[0], 255);
  const empty = rasterize(result, { width: 50, upTo: 0 });
  assert.ok(empty.data.every((v, i) => i % 4 === 3 || v === 255));
});

test('rasterize on black adds light and can show pegs', () => {
  const r = { ...result, background: 'black', threads: result.threads.map((t) => ({ ...t, color: [1, 1, 1] })) };
  const im = rasterize(r, { width: 80, showPegs: true, pegColor: '#ff0000' });
  assert.equal(im.data[0], 0);
  let bright = 0;
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i] > 60) bright++;
  assert.ok(bright > 100);
});

test('frameSize follows the aspect, segmentBudget splits by upTo', () => {
  assert.deepEqual(frameSize({ aspect: 2 }, { width: 200 }), { width: 200, height: 100 });
  assert.deepEqual(segmentBudget(result, Infinity), [60]);
  assert.deepEqual(segmentBudget(result, 30), [30]);
  const three = { threads: [{ pegs: new Array(11) }, { pegs: new Array(21) }, { pegs: new Array(31) }] };
  assert.deepEqual(segmentBudget(three, 30), [5, 10, 15]);
});

test('toSVG writes one line per segment, toInstructions lists every step', () => {
  const svg = toSVG(result, { width: 300, showPegs: true });
  assert.ok(svg.startsWith('<svg'));
  assert.equal((svg.match(/<line /g) || []).length, 60);
  assert.equal((svg.match(/<g stroke=/g) || []).length, 1);
  assert.equal((svg.match(/<circle/g) || []).length, 40);
  assert.ok(svg.includes('mix-blend-mode:multiply'));
  const txt = toInstructions(result);
  assert.ok(txt.includes('PEG_0:'));
  assert.ok(txt.includes('60. to PEG_'));
});

test('buildTimeline draws in, plays, then holds', () => {
  const tl = buildTimeline({ frames: 5, fps: 10, intro: 1, hold: 0.5, segments: 100 });
  assert.equal(tl.length, 10 + 5 + 5);
  assert.equal(tl[0].frame, 0);
  assert.ok(tl[0].upTo >= 1 && tl[0].upTo < 100);
  assert.equal(tl[9].upTo, 100);
  assert.deepEqual(tl.slice(10, 15).map((s) => s.frame), [0, 1, 2, 3, 4]);
  assert.ok(tl.slice(15).every((s) => s.frame === 4 && s.upTo === Infinity));
  for (let i = 1; i < 10; i++) assert.ok(tl[i].upTo >= tl[i - 1].upTo);
});
