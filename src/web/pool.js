import { ThreadPool } from '../pool.js';

export function createWebPool(options = {}, count = Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4))) {
  const handles = [];
  for (let i = 0; i < count; i++) {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    handles.push({
      postMessage: (msg, transfer) => worker.postMessage(msg, transfer || []),
      onMessage: (fn) => worker.addEventListener('message', (e) => fn(e.data)),
      terminate: () => worker.terminate(),
    });
  }
  return new ThreadPool(handles, options);
}
