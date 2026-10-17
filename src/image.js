// Plain image helpers. Images are { width, height, data } with straight
// (non-premultiplied) RGBA bytes, the same layout as a browser ImageData.

export function createImage(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3] ?? 255;
    }
  }
  return { width, height, data };
}

// Area-averaging resize to exactly width x height.
export function resizeImage(im, width, height) {
  if (im.width === width && im.height === height) return im;
  const out = createImage(width, height);
  const sx = im.width / width;
  const sy = im.height / height;
  const src = im.data;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < im.height; yy++) {
        let i = (yy * im.width + x0) * 4;
        for (let xx = x0; xx < x1 && xx < im.width; xx++, i += 4) {
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++;
        }
      }
      const o = (y * width + x) * 4;
      if (n) {
        out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = a / n;
      }
    }
  }
  return out;
}

// Crop to the largest centered square.
export function cropSquare(im) {
  const s = Math.min(im.width, im.height);
  if (s === im.width && s === im.height) return im;
  const x0 = Math.floor((im.width - s) / 2);
  const y0 = Math.floor((im.height - s) / 2);
  const out = createImage(s, s);
  for (let y = 0; y < s; y++) {
    const from = ((y + y0) * im.width + x0) * 4;
    out.data.set(im.data.subarray(from, from + s * 4), y * s * 4);
  }
  return out;
}

// Size of the working image for a frame: the longer side becomes `size`.
export function fitSize(width, height, size) {
  const scale = size / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Prepare a frame for the solver: crop (for circles), then shrink.
export function prepareFrame(im, shape, size) {
  const cropped = shape === 'circle' ? cropSquare(im) : im;
  const { width, height } = fitSize(cropped.width, cropped.height, size);
  return resizeImage(cropped, width, height);
}

// Rec. 601 luma of a pixel, in 0..1. Alpha is composited over the given background (0 or 1).
export function luminance(data, i, bg = 1) {
  const a = data[i + 3] / 255;
  const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
  return l * a + bg * (1 - a);
}

export function channel(data, i, c, bg = 1) {
  const a = data[i + 3] / 255;
  return (data[i + c] / 255) * a + bg * (1 - a);
}
