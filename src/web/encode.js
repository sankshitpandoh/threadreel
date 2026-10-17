// Turning rendered frames into a video file in the browser.
//
// With WebCodecs (Chrome, Edge, Safari 16.4+, Firefox 130+) frames are encoded
// as fast as the machine allows and muxed into MP4 (H.264) or WebM (VP9/VP8)
// with mp4-muxer / webm-muxer. Everywhere else, MediaRecorder records a canvas
// in real time, which is slower but needs nothing.

const CANDIDATES = [
  { container: 'mp4', codec: 'avc1.640028', muxCodec: 'avc', mime: 'video/mp4', ext: 'mp4', extra: { avc: { format: 'avc' } } },
  { container: 'mp4', codec: 'avc1.4d0028', muxCodec: 'avc', mime: 'video/mp4', ext: 'mp4', extra: { avc: { format: 'avc' } } },
  { container: 'mp4', codec: 'avc1.42001f', muxCodec: 'avc', mime: 'video/mp4', ext: 'mp4', extra: { avc: { format: 'avc' } } },
  { container: 'webm', codec: 'vp09.00.10.08', muxCodec: 'V_VP9', mime: 'video/webm', ext: 'webm' },
  { container: 'webm', codec: 'vp8', muxCodec: 'V_VP8', mime: 'video/webm', ext: 'webm' },
];

export function canUseWebCodecs() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

async function pickCodec(width, height, fps, bitrate) {
  for (const c of CANDIDATES) {
    const config = { codec: c.codec, width, height, bitrate, framerate: fps, ...(c.extra || {}) };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config);
      if (supported) return { ...c, config };
    } catch {
      // try the next one
    }
  }
  return null;
}

// drawFrame(ctx, index) paints output frame `index` onto a 2D context of the
// right size. Returns { blob, ext, mime, encoder: 'webcodecs' | 'mediarecorder' }.
export async function encodeVideo({ width, height, fps, frameCount, drawFrame, onProgress, bitrate, signal, vendorBase }) {
  width -= width % 2;
  height -= height % 2;
  const kbps = bitrate || Math.round(Math.min(12000, Math.max(1500, (width * height * fps) / 220)));
  if (canUseWebCodecs()) {
    const chosen = await pickCodec(width, height, fps, kbps * 1000);
    if (chosen) return encodeWithWebCodecs({ width, height, fps, frameCount, drawFrame, onProgress, signal, chosen, vendorBase });
  }
  return encodeWithMediaRecorder({ width, height, fps, frameCount, drawFrame, onProgress, signal, kbps });
}

async function loadMuxer(container, vendorBase) {
  const base = vendorBase || new URL('../../site/vendor/', import.meta.url);
  const name = container === 'mp4' ? 'mp4-muxer.mjs' : 'webm-muxer.mjs';
  return import(/* @vite-ignore */ new URL(name, base).href);
}

async function encodeWithWebCodecs({ width, height, fps, frameCount, drawFrame, onProgress, signal, chosen, vendorBase }) {
  const { Muxer, ArrayBufferTarget } = await loadMuxer(chosen.container, vendorBase);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: chosen.container === 'mp4'
      ? { codec: chosen.muxCodec, width, height }
      : { codec: chosen.muxCodec, width, height, frameRate: fps },
    fastStart: chosen.container === 'mp4' ? 'in-memory' : undefined,
  });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e),
  });
  encoder.configure(chosen.config);
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  const frameMicros = Math.round(1e6 / fps);
  for (let i = 0; i < frameCount; i++) {
    if (signal && signal.aborted) {
      encoder.close();
      throw new DOMException('aborted', 'AbortError');
    }
    if (failure) throw failure;
    drawFrame(ctx, i);
    const frame = new VideoFrame(canvas, { timestamp: i * frameMicros, duration: frameMicros });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 2));
    if (onProgress) onProgress((i + 1) / frameCount);
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: chosen.mime }), ext: chosen.ext, mime: chosen.mime, encoder: 'webcodecs', codec: chosen.codec };
}

function encodeWithMediaRecorder({ width, height, fps, frameCount, drawFrame, onProgress, signal, kbps }) {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === 'undefined') {
      reject(new Error('This browser can encode neither with WebCodecs nor MediaRecorder.'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const recorder = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: kbps * 1000 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onerror = (e) => reject(e.error || new Error('recording failed'));
    recorder.onstop = () => {
      const type = mime.split(';')[0] || 'video/webm';
      resolve({ blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', mime: type, encoder: 'mediarecorder' });
    };
    let i = 0;
    drawFrame(ctx, 0);
    recorder.start(250);
    const interval = setInterval(() => {
      if (signal && signal.aborted) {
        clearInterval(interval);
        recorder.stop();
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      drawFrame(ctx, i);
      if (track.requestFrame) track.requestFrame();
      i++;
      if (onProgress) onProgress(Math.min(1, i / frameCount));
      if (i >= frameCount) {
        clearInterval(interval);
        setTimeout(() => recorder.stop(), 1000 / fps + 100);
      }
    }, 1000 / fps);
  });
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
