export function createMeiScribeClient() {
  let worker = null;
  let requestId = 0;
  const pending = new Map();
  let createdAt = null;

  function ensureWorker() {
    if (worker) return worker;
    createdAt = performance.now();
    worker = new Worker(new URL("../mei-scribe-worker.mjs?v=069193866192", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => {
      const { id, ok, ...payload } = event.data;
      const waiter = pending.get(id);
      if (!waiter) return;
      pending.delete(id);
      if (ok) waiter.resolve(payload);
      else waiter.reject(payload.error || payload);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "mei-scribe worker failed");
      for (const waiter of pending.values()) waiter.reject(error);
      pending.clear();
    };
    return worker;
  }

  function call(type, payload = {}, transfer = []) {
    const active = ensureWorker();
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      active.postMessage({ id, type, payload }, transfer);
    });
  }

  return {
    hasWorker() {
      return worker !== null;
    },
    createdAt() {
      return createdAt;
    },
    initialize() {
      return call("initialize");
    },
    convert(sourceBuffer, sourceName) {
      const transfer = sourceBuffer instanceof ArrayBuffer ? [sourceBuffer] : [];
      return call("convert", { sourceBuffer, sourceName }, transfer);
    },
  };
}
