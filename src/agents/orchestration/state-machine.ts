/**
 * Analysis State Machine
 * Manages the lifecycle of an analysis session
 */

import type { AgentResult, AnalysisAgentResult } from "../types";
import type { ScoredFinding } from "@/scoring/types";
import { messageBus } from "./message-bus";
import { createMessage } from "./message-types";

// ============================================================================
// STATE TYPES
// ============================================================================

export type AnalysisState =
  | "IDLE"
  | "INITIALIZING"
  | "EXTRACTING"
  | "GATHERING"
  | "ANALYZING"
  | "DEBATING"
  | "REFLECTING"
  | "SYNTHESIZING"
  | "COMPLETED"
  | "FAILED";

export interface StateTransition {
  from: AnalysisState;
  to: AnalysisState;
  trigger: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AnalysisCheckpoint {
  id: string;
  state: AnalysisState;
  timestamp: Date;
  completedAgents: string[];
  pendingAgents: string[];
  findings: ScoredFinding[];
  results: Record<string, AnalysisAgentResult>;
  errors: { agent: string; error: string }[];
}

export interface StateMachineConfig {
  analysisId: string;
  dealId: string;
  mode: string;
  agents: string[];
  enableCheckpointing: boolean;
  checkpointInterval: number; // ms
  maxRetries: number;
  stateTimeouts: Partial<Record<AnalysisState, number>>;
}

// ============================================================================
// STATE MACHINE IMPLEMENTATION
// ============================================================================

export class AnalysisStateMachine {
  private state: AnalysisState = "IDLE";
  private config: StateMachineConfig;
  private transitions: StateTransition[] = [];
  private checkpoints: AnalysisCheckpoint[] = [];

  // Agent tracking
  private completedAgents: Set<string> = new Set();
  private pendingAgents: Set<string> = new Set();
  private failedAgents: Map<string, { error: string; retries: number }> = new Map();

  // Results
  private findings: ScoredFinding[] = [];
  private results: Map<string, AnalysisAgentResult> = new Map();

  // Timing
  private startTime: Date | null = null;
  private stateStartTime: Date | null = null;
  private checkpointTimer: NodeJS.Timeout | null = null;

  // Callbacks
  private onStateChangeCallbacks: ((
    from: AnalysisState,
    to: AnalysisState,
    trigger: string
  ) => void)[] = [];
  private onCompleteCallback: ((results: Record<string, AnalysisAgentResult>) => void) | null =
    null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  constructor(config: Partial<StateMachineConfig> & { analysisId: string; dealId: string }) {
    this.config = {
      mode: "full_analysis",
      agents: [],
      enableCheckpointing: true,
      checkpointInterval: 30000, // 30 seconds
      maxRetries: 2,
      stateTimeouts: {
        EXTRACTING: 60000,
        GATHERING: 120000,
        ANALYZING: 180000,
        DEBATING: 120000,
        REFLECTING: 60000,
        SYNTHESIZING: 60000,
      },
      ...config,
    };

    this.pendingAgents = new Set(this.config.agents);
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /**
   * Get current state
   */
  getState(): AnalysisState {
    return this.state;
  }

  /**
   * Get all transitions
   */
  getTransitions(): StateTransition[] {
    return [...this.transitions];
  }

  /**
   * Get current progress
   */
  getProgress(): {
    state: AnalysisState;
    completedAgents: number;
    totalAgents: number;
    percentage: number;
  } {
    const total = this.config.agents.length;
    const completed = this.completedAgents.size;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      state: this.state,
      completedAgents: completed,
      totalAgents: total,
      percentage,
    };
  }

  /**
   * Transition to a new state
   */
  private async transition(
    to: AnalysisState,
    trigger: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const from = this.state;

    // Validate transition
    if (!this.isValidTransition(from, to)) {
      throw new Error(`Invalid state transition: ${from} -> ${to}`);
    }

    // Record transition
    const transition: StateTransition = {
      from,
      to,
      trigger,
      timestamp: new Date(),
      metadata,
    };
    this.transitions.push(transition);

    // Update state
    this.state = to;
    this.stateStartTime = new Date();

    // Publish state change message
    await messageBus.publish(
      createMessage({
        type: "state_change",
        topic: "general",
        priority: "high",
        from: "orchestrator",
        to: "*",
        subject: `Analysis state changed to ${to}`,
        payload: {
          type: "state_change",
          previousState: from,
          newState: to,
          reason: trigger,
          metadata,
        },
      })
    );

    // Call callbacks
    for (const callback of this.onStateChangeCallbacks) {
      callback(from, to, trigger);
    }

    // Create checkpoint if enabled
    if (this.config.enableCheckpointing) {
      this.createCheckpoint();
    }
  }

  /**
   * Check if a transition is valid
   */
  private isValidTransition(from: AnalysisState, to: AnalysisState): boolean {
    const validTransitions: Record<AnalysisState, AnalysisState[]> = {
      IDLE: ["INITIALIZING"],
      INITIALIZING: ["EXTRACTING", "GATHERING", "FAILED"],
      EXTRACTING: ["GATHERING", "FAILED"],
      GATHERING: ["ANALYZING", "FAILED"],
      ANALYZING: ["DEBATING", "REFLECTING", "SYNTHESIZING", "FAILED"],
      DEBATING: ["REFLECTING", "ANALYZING", "FAILED"],
      REFLECTING: ["ANALYZING", "SYNTHESIZING", "FAILED"],
      SYNTHESIZING: ["COMPLETED", "FAILED"],
      COMPLETED: ["IDLE"],
      FAILED: ["IDLE"],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Start the analysis
   */
  async start(): Promise<void> {
    if (this.state !== "IDLE") {
      throw new Error(`Cannot start analysis from state: ${this.state}`);
    }

    this.startTime = new Date();
    await this.transition("INITIALIZING", "analysis_started");

    // Start checkpoint timer if enabled
    if (this.config.enableCheckpointing) {
      this.checkpointTimer = setInterval(
        () => this.createCheckpoint(),
        this.config.checkpointInterval
      );
    }
  }

  /**
   * Move to extraction phase
   */
  async startExtraction(): Promise<void> {
    await this.transition("EXTRACTING", "extraction_started");
  }

  /**
   * Move to gathering phase (parallel agent execution)
   */
  async startGathering(): Promise<void> {
    await this.transition("GATHERING", "gathering_started");
  }

  /**
   * Move to analysis phase
   */
  async startAnalysis(): Promise<void> {
    await this.transition("ANALYZING", "analysis_started");
  }

  /**
   * Move to debate phase
   */
  async startDebate(): Promise<void> {
    await this.transition("DEBATING", "debate_started");
  }

  /**
   * Move to reflection phase
   */
  async startReflection(): Promise<void> {
    await this.transition("REFLECTING", "reflection_started");
  }

  /**
   * Move to synthesis phase
   */
  async startSynthesis(): Promise<void> {
    await this.transition("SYNTHESIZING", "synthesis_started");
  }

  /**
   * Complete the analysis
   */
  async complete(): Promise<void> {
    await this.transition("COMPLETED", "analysis_completed", {
      totalTime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      completedAgents: Array.from(this.completedAgents),
      failedAgents: Array.from(this.failedAgents.keys()),
    });

    // Stop checkpoint timer
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
    }

    // Call completion callback
    if (this.onCompleteCallback) {
      this.onCompleteCallback(Object.fromEntries(this.results));
    }
  }

  /**
   * Mark analysis as failed
   */
  async fail(error: Error): Promise<void> {
    await this.transition("FAILED", "analysis_failed", {
      error: error.message,
    });

    // Stop checkpoint timer
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
    }

    // Call error callback
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }

  /**
   * Reset to idle
   */
  async reset(): Promise<void> {
    if (this.state === "COMPLETED" || this.state === "FAILED") {
      this.state = "IDLE";
      this.transitions = [];
      this.checkpoints = [];
      this.completedAgents.clear();
      this.pendingAgents = new Set(this.config.agents);
      this.failedAgents.clear();
      this.findings = [];
      this.results.clear();
      this.startTime = null;
      this.stateStartTime = null;

      if (this.checkpointTimer) {
        clearInterval(this.checkpointTimer);
      }
    }
  }

  // ============================================================================
  // AGENT TRACKING
  // ============================================================================

  /**
   * Record agent completion
   */
  recordAgentComplete(agentName: string, result: AnalysisAgentResult): void {
    this.pendingAgents.delete(agentName);
    this.completedAgents.add(agentName);
    this.results.set(agentName, result);

    // Extract findings if result has _react data
    const resultWithReact = result as AnalysisAgentResult & {
      _react?: { findings?: ScoredFinding[] };
    };
    if (resultWithReact._react?.findings) {
      this.findings.push(...resultWithReact._react.findings);
    }
  }

  /**
   * Record agent failure
   */
  recordAgentFailed(agentName: string, error: string): boolean {
    const existing = this.failedAgents.get(agentName) ?? { error: "", retries: 0 };

    if (existing.retries >= this.config.maxRetries) {
      // Max retries reached, mark as permanently failed
      this.pendingAgents.delete(agentName);
      this.failedAgents.set(agentName, { error, retries: existing.retries + 1 });
      return false; // No more retries
    }

    // Increment retry count
    this.failedAgents.set(agentName, { error, retries: existing.retries + 1 });
    return true; // Can retry
  }

  /**
   * Check if all agents are complete
   */
  areAllAgentsComplete(): boolean {
    return this.pendingAgents.size === 0;
  }

  /**
   * Get pending agent names
   */
  getPendingAgents(): string[] {
    return Array.from(this.pendingAgents);
  }

  /**
   * Get failed agent names
   */
  getFailedAgents(): { name: string; error: string; retries: number }[] {
    return Array.from(this.failedAgents.entries()).map(([name, info]) => ({
      name,
      ...info,
    }));
  }

  // ============================================================================
  // CHECKPOINTING
  // ============================================================================

  /**
   * Create a checkpoint
   */
  private createCheckpoint(): void {
    const checkpoint: AnalysisCheckpoint = {
      id: crypto.randomUUID(),
      state: this.state,
      timestamp: new Date(),
      completedAgents: Array.from(this.completedAgents),
      pendingAgents: Array.from(this.pendingAgents),
      findings: [...this.findings],
      results: Object.fromEntries(this.results),
      errors: this.getFailedAgents().map((f) => ({ agent: f.name, error: f.error })),
    };

    this.checkpoints.push(checkpoint);

    // Keep only last 10 checkpoints
    if (this.checkpoints.length > 10) {
      this.checkpoints = this.checkpoints.slice(-10);
    }
  }

  /**
   * Get latest checkpoint
   */
  getLatestCheckpoint(): AnalysisCheckpoint | null {
    return this.checkpoints[this.checkpoints.length - 1] ?? null;
  }

  /**
   * Restore from checkpoint
   */
  restoreFromCheckpoint(checkpoint: AnalysisCheckpoint): void {
    this.state = checkpoint.state;
    this.completedAgents = new Set(checkpoint.completedAgents);
    this.pendingAgents = new Set(checkpoint.pendingAgents);
    this.findings = [...checkpoint.findings];
    this.results = new Map(Object.entries(checkpoint.results));

    for (const err of checkpoint.errors) {
      this.failedAgents.set(err.agent, { error: err.error, retries: 1 });
    }
  }

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  /**
   * Register state change callback
   */
  onStateChange(
    callback: (from: AnalysisState, to: AnalysisState, trigger: string) => void
  ): void {
    this.onStateChangeCallbacks.push(callback);
  }

  /**
   * Register completion callback
   */
  onComplete(callback: (results: Record<string, AnalysisAgentResult>) => void): void {
    this.onCompleteCallback = callback;
  }

  /**
   * Register error callback
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  // ============================================================================
  // RESULTS
  // ============================================================================

  /**
   * Get all findings
   */
  getFindings(): ScoredFinding[] {
    return [...this.findings];
  }

  /**
   * Get all results
   */
  getResults(): Record<string, AnalysisAgentResult> {
    return Object.fromEntries(this.results);
  }

  /**
   * Get execution summary
   */
  getSummary(): {
    analysisId: string;
    dealId: string;
    state: AnalysisState;
    totalTime: number;
    completedAgents: number;
    failedAgents: number;
    totalFindings: number;
    transitions: number;
  } {
    return {
      analysisId: this.config.analysisId,
      dealId: this.config.dealId,
      state: this.state,
      totalTime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      completedAgents: this.completedAgents.size,
      failedAgents: this.failedAgents.size,
      totalFindings: this.findings.length,
      transitions: this.transitions.length,
    };
  }
}
