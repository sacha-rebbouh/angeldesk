/**
 * Circuit Breaker for Context Engine Connectors
 *
 * Prevents cascading failures by tracking connector health.
 * If a connector fails too many times, it's "opened" (disabled)
 * for a cooldown period before being tested again.
 */

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half-open";
  successesSinceHalfOpen: number;
}

interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening
  cooldownMs: number;            // Time before trying again
  successThreshold: number;      // Successes needed to close
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 60_000,  // 1 minute cooldown
  successThreshold: 2,
};

// In-memory circuit state (resets on server restart, which is fine)
const circuits = new Map<string, CircuitState>();

/**
 * Get or initialize circuit state for a connector
 */
function getCircuit(connectorName: string): CircuitState {
  if (!circuits.has(connectorName)) {
    circuits.set(connectorName, {
      failures: 0,
      lastFailure: 0,
      state: "closed",
      successesSinceHalfOpen: 0,
    });
  }
  return circuits.get(connectorName)!;
}

/**
 * Check if connector is available (circuit not open)
 */
export function isCircuitClosed(
  connectorName: string,
  config: Partial<CircuitBreakerConfig> = {}
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const circuit = getCircuit(connectorName);

  if (circuit.state === "closed") {
    return true;
  }

  if (circuit.state === "open") {
    // Check if cooldown has passed
    const now = Date.now();
    if (now - circuit.lastFailure >= cfg.cooldownMs) {
      // Move to half-open - allow one test request
      circuit.state = "half-open";
      circuit.successesSinceHalfOpen = 0;
      console.log(`[CircuitBreaker] ${connectorName}: OPEN → HALF-OPEN (testing)`);
      return true;
    }
    return false;
  }

  // half-open: allow requests
  return true;
}

/**
 * Record a successful call
 */
export function recordSuccess(
  connectorName: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const circuit = getCircuit(connectorName);

  if (circuit.state === "half-open") {
    circuit.successesSinceHalfOpen++;
    if (circuit.successesSinceHalfOpen >= cfg.successThreshold) {
      // Connector is healthy again
      circuit.state = "closed";
      circuit.failures = 0;
      console.log(`[CircuitBreaker] ${connectorName}: HALF-OPEN → CLOSED (recovered)`);
    }
  } else if (circuit.state === "closed") {
    // Reset failure count on success
    circuit.failures = Math.max(0, circuit.failures - 1);
  }
}

/**
 * Record a failed call
 */
export function recordFailure(
  connectorName: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const circuit = getCircuit(connectorName);

  circuit.failures++;
  circuit.lastFailure = Date.now();

  if (circuit.state === "half-open") {
    // Failed during test - back to open
    circuit.state = "open";
    console.log(`[CircuitBreaker] ${connectorName}: HALF-OPEN → OPEN (test failed)`);
  } else if (circuit.state === "closed" && circuit.failures >= cfg.failureThreshold) {
    // Too many failures - open the circuit
    circuit.state = "open";
    console.log(`[CircuitBreaker] ${connectorName}: CLOSED → OPEN (${circuit.failures} failures)`);
  }
}

/**
 * Get all circuit states (for monitoring/debugging)
 */
export function getCircuitStates(): Record<string, CircuitState> {
  const states: Record<string, CircuitState> = {};
  circuits.forEach((state, name) => {
    states[name] = { ...state };
  });
  return states;
}

/**
 * Reset a specific circuit (for testing or manual recovery)
 */
export function resetCircuit(connectorName: string): void {
  circuits.delete(connectorName);
  console.log(`[CircuitBreaker] ${connectorName}: RESET`);
}

/**
 * Reset all circuits
 */
export function resetAllCircuits(): void {
  circuits.clear();
  console.log(`[CircuitBreaker] All circuits RESET`);
}
