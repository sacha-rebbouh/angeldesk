import type { JobResult, JobOptions } from './types';
import { DEFAULT_JOB_OPTIONS } from './types';

/**
 * Execute a job with timeout and retry logic.
 * V1: Runs inline (synchronous from caller's perspective, but async internally).
 * V2: Replace with Inngest/Trigger.dev dispatch.
 */
export async function runJob<T>(
  name: string,
  fn: () => Promise<T>,
  options?: Partial<JobOptions>
): Promise<JobResult<T>> {
  const opts = { ...DEFAULT_JOB_OPTIONS, ...options };
  const startTime = Date.now();

  let lastError: Error | null = null;
  const maxAttempts = (opts.maxRetries ?? 0) + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Job "${name}" timed out after ${opts.timeoutMs}ms`)),
          opts.timeoutMs
        );
      });

      // Race between job execution and timeout
      const data = await Promise.race([fn(), timeoutPromise]);

      return {
        status: 'COMPLETED',
        data,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[JobRunner] Job "${name}" attempt ${attempt}/${maxAttempts} failed:`,
        lastError.message
      );

      // Wait before retry (except on last attempt)
      if (attempt < maxAttempts && opts.retryDelayMs) {
        await new Promise(resolve => setTimeout(resolve, opts.retryDelayMs));
      }
    }
  }

  console.error(`[JobRunner] Job "${name}" failed after ${maxAttempts} attempts`);

  return {
    status: 'FAILED',
    error: lastError?.message ?? 'Unknown error',
    durationMs: Date.now() - startTime,
  };
}
