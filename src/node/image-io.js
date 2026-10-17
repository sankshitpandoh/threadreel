import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export function loadImage(path) {
  return decodeImage(path === '-' ? readFileSync(0) : readFileSync(path));
}

// PNG or JPEG bytes to a straight-alpha RGBA image.
export function decodeImage(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const jpg = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048 });
    return { width: jpg.width, height: jpg.height, data: new Uint8ClampedArray(jpg.data.buffer) };
  }
  throw new Error('unsupported image format (expected PNG or JPEG)');
}

export function encodePNG(im) {
  const png = new PNG({ width: im.width, height: im.height });
  png.data = Buffer.from(im.data.buffer, im.data.byteOffset, im.data.length);
  return PNG.sync.write(png);
}

export function savePNG(path, im) {
  writeFileSync(path, encodePNG(im));
}

export function saveJPG(path, im, quality = 92) {
  const data = Buffer.from(im.data.buffer, im.data.byteOffset, im.data.length);
  writeFileSync(path, jpeg.encode({ width: im.width, height: im.height, data }, quality).data);
}

export function saveFile(path, contents) {
  if (path === '-') process.stdout.write(contents);
  else writeFileSync(path, contents);
}
