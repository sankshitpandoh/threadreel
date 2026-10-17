import { parentPort } from 'node:worker_threads';
import { createWorkerHandler } from '../pool.js';

const handle = createWorkerHandler((msg) => parentPort.postMessage(msg));
parentPort.on('message', handle);
