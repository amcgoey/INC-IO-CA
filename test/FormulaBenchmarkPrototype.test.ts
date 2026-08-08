/**
 * @file FormulaBenchmarkPrototype.test.ts
 * @description Unit tests verifying formula benchmark calculation logic and report generation for Issue #123 prototype.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { runFormulaBenchmark, benchmarkPerRowCopyDown, benchmarkTopLevelMapLambda, benchmarkTopLevelArrayFormula } from "../src/prototypes/formula-benchmark";

describe("Formula Benchmark Prototype Logic (Issue #123)", () => {
  it("calculates payload size accurately for 1,000 rows x 4 columns", () => {
    const perRow = benchmarkPerRowCopyDown(1000, 4);
    const mapLambda = benchmarkTopLevelMapLambda(1000, 4);

    assert.strictEqual(perRow.dependencyNodes, 4000);
    assert.strictEqual(mapLambda.dependencyNodes, 4);
    assert.ok(mapLambda.payloadSizeBytes < perRow.payloadSizeBytes);
    assert.strictEqual(mapLambda.gasWriteOperations, 1);
  });

  it("runFormulaBenchmark returns a complete report with recommended strategy and tradeoffs", () => {
    const report = runFormulaBenchmark(1000, 4);

    assert.ok(report.perRowCopyDown);
    assert.ok(report.topLevelArrayFormula);
    assert.ok(report.topLevelMapLambda);
    assert.strictEqual(report.verdict.recommendedStrategy, "100% MAP/LAMBDA in FormulaRow");
    assert.ok(report.verdict.rationale.length >= 4);
    assert.ok(report.verdict.keyTradeoffs.length >= 4);
  });

  it("top-level MAP/LAMBDA supports complex lookups whereas raw ARRAYFORMULA limits them", () => {
    const arrayFormula = benchmarkTopLevelArrayFormula(1000, 4);
    const mapLambda = benchmarkTopLevelMapLambda(1000, 4);

    assert.strictEqual(arrayFormula.supportsComplexLookups, false);
    assert.strictEqual(mapLambda.supportsComplexLookups, true);
  });
});
