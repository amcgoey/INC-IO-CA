/**
 * @file prototype-formula-benchmark.ts
 * @description Executable CLI runner for Issue #123 formula benchmark prototype comparing ARRAYFORMULA / MAP-LAMBDA vs Per-Row Formula Copy-Down.
 */

import { runFormulaBenchmark } from "../src/prototypes/formula-benchmark";

function main() {
  console.log("============================================================================");
  console.log("  PROTOTYPE BENCHMARK RUNNER — Issue #123");
  console.log("  ARRAYFORMULA / MAP-LAMBDA vs Per-Row Formula Copy-Down (1,000+ Data Rows)");
  console.log("============================================================================");
  console.log("");
  console.log("QUESTION: Does placing top-level ARRAYFORMULA or MAP/LAMBDA expressions in");
  console.log("FormulaRow outperform copying formulas down per row in sheets with 1,000+ data rows?");
  console.log("");

  const sizes = [1000, 5000, 10000];

  for (const rowCount of sizes) {
    const report = runFormulaBenchmark(rowCount, 4);
    console.log(`--- BENCHMARK RESULTS FOR ${rowCount.toLocaleString()} DATA ROWS (4 Calculated Columns) ---`);
    console.table([
      {
        "Strategy": report.perRowCopyDown.scenario,
        "Payload (Bytes)": report.perRowCopyDown.payloadSizeBytes,
        "Graph Nodes": report.perRowCopyDown.dependencyNodes,
        "Insert Overhead (ms)": report.perRowCopyDown.rowInsertionOverheadMs,
        "Recalc Latency (ms)": report.perRowCopyDown.recalcLatencyEstimateMs,
        "Spill Risk": report.perRowCopyDown.spillCollisionRisk,
        "Complex Lookups": report.perRowCopyDown.supportsComplexLookups
      },
      {
        "Strategy": report.topLevelArrayFormula.scenario,
        "Payload (Bytes)": report.topLevelArrayFormula.payloadSizeBytes,
        "Graph Nodes": report.topLevelArrayFormula.dependencyNodes,
        "Insert Overhead (ms)": report.topLevelArrayFormula.rowInsertionOverheadMs,
        "Recalc Latency (ms)": report.topLevelArrayFormula.recalcLatencyEstimateMs,
        "Spill Risk": report.topLevelArrayFormula.spillCollisionRisk,
        "Complex Lookups": report.topLevelArrayFormula.supportsComplexLookups
      },
      {
        "Strategy": report.topLevelMapLambda.scenario,
        "Payload (Bytes)": report.topLevelMapLambda.payloadSizeBytes,
        "Graph Nodes": report.topLevelMapLambda.dependencyNodes,
        "Insert Overhead (ms)": report.topLevelMapLambda.rowInsertionOverheadMs,
        "Recalc Latency (ms)": report.topLevelMapLambda.recalcLatencyEstimateMs,
        "Spill Risk": report.topLevelMapLambda.spillCollisionRisk,
        "Complex Lookups": report.topLevelMapLambda.supportsComplexLookups
      }
    ]);
    console.log("");
  }

  const finalReport = runFormulaBenchmark(1000, 4);

  console.log("============================================================================");
  console.log("  VERDICT & RECOMMENDATIONS");
  console.log("============================================================================");
  console.log(`RECOMMENDED STRATEGY: ${finalReport.verdict.recommendedStrategy}`);
  console.log("");
  console.log("RATIONALE:");
  finalReport.verdict.rationale.forEach((point, i) => {
    console.log(`  ${i + 1}. ${point}`);
  });
  console.log("");
  console.log("KEY TRADEOFF MATRIX:");
  console.table(finalReport.verdict.keyTradeoffs);
  console.log("============================================================================");
}

main();
