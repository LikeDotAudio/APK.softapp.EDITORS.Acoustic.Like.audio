// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { runJob } from './compute.js';

/** Off the page's thread: a wave field over six faces is tens of millions of complex terms. */
self.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    const result = runJob(job);
    const buffers = [result.values.plan.buffer, result.values.floor.buffer, result.values.ceiling.buffer, ...result.values.walls.map((w) => w.buffer)];
    self.postMessage({ id, result }, buffers);
  } catch (err) {
    self.postMessage({ id, error: String(err?.stack || err) });
  }
};
