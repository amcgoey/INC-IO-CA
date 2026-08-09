import { describe, it } from "node:test";
import assert from "node:assert";
import { GasTimeoutBudget } from "../src/core/log/GasTimeoutBudget.ts";

describe("GasTimeoutBudget", () => {
  it("initializes with default 270-second (270000ms) limit", () => {
    const budget = new GasTimeoutBudget();
    assert.strictEqual(budget.getLimitMs(), 270000);
    assert.strictEqual(budget.hasTimedOut(), false);
  });

  it("accepts custom quota limit and soft cutoff threshold", () => {
    const budget = new GasTimeoutBudget(300000, 5000);
    assert.strictEqual(budget.getLimitMs(), 300000);
    assert.strictEqual(budget.getSoftCutoffThresholdMs(), 5000);
  });

  it("evaluates timeout state based on start time injection or elapsed time", () => {
    let mockNow = 1000;
    const timeProvider = () => mockNow;
    const budget = new GasTimeoutBudget(270000, 10000, timeProvider);
    
    budget.start();
    assert.strictEqual(budget.getElapsedTimeMs(), 0);
    assert.strictEqual(budget.getRemainingTimeMs(), 270000);
    assert.strictEqual(budget.hasTimedOut(), false);

    // Fast forward 261,000 ms -> 9,000 ms remaining (less than 10,000ms threshold)
    mockNow = 1000 + 261000;
    assert.strictEqual(budget.getElapsedTimeMs(), 261000);
    assert.strictEqual(budget.getRemainingTimeMs(), 9000);
    assert.strictEqual(budget.hasTimedOut(), true);
  });

  it("checkBudget returns true when within quota and false when soft cutoff exceeded", () => {
    let mockNow = 0;
    const timeProvider = () => mockNow;
    const budget = new GasTimeoutBudget(1000, 200, timeProvider);
    budget.start();

    // Elapsed 500ms -> Remaining 500ms > 200ms -> OK
    mockNow = 500;
    assert.strictEqual(budget.checkBudget(), true);

    // Elapsed 850ms -> Remaining 150ms < 200ms -> Timed out
    mockNow = 850;
    assert.strictEqual(budget.checkBudget(), false);
  });
});
