import { createWorkerHandler } from '../pool.js';

const handle = createWorkerHandler((msg) => self.postMessage(msg));
self.onmessage = (e) => handle(e.data);
