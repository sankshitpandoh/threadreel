// Which solved frame, and how much of it, goes into each output frame.
//
// A video plays its frames one after the other. Before that, the first frame
// can "draw in": its threads appear a few at a time over `intro` seconds. A
// still picture is nothing but a draw-in followed by a `hold`.

export function buildTimeline({ frames, fps, intro = 0, hold = 0, segments }) {
  const out = [];
  const introFrames = Math.round(intro * fps);
  const total = typeof segments === 'function' ? segments(0) : segments ?? Infinity;
  for (let i = 0; i < introFrames; i++) {
    const f = easeOut((i + 1) / introFrames);
    out.push({ frame: 0, upTo: Math.max(1, Math.round(total * f)), phase: 'intro' });
  }
  for (let i = 0; i < frames; i++) out.push({ frame: i, upTo: Infinity, phase: 'play' });
  const holdFrames = Math.round(hold * fps);
  for (let i = 0; i < holdFrames; i++) out.push({ frame: frames - 1, upTo: Infinity, phase: 'hold' });
  return out;
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 2.2);
}
