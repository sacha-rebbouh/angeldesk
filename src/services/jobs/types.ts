/**
 * Background Job System - Abstraction layer
 *
 * V1: Synchronous execution (inline)
 * V2: Can be swapped for Inngest, Trigger.dev, Bull, etc.
 */

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface JobResult<T = unknown> {
  status: JobStatus;
  data?: T;
  error?: string;
  durationMs?: number;
}

export interface JobOptions {
  /** Maximum execution time in ms */
  timeoutMs?: number;
  /** Number of retry attempts */
  maxRetries?: number;
  /** Delay between retries in ms */
  retryDelayMs?: number;
}

export const DEFAULT_JOB_OPTIONS: JobOptions = {
  timeoutMs: 120000, // 2 minutes
  maxRetries: 2,
  retryDelayMs: 5000,
};
