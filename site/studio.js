import { InlinePool, buildTimeline, drawResult, solveFrames, threadLength, toSVG } from '../src/index.js';
import { canUseWebCodecs, downloadBlob, encodeVideo } from '../src/web/encode.js';
import { extractFrames, imageFrame, isImageFile, isVideoFile, loadVideo } from '../src/web/frames.js';
import { createWebPool } from '../src/web/pool.js';

const $ = (id) => document.getElementById(id);
const ui = {
  file: $('file'),
  sample: $('sample'),
  sampleImage: $('sample-image'),
  drop: $('drop'),
  canvas: $('canvas'),
  caption: $('caption'),
  original: $('original'),
  originalImage: $('original-image'),
  transport: $('transport'),
  play: $('play'),
  scrub: $('scrub'),
  time: $('time'),
  start: $('start'),
  stop: $('stop'),
  saveVideo: $('save-video'),
  savePng: $('save-png'),
  saveSvg: $('save-svg'),
  exportNote: $('export-note'),
  frames: $('s-frames'),
  lines: $('s-lines'),
  thread: $('s-thread'),
  elapsed: $('s-time'),
  playIcon: $('play-icon'),
  pegsVisible: $('pegs-visible'),
  allLines: $('all-lines'),
  presetReel: $('preset-reel'),
  presetDefault: $('preset-default'),
};
const ranges = ['pegs', 'lines', 'opacity', 'thickness', 'fps', 'duration', 'intro', 'quality', 'size'];

const PREVIEW_SIZE = 720;
const BOARD_METRES = 0.6; // the board the thread readout assumes
const PAUSE_PATH = 'M1 1h3.5v10H1zM7.5 1H11v10H7.5z';
const PLAY_PATH = 'M2 1l9 5-9 5z';
const WORKERS = Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4));
const SAMPLE_VIDEO = pickSample();
const SAMPLE_IMAGE = { url: new URL('media/monalisa.jpg', import.meta.url), name: 'Mona Lisa' };

// Everything about the current clip and its solution.
const state = {
  source: null, // { kind, name, url, video?, aspect }
  frames: null, // extracted working frames
  framesKey: '',
  results: [], // one per frame
  timeline: [],
  fps: 12,
  pool: null,
  abort: null,
  running: false,
  playing: false,
  step: 0,
  startedAt: 0,
  settings: null,
};

function pickSample() {
  const v = document.createElement('video');
  const mp4 = v.canPlayType('video/mp4; codecs="avc1.42E01E"');
  const name = mp4 ? 'moon.mp4' : 'moon.webm';
  return { url: new URL(`media/${name}`, import.meta.url), name: 'A Trip to the Moon' };
}

// Sliders show their value next to the label.
for (const id of ranges) {
  const input = $(id);
  const out = $(`${id}-out`);
  const show = () => {
    const v = input.value;
    out.textContent =
      id === 'intro' ? (v === '0' ? 'Not at all' : `${v} s`)
      : id === 'duration' ? `${v} s`
      : id === 'quality' || id === 'size' ? `${v} px`
      : id === 'fps' ? `${v} fps`
      : v;
  };
  input.addEventListener('input', show);
  show();
}

function readSettings() {
  const [mode, background] = document.querySelector('input[name="thread"]:checked').value.split('-');
  return {
    shape: document.querySelector('input[name="shape"]:checked').value,
    mode,
    background,
    pegs: Number($('pegs').value),
    lines: Number($('lines').value),
    opacity: Number($('opacity').value),
    thickness: Number($('thickness').value),
    fps: Number($('fps').value),
    duration: Number($('duration').value),
    intro: Number($('intro').value),
    quality: Number($('quality').value),
    size: Number($('size').value),
    showPegs: ui.pegsVisible.checked,
    exhaust: ui.allLines.checked,
  };
}

// The settings sliders and choices, as { id: value }.
const PRESETS = {
  default: { shape: 'circle', thread: 'mono-black', pegs: 240, lines: 4000, opacity: 0.1, thickness: 1, fps: 12, duration: 10, intro: 0, quality: 128, 'all-lines': false },
  // The dense reel look: 500 pegs, 5,000 lines on every frame, white on black.
  reel: { shape: 'circle', thread: 'mono-black', pegs: 500, lines: 5000, opacity: 0.05, thickness: 1.2, fps: 24, duration: 18, intro: 0, quality: 160, 'all-lines': true },
};

function applyPreset(name) {
  const p = PRESETS[name];
  for (const [id, value] of Object.entries(p)) {
    if (id === 'shape' || id === 'thread') {
      document.querySelector(`input[name="${id}"][value="${value}"]`).checked = true;
    } else {
      const input = $(id);
      if (input.type === 'checkbox') input.checked = value;
      else {
        input.value = String(value);
        input.dispatchEvent(new Event('input'));
      }
    }
  }
  if (state.source) start();
}

const setCaption = (text) => (ui.caption.textContent = text);
const setNote = (text, error = false) => {
  ui.exportNote.textContent = text;
  ui.exportNote.classList.toggle('error', error);
};

function describe(done) {
  const s = state.settings || readSettings();
  const n = state.results.filter(Boolean).length;
  const avg = averageLines();
  const thread = { 'mono-white': 'black thread on white', 'mono-black': 'white thread on black', 'color-white': 'cyan, magenta and yellow on white', 'color-black': 'red, green and blue on black' }[`${s.mode}-${s.background}`];
  const name = state.source ? `“${state.source.name}”` : 'Nothing';
  if (state.source && state.source.kind === 'image') {
    return `${name}: ${avg.toLocaleString()} lines of ${thread} around ${s.pegs} pegs${done ? ', drawing itself in.' : ' so far.'}`;
  }
  return `${name}: ${n} frames of about ${avg.toLocaleString()} lines each, ${thread} around ${s.pegs} pegs, ${state.fps} frames a second${done ? '.' : ' so far.'}`;
}

function averageThread() {
  const done = state.results.filter(Boolean);
  if (!done.length) return 0;
  return done.reduce((a, r) => a + threadLength(r), 0) / done.length;
}

function averageLines() {
  const done = state.results.filter(Boolean);
  if (!done.length) return 0;
  return Math.round(done.reduce((a, r) => a + r.segments, 0) / done.length);
}

// --- Source -------------------------------------------------------------

async function useFile(blob, name) {
  if (!blob) return;
  const kind = isVideoFile(blob) ? 'video' : isImageFile(blob) ? 'image' : null;
  if (!kind) {
    setCaption('That file is neither a video nor a picture this browser understands.');
    return;
  }
  stop();
  if (state.source && state.source.url) URL.revokeObjectURL(state.source.url);
  const url = URL.createObjectURL(blob);
  const source = { kind, name, url, blob };
  try {
    if (kind === 'video') {
      setCaption('Opening the clip.');
      source.video = await loadVideo(url);
      source.aspect = source.video.videoWidth / source.video.videoHeight;
      ui.original.src = url;
      ui.original.hidden = false;
      ui.originalImage.hidden = true;
      ui.original.play().catch(() => {});
    } else {
      const bitmap = await createImageBitmap(blob);
      source.aspect = bitmap.width / bitmap.height;
      bitmap.close();
      ui.originalImage.src = url;
      ui.originalImage.hidden = false;
      ui.original.hidden = true;
      ui.original.removeAttribute('src');
    }
  } catch (err) {
    setCaption(err.message || 'That file could not be opened.');
    URL.revokeObjectURL(url);
    return;
  }
  state.source = source;
  state.frames = null;
  state.framesKey = '';
  start();
}

async function useSample(sample) {
  setCaption('Fetching the sample.');
  try {
    const blob = await fetch(sample.url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    });
    await useFile(blob, sample.name);
  } catch (err) {
    setCaption(`The sample could not be fetched (${err.message}). Choose a file of your own.`);
  }
}

// --- Solving ---------------------------------------------------------------

function setRunning(on) {
  state.running = on;
  ui.start.textContent = on ? 'Begin again' : 'Begin';
  ui.start.disabled = !state.source;
  ui.stop.disabled = !on;
  updateExportButtons();
}

function updateExportButtons() {
  const has = state.results.some(Boolean);
  ui.saveVideo.disabled = !has || state.running;
  ui.savePng.disabled = !has;
  ui.saveSvg.disabled = !has;
}

async function gatherFrames(settings, signal) {
  const src = state.source;
  const key = `${src.url}|${settings.fps}|${settings.duration}|${settings.quality}`;
  if (state.frames && state.framesKey === key) return state.frames;
  // Extract so the shorter side is the working size: a circle's square crop keeps full detail.
  const longer = Math.min(640, Math.round(settings.quality * Math.max(src.aspect, 1 / src.aspect)));
  const frames = [];
  if (src.kind === 'image') {
    frames.push(await imageFrame(src.blob, longer));
  } else {
    await extractFrames(src.video, {
      fps: settings.fps,
      size: longer,
      maxDuration: settings.duration,
      signal,
      onFrame: (frame, i, count) => {
        frames.push(frame);
        if (i % 5 === 0 || i === count - 1) {
          setCaption(`Reading frame ${i + 1} of ${count}.`);
          ui.frames.textContent = `${i + 1} / ${count}`;
        }
      },
    });
    ui.original.play().catch(() => {});
  }
  state.frames = frames;
  state.framesKey = key;
  return frames;
}

async function start() {
  if (!state.source || !state.source.url) return;
  stop();
  const settings = readSettings();
  state.settings = settings;
  state.fps = settings.fps;
  state.results = [];
  state.timeline = [];
  state.playing = false;
  ui.transport.hidden = true;
  setNote('');
  setRunning(true);
  const abort = new AbortController();
  state.abort = abort;
  state.startedAt = performance.now();
  ui.lines.textContent = '–';
  ui.thread.textContent = '–';
  ui.elapsed.textContent = '–';

  let frames;
  try {
    frames = await gatherFrames(settings, abort.signal);
  } catch (err) {
    if (abort.signal.aborted) return;
    setCaption(err.message || 'The frames could not be read.');
    setRunning(false);
    return;
  }
  if (abort.signal.aborted) return;

  const options = {
    shape: settings.shape,
    mode: settings.mode,
    background: settings.background,
    pegs: settings.pegs,
    lines: settings.lines,
    opacity: settings.opacity,
    thickness: settings.thickness,
    size: settings.quality,
    exhaust: settings.exhaust,
  };
  const pool = frames.length > 1 && WORKERS > 1 ? createWebPool(options, Math.min(WORKERS, frames.length)) : new InlinePool(options);
  state.pool = pool;
  state.results = new Array(frames.length).fill(null);
  const t0 = performance.now();
  let shown = -1;
  setCaption(frames.length > 1 ? `Threading ${frames.length} frames.` : 'Threading the picture.');
  try {
    await solveFrames(pool, frames, (result, i, done, total) => {
      if (abort.signal.aborted) return;
      state.results[i] = result;
      const elapsed = (performance.now() - t0) / 1000;
      ui.frames.textContent = `${done} / ${total}`;
      ui.lines.textContent = averageLines().toLocaleString();
      ui.thread.textContent = `${Math.round(averageThread() * BOARD_METRES).toLocaleString()} m`;
      ui.elapsed.textContent = elapsed.toFixed(1);
      if (i > shown) {
        shown = i;
        paintResult(result, Infinity, settings);
      }
      setCaption(describe(false));
    });
  } catch (err) {
    if (abort.signal.aborted) return;
    setCaption(`Something went wrong: ${err.message}`);
    setRunning(false);
    return;
  }
  if (abort.signal.aborted) return;
  pool.close();
  state.pool = null;
  finishRun();
}

function finishRun() {
  const settings = state.settings;
  const isImage = state.source.kind === 'image';
  const intro = isImage && settings.intro === 0 ? 6 : settings.intro;
  const hold = isImage ? 2 : 0;
  state.timeline = buildTimeline({
    frames: state.results.length,
    fps: state.fps,
    intro,
    hold,
    segments: state.results[0].segments,
  });
  setCaption(describe(true));
  setRunning(false);
  ui.transport.hidden = false;
  ui.scrub.max = String(state.timeline.length - 1);
  play(0);
}

function stop() {
  const wasRunning = state.running;
  if (state.abort) state.abort.abort();
  state.abort = null;
  if (state.pool) {
    state.pool.close();
    state.pool = null;
  }
  state.playing = false;
  if (wasRunning) {
    // Keep what was finished, in order, and play that.
    const done = [];
    for (const r of state.results) {
      if (!r) break;
      done.push(r);
    }
    state.results = done;
    if (done.length) {
      finishRun();
      setCaption(`${describe(true)} Stopped early.`);
      return;
    }
    setCaption('Stopped.');
  }
  setRunning(false);
}

// --- Playback ----------------------------------------------------------------

function canvasSize(result) {
  const width = result.aspect >= 1 ? PREVIEW_SIZE : Math.round(PREVIEW_SIZE * result.aspect);
  const height = Math.round(width / result.aspect);
  return { width, height };
}

function paintResult(result, upTo, settings = state.settings) {
  const { width, height } = canvasSize(result);
  if (ui.canvas.width !== width || ui.canvas.height !== height) {
    ui.canvas.width = width;
    ui.canvas.height = height;
  }
  drawResult(ui.canvas.getContext('2d'), result, { width, height, upTo, showPegs: settings ? settings.showPegs : false });
}

function showStep(i) {
  const step = state.timeline[i];
  if (!step) return;
  state.step = i;
  paintResult(state.results[step.frame], step.upTo);
  ui.scrub.value = String(i);
  const seconds = i / state.fps;
  ui.time.textContent = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}.${String(Math.floor((seconds % 1) * 10))}`;
}

let playToken = 0;
function play(from = state.step) {
  if (!state.timeline.length) return;
  state.playing = true;
  ui.playIcon.firstElementChild.setAttribute('d', PAUSE_PATH);
  ui.play.setAttribute('aria-label', 'Pause');
  const token = ++playToken;
  const t0 = performance.now() - (from / state.fps) * 1000;
  const loop = () => {
    if (!state.playing || token !== playToken) return;
    const elapsed = (performance.now() - t0) / 1000;
    const i = Math.floor(elapsed * state.fps) % state.timeline.length;
    if (i !== state.step || elapsed === 0) showStep(i);
    requestAnimationFrame(loop);
  };
  showStep(from);
  requestAnimationFrame(loop);
}

function pause() {
  state.playing = false;
  ui.playIcon.firstElementChild.setAttribute('d', PLAY_PATH);
  ui.play.setAttribute('aria-label', 'Play');
}

ui.play.addEventListener('click', () => (state.playing ? pause() : play()));
ui.scrub.addEventListener('input', () => {
  pause();
  showStep(Number(ui.scrub.value));
});
ui.pegsVisible.addEventListener('change', () => {
  if (state.settings) state.settings.showPegs = ui.pegsVisible.checked;
  if (state.timeline.length) showStep(state.step);
});

// --- Exports -----------------------------------------------------------------

const fileStem = () => (state.source ? state.source.name : 'clip').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').toLowerCase() || 'clip';

function exportSize() {
  const first = state.results[0];
  const longer = Number($('size').value);
  let width = first.aspect >= 1 ? longer : Math.round(longer * first.aspect);
  let height = Math.round(width / first.aspect);
  width -= width % 2;
  height -= height % 2;
  return { width, height };
}

ui.saveVideo.addEventListener('click', async () => {
  if (!state.timeline.length || state.running) return;
  const { width, height } = exportSize();
  const settings = state.settings;
  const results = state.results;
  const timeline = state.timeline;
  ui.saveVideo.disabled = true;
  const webcodecs = canUseWebCodecs();
  setNote(webcodecs ? 'Encoding.' : 'Recording in real time, since this browser has no WebCodecs.');
  try {
    const out = await encodeVideo({
      width,
      height,
      fps: state.fps,
      frameCount: timeline.length,
      vendorBase: new URL('vendor/', import.meta.url),
      drawFrame: (ctx, i) => {
        const step = timeline[i];
        drawResult(ctx, results[step.frame], { width, height, upTo: step.upTo, showPegs: settings.showPegs });
      },
      onProgress: (p) => setNote(`${webcodecs ? 'Encoding' : 'Recording'}, ${Math.round(p * 100)}%.`),
    });
    downloadBlob(out.blob, `${fileStem()}-threads.${out.ext}`);
    setNote(`Saved a ${(out.blob.size / 1e6).toFixed(1)} MB ${out.ext.toUpperCase()} at ${width}×${height}, ${state.fps} fps.`);
  } catch (err) {
    setNote(`The video could not be encoded: ${err.message}`, true);
  }
  updateExportButtons();
});

ui.savePng.addEventListener('click', () => {
  const step = state.timeline[state.step];
  if (!step) return;
  const { width, height } = exportSize();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawResult(canvas.getContext('2d'), state.results[step.frame], { width, height, upTo: step.upTo, showPegs: state.settings.showPegs });
  canvas.toBlob((blob) => downloadBlob(blob, `${fileStem()}-frame-${step.frame + 1}.png`), 'image/png');
});

ui.saveSvg.addEventListener('click', () => {
  const step = state.timeline[state.step];
  if (!step) return;
  const { width, height } = exportSize();
  const svg = toSVG(state.results[step.frame], { width, height, upTo: step.upTo, showPegs: state.settings.showPegs });
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${fileStem()}-frame-${step.frame + 1}.svg`);
});

// --- Wiring ------------------------------------------------------------------

ui.file.addEventListener('change', () => {
  const f = ui.file.files[0];
  if (f) useFile(f, f.name);
  ui.file.value = '';
});
ui.sample.addEventListener('click', () => useSample(SAMPLE_VIDEO));
ui.sampleImage.addEventListener('click', () => useSample(SAMPLE_IMAGE));
ui.start.addEventListener('click', start);
ui.presetReel.addEventListener('click', () => applyPreset('reel'));
ui.presetDefault.addEventListener('click', () => applyPreset('default'));
ui.stop.addEventListener('click', stop);

let dragDepth = 0;
ui.drop.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  ui.drop.classList.add('over');
});
ui.drop.addEventListener('dragover', (e) => e.preventDefault());
ui.drop.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    ui.drop.classList.remove('over');
  }
});
ui.drop.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  ui.drop.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) useFile(f, f.name);
});

if (!canUseWebCodecs()) {
  setNote('Without WebCodecs this browser records the video in real time, so saving takes as long as the clip.');
}

// Expose a little for debugging and tests.
window.threadreel = state;

useSample(SAMPLE_VIDEO);
