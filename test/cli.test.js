import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { savePNG, decodeImage, hasFFmpeg } from '../src/node/index.js';
import { discImage } from './helpers.js';

const bin = new URL('../bin/threadreel.js', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'threadreel-'));
const input = join(dir, 'disc.png');
savePNG(input, discImage(64));

test('cli renders a picture to png, svg and txt', () => {
  const png = join(dir, 'out.png');
  const svg = join(dir, 'out.svg');
  const txt = join(dir, 'out.txt');
  execFileSync('node', [bin, '-i', input, '-o', png, '-o', svg, '-o', txt, '-p', '40', '-q', '48', '-s', '96', '-seed', '1']);
  const im = decodeImage(readFileSync(png));
  assert.equal(im.width, 96);
  assert.equal(im.height, 96);
  assert.ok(readFileSync(svg, 'utf8').includes('<line '));
  assert.ok(readFileSync(txt, 'utf8').includes('Start at PEG_'));
});

test('cli writes a frame sequence for a still (draw-in + hold)', () => {
  const pattern = join(dir, 'f%03d.png');
  execFileSync('node', [bin, '-i', input, '-o', pattern, '-p', '40', '-q', '48', '-s', '64', '-fps', '4', '-intro', '1', '-hold', '0.5', '-seed', '1']);
  assert.ok(existsSync(join(dir, 'f000.png')));
  // 4 draw-in frames, 1 played frame, 2 held frames
  assert.ok(existsSync(join(dir, 'f006.png')));
  assert.ok(!existsSync(join(dir, 'f007.png')));
});

test('cli rejects bad flags with usage', () => {
  const r = spawnSync('node', [bin, '-i', input, '-o', join(dir, 'x.png'), '-bogus', '1'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown flag/);
  assert.match(r.stdout, /Usage/);
});

test('cli turns a video into a video through ffmpeg', { skip: !hasFFmpeg() && 'ffmpeg not installed' }, () => {
  const clip = join(dir, 'clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=96x64:rate=10:duration=1', '-pix_fmt', 'yuv420p', clip]);
  const out = join(dir, 'clip-threads.mp4');
  execFileSync('node', [bin, '-i', clip, '-o', out, '-p', '40', '-q', '48', '-s', '96', '-fps', '5', '-shape', 'rectangle', '-j', '2']);
  assert.ok(statSync(out).size > 500);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim();
  assert.equal(probe, '96,64,5');
});
