#!/usr/bin/env node
// threadreel: string art from pictures and videos, on the command line.
import { availableParallelism } from 'node:os';
import { basename, extname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DEFAULTS, InlinePool, Threader, buildTimeline, rasterize, solveFrames, toInstructions, toSVG } from '../src/index.js';
import { createVideoWriter, hasFFmpeg, readFrames } from '../src/node/ffmpeg.js';
import { loadImage, saveFile, saveJPG, savePNG } from '../src/node/image-io.js';
import { createNodePool } from '../src/node/pool.js';

const usage = `Usage: threadreel -i input -o output [options]

  Input is a picture (PNG, JPEG) or, with ffmpeg on the PATH, any video.
  Output is chosen by extension:
    .png .jpg      one frame (for a video: the first frame)
    .svg .txt      vector drawing, or stringing instructions (mono only)
    .mp4 .webm .gif  a video: the input video as string art, or a still drawing itself in
    frames/%04d.png  every output frame as a PNG

  -i <path>        input file
  -o <path>        output file (repeatable)
  -shape <s>       circle | ellipse | rectangle (default ${DEFAULTS.shape})
  -p <n>           pegs around the frame (default ${DEFAULTS.pegs})
  -n <n>           maximum segments per frame (default ${DEFAULTS.lines})
  -mode <m>        mono | color (default ${DEFAULTS.mode})
  -bg <b>          white | black (default ${DEFAULTS.background})
  -opacity <x>     thread opacity 0..1 (default ${DEFAULTS.opacity})
  -thickness <x>   thread width, 1/1000ths of the frame (default ${DEFAULTS.thickness})
  -q <px>          working resolution, longer side (default ${DEFAULTS.size})
  -s <px>          output size, longer side (default 1080)
  -fps <n>         frames per second to sample from the video (default 12)
  -t <sec>         use only the first N seconds of the video
  -intro <sec>     draw the first frame in over N seconds (default 0 for video, 6 for a still)
  -hold <sec>      hold the last frame for N seconds (default 0 for video, 2 for a still)
  -pegs-visible    draw the pegs
  -j <n>           worker threads (default: all cores)
  -seed <n>        random seed, for reproducible output
  -v               report progress
`;

function fail(...messages) {
  for (const m of messages) console.error(m);
  process.stdout.write(usage);
  process.exit(1);
}

function parseArgs(argv) {
  const o = {
    input: '',
    outputs: [],
    options: {},
    outputSize: 1080,
    fps: 12,
    maxDuration: 0,
    intro: undefined,
    hold: undefined,
    showPegs: false,
    workers: 0,
    verbose: false,
  };
  const map = {
    shape: ['options', 'shape', String],
    p: ['options', 'pegs', Number],
    n: ['options', 'lines', Number],
    mode: ['options', 'mode', String],
    bg: ['options', 'background', String],
    opacity: ['options', 'opacity', Number],
    thickness: ['options', 'thickness', Number],
    q: ['options', 'size', Number],
    seed: ['options', 'seed', Number],
    s: [null, 'outputSize', Number],
    fps: [null, 'fps', Number],
    t: [null, 'maxDuration', Number],
    intro: [null, 'intro', Number],
    hold: [null, 'hold', Number],
    j: [null, 'workers', Number],
  };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (!arg.startsWith('-')) fail(`unexpected argument: ${arg}`);
    arg = arg.replace(/^-+/, '');
    let value;
    const eq = arg.indexOf('=');
    if (eq >= 0) {
      value = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    if (arg === 'h' || arg === 'help') {
      process.stdout.write(usage);
      process.exit(0);
    }
    if (arg === 'v') { o.verbose = true; continue; }
    if (arg === 'pegs-visible') { o.showPegs = true; continue; }
    if (value === undefined) value = argv[++i];
    if (value === undefined) fail(`flag -${arg} needs a value`);
    if (arg === 'i') o.input = value;
    else if (arg === 'o') o.outputs.push(value);
    else if (map[arg]) {
      const [group, key, type] = map[arg];
      const v = type(value);
      if (type === Number && !Number.isFinite(v)) fail(`-${arg} needs a number, got "${value}"`);
      if (group) o[group][key] = v;
      else o[key] = v;
    } else fail(`unknown flag -${arg}`);
  }
  if (!o.input) fail('an input (-i) is required');
  if (!o.outputs.length) fail('an output (-o) is required');
  return o;
}

const VIDEO_EXT = new Set(['.mp4', '.webm', '.gif', '.mov', '.mkv', '.avi', '.m4v']);
const isVideoPath = (p) => VIDEO_EXT.has(extname(p).toLowerCase());
const isSequence = (p) => /%0?\d*d/.test(p);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = args.verbose ? (...m) => console.error(...m) : () => {};
  const t0 = performance.now();
  const videoIn = isVideoPath(args.input);
  const videoOut = args.outputs.some((p) => isVideoPath(p) || isSequence(p));
  if ((videoIn || args.outputs.some(isVideoPath)) && !hasFFmpeg()) {
    fail('ffmpeg is needed to read or write video; install it or use picture in/out');
  }

  // Gather the input frames at the working resolution.
  const frames = [];
  let sourceAspect;
  const options = { ...args.options };
  const workSize = options.size ?? DEFAULTS.size;
  if (videoIn) {
    const info = await readFrames(args.input, {
      fps: args.fps,
      size: workSize,
      maxDuration: args.maxDuration || undefined,
      onFrame: (im) => frames.push(im),
    });
    sourceAspect = info.width / info.height;
    log(`read ${frames.length} frames at ${info.width}x${info.height}, ${args.fps} fps`);
  } else {
    const im = loadImage(args.input);
    frames.push(im);
    sourceAspect = im.width / im.height;
  }
  if (!frames.length) fail('no frames found in the input');

  const workers = args.workers || availableParallelism();
  const pool = frames.length > 1 && workers > 1 ? createNodePool(options, Math.min(workers, frames.length)) : new InlinePool(options);
  let lastReport = 0;
  const results = await solveFrames(pool, frames, (r, i, done, total) => {
    if (performance.now() - lastReport > 500 || done === total) {
      lastReport = performance.now();
      log(`solved ${done}/${total} frames (${r.segments} segments in frame ${i})`);
    }
  });
  pool.close();
  log(`search took ${((performance.now() - t0) / 1000).toFixed(1)}s`);

  const still = frames.length === 1;
  const intro = args.intro ?? (still ? 6 : 0);
  const hold = args.hold ?? (still ? 2 : 0);
  const first = results[0];
  const renderOpts = { width: Math.round(first.aspect >= 1 ? args.outputSize : args.outputSize * first.aspect), showPegs: args.showPegs };
  renderOpts.height = Math.round(renderOpts.width / first.aspect);
  if (videoOut) {
    renderOpts.width -= renderOpts.width % 2;
    renderOpts.height -= renderOpts.height % 2;
  }

  for (const out of args.outputs) {
    const ext = extname(out).toLowerCase();
    if (isVideoPath(out) || isSequence(out)) {
      const timeline = buildTimeline({ frames: results.length, fps: args.fps, intro, hold, segments: first.segments });
      const writer = isSequence(out) ? null : createVideoWriter(out, { ...renderOpts, fps: args.fps });
      for (let i = 0; i < timeline.length; i++) {
        const step = timeline[i];
        const image = rasterize(results[step.frame], { ...renderOpts, upTo: step.upTo });
        if (writer) await writer.write(image);
        else savePNG(out.replace(/%0?(\d*)d/, (_, w) => String(i).padStart(Number(w) || 0, '0')), image);
        if (performance.now() - lastReport > 500 || i === timeline.length - 1) {
          lastReport = performance.now();
          log(`rendered ${i + 1}/${timeline.length} output frames`);
        }
      }
      if (writer) await writer.end();
    } else if (ext === '.svg') {
      saveFile(out, toSVG(first, renderOpts));
    } else if (ext === '.txt') {
      saveFile(out, toInstructions(first));
    } else if (ext === '.png') {
      savePNG(out, rasterize(first, renderOpts));
    } else if (ext === '.jpg' || ext === '.jpeg') {
      saveJPG(out, rasterize(first, renderOpts));
    } else {
      fail(`unsupported output: ${basename(out)}`);
    }
    log(`wrote ${out}`);
  }
  log(`done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});

// Keep Threader referenced for consumers reading this file as an example.
void Threader;
