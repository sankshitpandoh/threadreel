import { backgroundColor, frameSize, segmentBudget, threadWidth } from './render.js';

// An SVG of a solved frame. Threads on white use multiply blending, on black
// additive ("plus-lighter" where supported, "screen" as the fallback).
export function toSVG(result, opts = {}) {
  const { width, height } = frameSize(result, opts);
  const bg = backgroundColor(result);
  const lw = threadWidth(result, width, height, opts.thickness);
  const alpha = opts.opacity ?? result.opacity;
  const blend = result.background === 'white' ? 'multiply' : 'plus-lighter';
  const budget = segmentBudget(result, opts.upTo ?? Infinity);
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  out.push(`<rect width="100%" height="100%" fill="rgb(${bg.join(',')})"/>`);
  out.push(`<g fill="none" stroke-width="${round(lw)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${alpha}" style="mix-blend-mode:${blend}">`);
  result.threads.forEach((thread, t) => {
    const n = budget[t];
    if (n <= 0) return;
    const c = thread.color.map((v) => Math.round(v * 255));
    // One <line> per segment, so crossings of the same thread stack up.
    out.push(`<g stroke="rgb(${c.join(',')})">`);
    for (let i = 0; i < n; i++) {
      const p = result.pegs[thread.pegs[i]];
      const q = result.pegs[thread.pegs[i + 1]];
      out.push(`<line x1="${round(p.x * width)}" y1="${round(p.y * height)}" x2="${round(q.x * width)}" y2="${round(q.y * height)}"/>`);
    }
    out.push('</g>');
  });
  out.push('</g>');
  if (opts.showPegs) {
    const r = Math.max(1.5, 0.004 * Math.max(width, height));
    out.push(`<g fill="${opts.pegColor || '#c4432b'}">`);
    for (const p of result.pegs) out.push(`<circle cx="${round(p.x * width)}" cy="${round(p.y * height)}" r="${round(r)}"/>`);
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('\n');
}

// Plain-text instructions to make a monochrome frame for real.
export function toInstructions(result) {
  if (result.mode !== 'mono') return 'Instructions are only available for a single thread.';
  const lines = [];
  lines.push('Threadreel: how to string this frame by hand.');
  lines.push('');
  lines.push(`Frame: ${result.shape}, ${result.pegs.length} pegs, aspect ratio ${result.aspect.toFixed(3)} (width / height).`);
  lines.push('Units are fractions of the frame width and height; scale them to any size you like.');
  lines.push('');
  lines.push('Pegs:');
  result.pegs.forEach((p, i) => lines.push(`  PEG_${i}: x=${p.x.toFixed(4)}  y=${p.y.toFixed(4)}`));
  const thread = result.threads[0];
  lines.push('');
  lines.push(`Thread: ${thread.pegs.length - 1} segments.`);
  lines.push(`  Start at PEG_${thread.pegs[0]}`);
  for (let i = 1; i < thread.pegs.length; i++) lines.push(`  ${i}. to PEG_${thread.pegs[i]}`);
  return lines.join('\n');
}

function round(x) {
  return Math.round(x * 100) / 100;
}
