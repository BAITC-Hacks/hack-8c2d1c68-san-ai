/** Shared capacity across documents in this Node process. Waiting work is cancellable. */
export class ExtractionPool {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(readonly capacity = 4) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Invalid extraction capacity");
  }

  async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal.removeEventListener("abort", cancel);
        this.active++;
        resolve();
      };
      const cancel = () => {
        this.queue = this.queue.filter(entry => entry !== start);
        reject(signal.reason);
      };
      if (this.active < this.capacity) start();
      else {
        this.queue.push(start);
        signal.addEventListener("abort", cancel, { once: true });
      }
    });
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const shared = globalThis as typeof globalThis & { extractionPool?: ExtractionPool };
export const extractionPool = shared.extractionPool ??= new ExtractionPool();
