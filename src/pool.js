// Solving many frames at once. InlinePool works on the calling thread;
// ThreadPool hands frames to workers (Node worker_threads or Web Workers)
// through small adapter handles, each of which must provide
// postMessage(msg, transfer), onMessage(fn) and terminate().

import { Threader } from './threader.js';

export class InlinePool {
  constructor(options = {}) {
    this.options = options;
    this.threader = new Threader(options);
    this.size = 1;
  }

  solve(image) {
    try {
      return Promise.resolve(this.threader.solve(image));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  close() {}
}

export class ThreadPool {
  constructor(handles, options = {}) {
    this.handles = handles;
    this.options = options;
    this.size = handles.length;
    this.queue = [];
    this.idle = [];
    this.current = handles.map(() => null);
    this.closed = false;
    handles.forEach((h, i) => {
      h.onMessage((msg) => this.receive(i, msg));
      h.postMessage({ type: 'init', options });
    });
  }

  receive(i, msg) {
    if (msg.type === 'ready') {
      this.idle.push(i);
      this.pump();
      return;
    }
    const job = this.current[i];
    this.current[i] = null;
    if (job) {
      if (msg.error) job.reject(new Error(msg.error));
      else job.resolve(msg.result);
    }
    this.idle.push(i);
    this.pump();
  }

  pump() {
    while (this.idle.length && this.queue.length) {
      const i = this.idle.pop();
      const job = this.queue.shift();
      this.current[i] = job;
      const { width, height, data } = job.image;
      // Copy so the caller keeps its frame; the copy is transferred.
      const copy = new Uint8ClampedArray(data);
      this.handles[i].postMessage({ type: 'solve', width, height, data: copy }, [copy.buffer]);
    }
  }

  solve(image) {
    if (this.closed) return Promise.reject(new Error('pool closed'));
    return new Promise((resolve, reject) => {
      this.queue.push({ image, resolve, reject });
      this.pump();
    });
  }

  close() {
    this.closed = true;
    for (const h of this.handles) h.terminate();
    for (const job of this.queue.splice(0)) job.reject(new Error('pool closed'));
    for (const job of this.current) if (job) job.reject(new Error('pool closed'));
    this.current.fill(null);
  }
}

// Solve every frame of a list, in parallel, keeping order. onFrame(result, index, done, total)
// fires as frames finish (not necessarily in order).
export async function solveFrames(pool, frames, onFrame) {
  let done = 0;
  const results = await Promise.all(
    frames.map((frame, i) =>
      pool.solve(frame).then((result) => {
        done++;
        if (onFrame) onFrame(result, i, done, frames.length);
        return result;
      })
    )
  );
  return results;
}

// The message handler that runs inside each worker.
export function createWorkerHandler(post) {
  let threader = null;
  return (msg) => {
    try {
      if (msg.type === 'init') {
        threader = new Threader(msg.options);
        post({ type: 'ready' });
        return;
      }
      if (msg.type === 'solve') {
        const image = { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.data) };
        post({ type: 'result', result: threader.solve(image) });
        return;
      }
      post({ type: 'result', error: `unknown message: ${msg.type}` });
    } catch (err) {
      post({ type: 'result', error: String(err && err.stack ? err.stack : err) });
    }
  };
}
