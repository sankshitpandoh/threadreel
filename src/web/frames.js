// Pulling frames out of a video file in the browser: the file is played
// through a <video> element and sampled by seeking, which works for anything
// the browser can decode, with no demuxer of our own.

export function isVideoFile(file) {
  return /^video\//.test(file.type) || /\.(mp4|m4v|mov|webm|mkv|ogv)$/i.test(file.name || '');
}

export function isImageFile(file) {
  return /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name || '');
}

export function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    const fail = () => reject(new Error('This video could not be decoded by your browser. Try an MP4 (H.264) or WebM file.'));
    video.addEventListener('error', fail, { once: true });
    video.addEventListener(
      'loadedmetadata',
      () => {
        if (!video.videoWidth || !video.videoHeight) return fail();
        resolve(video);
      },
      { once: true }
    );
    video.src = url;
    video.load();
  });
}

// Some containers report Infinity for the duration until the end is seen.
export async function videoDuration(video) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  return new Promise((resolve) => {
    const onUpdate = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.removeEventListener('durationchange', onUpdate);
        video.currentTime = 0;
        resolve(video.duration);
      }
    };
    video.addEventListener('durationchange', onUpdate);
    video.currentTime = 1e9;
  });
}

function seek(video, time) {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error('seeking failed'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', fail, { once: true });
    video.currentTime = time;
  });
}

// Sample a video at `fps` for up to `maxDuration` seconds, drawing each frame
// into a canvas whose longer side is `size`. Yields plain { width, height, data }
// images through onFrame(image, index, count) and returns the frame count.
export async function extractFrames(video, { fps = 12, size = 128, maxDuration = 10, onFrame, signal } = {}) {
  const duration = Math.min(await videoDuration(video), maxDuration);
  const count = Math.max(1, Math.floor(duration * fps));
  const scale = size / Math.max(video.videoWidth, video.videoHeight);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  for (let i = 0; i < count; i++) {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    // Sample mid-interval so the first frame is not the very first (often black) one.
    const t = Math.min(duration - 0.001, (i + 0.5) / fps);
    await seek(video, t);
    ctx.drawImage(video, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    if (onFrame) await onFrame({ width, height, data }, i, count);
  }
  return { count, width, height, duration: count / fps };
}

// A still picture as a single frame.
export async function imageFrame(blob, size = 128) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
}
