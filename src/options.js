// Options shared by the solver, the renderer and both front ends.
//
//   shape       'circle' | 'ellipse' | 'rectangle'   where the pegs go
//   pegs        number of pegs around the frame
//   lines       maximum number of thread segments per frame
//   mode        'mono' | 'color'                     one thread, or three
//   background  'white' | 'black'                    dark thread on white, or light on black
//   opacity     0..1   how much of the picture one pass of thread covers
//   thickness   thread width in 1/1000ths of the frame's longer side
//   size        working resolution (longer side, in pixels) used by the search
//   recent      a thread may not return to one of its last N pegs
//   minGain     stop early once no segment improves the picture by this much (0 = exact break-even)
//   seed        random seed for tie-breaking, for reproducible output

export const SHAPES = ['circle', 'ellipse', 'rectangle'];
export const MODES = ['mono', 'color'];
export const BACKGROUNDS = ['white', 'black'];

export const DEFAULTS = Object.freeze({
  shape: 'circle',
  pegs: 240,
  lines: 2500,
  mode: 'mono',
  background: 'white',
  opacity: 0.3,
  thickness: 1,
  size: 128,
  recent: 20,
  minGain: 0,
  seed: undefined,
});

export function normalizeOptions(options = {}) {
  const o = { ...DEFAULTS, ...stripUndefined(options) };
  if (!SHAPES.includes(o.shape)) throw new Error(`unknown shape "${o.shape}" (${SHAPES.join(', ')})`);
  if (!MODES.includes(o.mode)) throw new Error(`unknown mode "${o.mode}" (${MODES.join(', ')})`);
  if (!BACKGROUNDS.includes(o.background)) {
    throw new Error(`unknown background "${o.background}" (${BACKGROUNDS.join(', ')})`);
  }
  o.pegs = clampInt(o.pegs, 8, 2000);
  o.lines = clampInt(o.lines, 0, 100000);
  o.size = clampInt(o.size, 16, 1024);
  o.recent = clampInt(o.recent, 0, 1000);
  o.opacity = clamp(Number(o.opacity), 0.005, 1);
  o.thickness = clamp(Number(o.thickness), 0.05, 100);
  o.minGain = Math.max(0, Number(o.minGain) || 0);
  return o;
}

// The colors of the threads a given mode and background use. Each is an RGB
// triple in 0..1. On white the threads subtract light (black, or cyan, magenta
// and yellow); on black they add it (white, or red, green and blue).
export function threadColors(mode, background) {
  const dark = background === 'white';
  if (mode === 'mono') return [dark ? [0, 0, 0] : [1, 1, 1]];
  return dark
    ? [[0, 1, 1], [1, 0, 1], [1, 1, 0]]
    : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
}

function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export function clampInt(x, lo, hi) {
  return clamp(Math.round(Number(x) || 0), lo, hi);
}
