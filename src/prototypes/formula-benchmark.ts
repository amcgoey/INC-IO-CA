/**
 * @file formula-benchmark.ts
 * @description Pure benchmark engine and simulator comparing top-level ARRAYFORMULA / MAP-LAMBDA vs Per-Row Formula Copy-Down across 1,000+ data rows.
 *
 * Prototype for Issue #123.
 */

export interface BenchmarkMetrics {
  scenario: string;
  rowCount: number;
  calculatedColumns: number;
  payloadSizeBytes: number;
  dependencyNodes: number;
  gasWriteOperations: number;
  rowInsertionOverheadMs: number;
  recalcLatencyEstimateMs: number;
  spillCollisionRisk: 'HIGH' | 'NONE';
  supportsComplexLookups: boolean;
  getLastRowImpact: 'EXPANDS_TO_SHEET_MAX' | 'EXACT_DATA_ROWS';
}

export interface ComparisonReport {
  perRowCopyDown: BenchmarkMetrics;
  topLevelArrayFormula: BenchmarkMetrics;
  topLevelMapLambda: BenchmarkMetrics;
  verdict: {
    recommendedStrategy: string;
    rationale: string[];
    keyTradeoffs: Array<{ factor: string; perRow: string; mapLambda: string }>;
  };
}

/**
 * Calculates simulated benchmark metrics for Per-Row Formula Copy-Down.
 */
export function benchmarkPerRowCopyDown(rowCount: number, calculatedColumns: number): BenchmarkMetrics {
  const avgFormulaLen = 65; // e.g. =IF(ISBLANK(A4), "", CONCATENATE(B4, "_", C4, "_", D4))
  const totalFormulas = rowCount * calculatedColumns;
  const payloadSizeBytes = totalFormulas * avgFormulaLen;
  
  // Inserting a row in a 1,000 row sheet requires setFormulas or copyTo for the new row + shifting
  const rowInsertionOverheadMs = Number((0.45 * (rowCount / 1000)).toFixed(2));
  const recalcLatencyEstimateMs = Number((120 + (rowCount * 0.18)).toFixed(2));

  return {
    scenario: 'Per-Row Formula Copy-Down',
    rowCount,
    calculatedColumns,
    payloadSizeBytes,
    dependencyNodes: totalFormulas,
    gasWriteOperations: rowCount, // 1 write call per row or batched range write
    rowInsertionOverheadMs,
    recalcLatencyEstimateMs,
    spillCollisionRisk: 'NONE',
    supportsComplexLookups: true,
    getLastRowImpact: 'EXACT_DATA_ROWS',
  };
}

/**
 * Calculates simulated benchmark metrics for Top-Level ARRAYFORMULA in FormulaRow.
 */
export function benchmarkTopLevelArrayFormula(rowCount: number, calculatedColumns: number): BenchmarkMetrics {
  const avgFormulaLen = 95; // e.g. =ARRAYFORMULA(IF(ISBLANK(A4:A), "", B4:B & "_" & C4:C & "_" & D4:D))
  const totalFormulas = calculatedColumns; // Only 1 formula per calculated column in FormulaRow (Row 2)
  const payloadSizeBytes = totalFormulas * avgFormulaLen;
  
  // Zero row insertion overhead because formula resides in Row 2 and auto-spills
  const rowInsertionOverheadMs = 0.01;
  const recalcLatencyEstimateMs = Number((25 + (rowCount * 0.04)).toFixed(2));

  return {
    scenario: 'Top-Level ARRAYFORMULA (FormulaRow)',
    rowCount,
    calculatedColumns,
    payloadSizeBytes,
    dependencyNodes: totalFormulas,
    gasWriteOperations: 1, // Single write to FormulaRow
    rowInsertionOverheadMs,
    recalcLatencyEstimateMs,
    spillCollisionRisk: 'HIGH', // User manual edit anywhere in spill column triggers #REF!
    supportsComplexLookups: false, // Fails/limits on multi-criteria XLOOKUP or row-level string transforms
    getLastRowImpact: 'EXPANDS_TO_SHEET_MAX',
  };
}

/**
 * Calculates simulated benchmark metrics for Top-Level MAP / LAMBDA in FormulaRow.
 */
export function benchmarkTopLevelMapLambda(rowCount: number, calculatedColumns: number): BenchmarkMetrics {
  const avgFormulaLen = 145; // e.g. =MAP(A4:A, B4:B, C4:C, D4:D, LAMBDA(a,b,c,d, IF(ISBLANK(a), "", b & "_" & c & "_" & d)))
  const totalFormulas = calculatedColumns; // Only 1 formula per calculated column in FormulaRow (Row 2)
  const payloadSizeBytes = totalFormulas * avgFormulaLen;
  
  // Zero row insertion overhead
  const rowInsertionOverheadMs = 0.01;
  const recalcLatencyEstimateMs = Number((35 + (rowCount * 0.05)).toFixed(2));

  return {
    scenario: 'Top-Level MAP / LAMBDA (FormulaRow)',
    rowCount,
    calculatedColumns,
    payloadSizeBytes,
    dependencyNodes: totalFormulas,
    gasWriteOperations: 1,
    rowInsertionOverheadMs,
    recalcLatencyEstimateMs,
    spillCollisionRisk: 'HIGH', // User manual edit anywhere in spill column triggers #REF!
    supportsComplexLookups: true, // Native support for row-level iteration and XLOOKUP
    getLastRowImpact: 'EXPANDS_TO_SHEET_MAX',
  };
}

/**
 * Executes full comparison benchmark across all three strategies.
 */
export function runFormulaBenchmark(rowCount = 1000, calculatedColumns = 4): ComparisonReport {
  const perRow = benchmarkPerRowCopyDown(rowCount, calculatedColumns);
  const arrayFormula = benchmarkTopLevelArrayFormula(rowCount, calculatedColumns);
  const mapLambda = benchmarkTopLevelMapLambda(rowCount, calculatedColumns);

  const payloadReductionPct = ((1 - (mapLambda.payloadSizeBytes / perRow.payloadSizeBytes)) * 100).toFixed(2);
  const speedupFactor = (perRow.recalcLatencyEstimateMs / mapLambda.recalcLatencyEstimateMs).toFixed(1);

  return {
    perRowCopyDown: perRow,
    topLevelArrayFormula: arrayFormula,
    topLevelMapLambda: mapLambda,
    verdict: {
      recommendedStrategy: '100% MAP/LAMBDA in FormulaRow',
      rationale: [
        `MAP/LAMBDA in FormulaRow reduces API payload size by ${payloadReductionPct}% (${mapLambda.payloadSizeBytes} bytes vs ${perRow.payloadSizeBytes} bytes for 1,000 rows).`,
        `Recalculation speedup is estimated at ~${speedupFactor}x faster due to reducing dependency graph nodes from ${perRow.dependencyNodes} to ${mapLambda.dependencyNodes}.`,
        `Row insertion (via computeRowInsertionPlan) requires 0 formula re-copying operations when using MAP/LAMBDA because dynamic spill automatically expands into newly inserted rows.`,
        `CRITICAL SPILL RISK: Any manual user edit in a calculated column will cause top-level MAP/LAMBDA to fail with a #REF! spill error. Therefore, MAP/LAMBDA requires soft/hard range protection on calculated columns.`,
        `Sheet.getLastRow() expands to the maximum sheet row when unbounded array formulas (A4:A) are used. RowPositionCalculator.getBoundedData() safely handles this by inspecting cell values rather than relying on native getLastRow().`
      ],
      keyTradeoffs: [
        {
          factor: 'Payload Size (1,000 Rows x 4 Cols)',
          perRow: `${(perRow.payloadSizeBytes / 1024).toFixed(1)} KB`,
          mapLambda: `${mapLambda.payloadSizeBytes} Bytes (${payloadReductionPct}% smaller)`
        },
        {
          factor: 'Dependency Graph Nodes',
          perRow: `${perRow.dependencyNodes} nodes`,
          mapLambda: `${mapLambda.dependencyNodes} nodes`
        },
        {
          factor: 'Row Insertion Script Overhead',
          perRow: `${perRow.rowInsertionOverheadMs} ms (must copy formulas to new row)`,
          mapLambda: `0.01 ms (auto-expands into new row)`
        },
        {
          factor: 'Manual Cell Edit Resilience',
          perRow: 'HIGH (only edited cell loses formula)',
          mapLambda: 'LOW (#REF! spill collision error breaks entire column)'
        },
        {
          factor: 'Complex Lookups (XLOOKUP / MAP)',
          perRow: 'Supported',
          mapLambda: 'Supported (via MAP/LAMBDA, unsupported in raw ARRAYFORMULA)'
        }
      ]
    }
  };
}
