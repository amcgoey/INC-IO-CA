/**
 * @file GasTimeoutBudget.ts
 * @description Tier 1 Pure Core domain quota timekeeper evaluating execution time against a soft cutoff limit (default 270s / 270,000ms).
 */

export class GasTimeoutBudget {
  private limitMs: number;
  private softCutoffThresholdMs: number;
  private startTimeMs: number;
  private timeProvider: () => number;

  constructor(
    limitMs: number = 270000,
    softCutoffThresholdMs: number = 10000,
    timeProvider: () => number = () => Date.now()
  ) {
    this.limitMs = limitMs;
    this.softCutoffThresholdMs = softCutoffThresholdMs;
    this.timeProvider = timeProvider;
    this.startTimeMs = this.timeProvider();
  }

  public start(): void {
    this.startTimeMs = this.timeProvider();
  }

  public getLimitMs(): number {
    return this.limitMs;
  }

  public getSoftCutoffThresholdMs(): number {
    return this.softCutoffThresholdMs;
  }

  public getElapsedTimeMs(): number {
    return this.timeProvider() - this.startTimeMs;
  }

  public getRemainingTimeMs(): number {
    return Math.max(0, this.limitMs - this.getElapsedTimeMs());
  }

  public hasTimedOut(): boolean {
    return this.getRemainingTimeMs() <= this.softCutoffThresholdMs;
  }

  public checkBudget(): boolean {
    return !this.hasTimedOut();
  }
}

declare let module: { exports?: unknown };

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GasTimeoutBudget
  };
}

(globalThis as any).GasTimeoutBudget = GasTimeoutBudget;
