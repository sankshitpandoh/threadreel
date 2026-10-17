import { createImage } from '../src/index.js';

// A white square with a black disc in the middle.
export function discImage(size = 64, radius = size / 4) {
  const im = createImage(size, size, [255, 255, 255, 255]);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x + 0.5 - c, y + 0.5 - c) <= radius) {
        const i = (y * size + x) * 4;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = 0;
      }
    }
  }
  return im;
}

// Left half black, right half white.
export function halfImage(width = 64, height = 48) {
  const im = createImage(width, height, [255, 255, 255, 255]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width / 2; x++) {
      const i = (y * width + x) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = 0;
    }
  }
  return im;
}
