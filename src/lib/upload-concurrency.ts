/**
 * Phase B1 — Concurrency-limited task pool.
 *
 * Simple FIFO semaphore. Used by the upload modal to cap how many
 * validation passes run in parallel after file selection (default 2 —
 * configurable so we can tune for slower / faster validation later).
 *
 * Designed for short-lived bounded queues (handful of files), NOT a
 * general-purpose async pool. No priority, no cancellation. If a task
 * throws, the slot is released and the rejection propagates to its caller;
 * other tasks in the pool keep running.
 */

export interface ConcurrencyPool {
  /** Run a task as soon as a slot is free. Resolves/rejects with the task's outcome. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Number of currently-running tasks (0..limit). */
  readonly active: number;
  /** Number of tasks waiting for a slot. */
  readonly pending: number;
  /** The configured concurrency limit. */
  readonly limit: number;
}

export function createConcurrencyPool(limit: number): ConcurrencyPool {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`createConcurrencyPool: limit must be a positive integer, got ${limit}`);
  }
  let active = 0;
  const waiters: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiters.push(() => {
        active += 1;
        resolve();
      });
    });
  };

  const release = (): void => {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
    get pending() {
      return waiters.length;
    },
    get limit() {
      return limit;
    },
  };
}
