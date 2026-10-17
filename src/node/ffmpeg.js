// Video in and out through ffmpeg, which must be on the PATH. Frames travel as
// raw RGBA over pipes, so nothing is written to disk in between.
import { spawn, spawnSync } from 'node:child_process';

export function hasFFmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

export function probeVideo(path) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,duration,nb_frames:format=duration', '-of', 'json', path],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr || 'is ffmpeg installed?'}`);
  const info = JSON.parse(r.stdout);
  const s = info.streams && info.streams[0];
  if (!s) throw new Error('no video stream found');
  const [num, den] = String(s.r_frame_rate || '0/1').split('/').map(Number);
  const duration = Number(s.duration) || Number(info.format && info.format.duration) || 0;
  return { width: s.width, height: s.height, fps: den ? num / den : 0, duration };
}

// Decode a video to frames at `fps`, each scaled so the longer side is `size`
// pixels. Calls onFrame(image, index) for each; resolves with the frame count.
export function readFrames(path, { fps, size, maxDuration, onFrame }) {
  const info = probeVideo(path);
  const scale = size / Math.max(info.width, info.height);
  const width = even(Math.max(2, Math.round(info.width * scale)));
  const height = even(Math.max(2, Math.round(info.height * scale)));
  const args = ['-v', 'error', '-i', path];
  if (maxDuration) args.push('-t', String(maxDuration));
  args.push('-vf', `fps=${fps},scale=${width}:${height}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1');
  const frameBytes = width * height * 4;
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    let pending = Buffer.alloc(0);
    let index = 0;
    proc.stdout.on('data', (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= frameBytes) {
        const data = new Uint8ClampedArray(pending.subarray(0, frameBytes));
        pending = pending.subarray(frameBytes);
        onFrame({ width, height, data }, index++);
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited with ${code}: ${stderr}`));
      else resolve({ frames: index, width, height, source: info });
    });
  });
}

// Encode RGBA frames to a video file. Returns { write(image), end() }.
export function createVideoWriter(path, { width, height, fps, quality = 'high' }) {
  const ext = path.toLowerCase().split('.').pop();
  const args = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0'];
  if (ext === 'gif') {
    args.push('-vf', 'split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0');
  } else if (ext === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', quality === 'high' ? '28' : '36', '-pix_fmt', 'yuv420p');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', quality === 'high' ? '22' : '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  }
  args.push(path);
  const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => (stderr += d));
  const finished = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${stderr}`))));
  });
  return {
    write(image) {
      const buf = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.length);
      if (!proc.stdin.write(buf)) return new Promise((r) => proc.stdin.once('drain', r));
      return Promise.resolve();
    },
    end() {
      proc.stdin.end();
      return finished;
    },
  };
}

export function even(n) {
  return n % 2 ? n + 1 : n;
}
