/**
 * Circuit Breaker for OpenRouter API
 * Prevents cascade failures and provides graceful degradation
 */

// ============================================================================
// TYPES
// ============================================================================

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms to wait before attempting recovery */
  recoveryTimeout: number;
  /** Number of successful calls in HALF_OPEN to close circuit */
  successThreshold: number;
  /** Time window in ms to count failures */
  failureWindow: number;
  /** Timeout per request in ms */
  requestTimeout: number;
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  openedAt: Date | null;
  closedAt: Date | null;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,       // Open after 5 failures
  recoveryTimeout: 30000,    // Wait 30s before trying again
  successThreshold: 2,       // 2 successes to close
  failureWindow: 60000,      // Count failures in last 60s
  requestTimeout: 60000,     // 60s timeout per request
};

// ============================================================================
// CIRCUIT BREAKER CLASS
// ============================================================================

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: { timestamp: number; error: string }[] = [];
  private halfOpenSuccesses = 0;
  private lastStateChange = Date.now();
  private stats: CircuitStats;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      state: "CLOSED",
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      openedAt: null,
      closedAt: new Date(),
    };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.stats.totalRequests++;

    // Check circuit state
    if (this.state === "OPEN") {
      if (this.shouldAttemptRecovery()) {
        this.transitionTo("HALF_OPEN");
      } else {
        throw new CircuitOpenError(
          `Circuit is OPEN. Recovery in ${this.timeUntilRecovery()}ms`,
          this.stats
        );
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }

  /**
   * Check if a request can be made (without executing)
   */
  canExecute(): boolean {
    if (this.state === "CLOSED") return true;
    if (this.state === "HALF_OPEN") return true;
    return this.shouldAttemptRecovery();
  }

  /**
   * Get current stats
   */
  getStats(): CircuitStats {
    return {
      ...this.stats,
      state: this.state,
      failures: this.getRecentFailureCount(),
      successes: this.halfOpenSuccesses,
    };
  }

  /**
   * Manually reset the circuit
   */
  reset(): void {
    this.transitionTo("CLOSED");
    this.failures = [];
    this.halfOpenSuccesses = 0;
  }

  /**
   * Force circuit open (for testing or manual intervention)
   */
  forceOpen(): void {
    this.transitionTo("OPEN");
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Request timeout after ${this.config.requestTimeout}ms`)),
          this.config.requestTimeout
        )
      ),
    ]);
  }

  private onSuccess(): void {
    this.stats.lastSuccess = new Date();
    this.stats.totalSuccesses++;

    if (this.state === "HALF_OPEN") {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionTo("CLOSED");
      }
    }
  }

  private onFailure(error: string): void {
    this.stats.lastFailure = new Date();
    this.stats.totalFailures++;

    this.failures.push({ timestamp: Date.now(), error });

    // Clean old failures
    this.cleanOldFailures();

    if (this.state === "HALF_OPEN") {
      // Any failure in HALF_OPEN reopens the circuit
      this.transitionTo("OPEN");
    } else if (this.state === "CLOSED") {
      if (this.getRecentFailureCount() >= this.config.failureThreshold) {
        this.transitionTo("OPEN");
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    console.log(`[CircuitBreaker] ${this.state} -> ${newState}`);
    this.state = newState;
    this.stats.state = newState;
    this.lastStateChange = Date.now();

    if (newState === "OPEN") {
      this.stats.openedAt = new Date();
    } else if (newState === "CLOSED") {
      this.stats.closedAt = new Date();
      this.failures = [];
      this.halfOpenSuccesses = 0;
    } else if (newState === "HALF_OPEN") {
      this.halfOpenSuccesses = 0;
    }
  }

  private shouldAttemptRecovery(): boolean {
    return Date.now() - this.lastStateChange >= this.config.recoveryTimeout;
  }

  private timeUntilRecovery(): number {
    const elapsed = Date.now() - this.lastStateChange;
    return Math.max(0, this.config.recoveryTimeout - elapsed);
  }

  private cleanOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindow;
    this.failures = this.failures.filter((f) => f.timestamp > cutoff);
  }

  private getRecentFailureCount(): number {
    this.cleanOldFailures();
    return this.failures.length;
  }
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class CircuitOpenError extends Error {
  readonly stats: CircuitStats;

  constructor(message: string, stats: CircuitStats) {
    super(message);
    this.name = "CircuitOpenError";
    this.stats = stats;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let circuitBreakerInstance: CircuitBreaker | null = null;

export function getCircuitBreaker(): CircuitBreaker {
  if (!circuitBreakerInstance) {
    circuitBreakerInstance = new CircuitBreaker();
  }
  return circuitBreakerInstance;
}

export function resetCircuitBreaker(): void {
  circuitBreakerInstance?.reset();
}
