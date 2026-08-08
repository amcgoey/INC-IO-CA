# 0021-declarative-row-position-calculator-and-dynamic-identity-strategy.md

Decouple `RowPositionCalculator.ts` from hardcoded discipline checks by enforcing pure function key injection (`RowKeyFn`), defining a universal 3-tier identity cascade contract (`IdentityGroup`, `IdentityRevisionGroup`, `Identity`), and standardizing on pure in-memory JavaScript key calculation for zero API call overhead and 100% spreadsheet formula resilience.

## Context & Decision

To support arbitrary `DocumentType` log sheets (Submittal Arch, Submittal FF&E, RFI, ASI, Change Order) without hardcoded discipline branching or spreadsheet formula dependencies:

1. **Pure Function Key Injection & Decoupled `RowPositionCalculator`**:
   - Hardcoded `discipline === "Architecture"` and `"FF&E"` string checks are removed from `RowPositionCalculator.ts`.
   - `computeRowInsertionPlan()` requires explicit `groupKeyFn: RowKeyFn` (`(row, headers) => string`) and `sortKeyFn: RowKeyFn` parameters provided by `DocumentLogStrategy` or `DocumentTypeConfig`.
   - `RowPositionCalculator.ts` is strictly Tier 1 pure matrix positioning math.

2. **Universal 3-Tier Identity Cascade Contract**:
   - **`IdentityGroup`**: The normalized string key used to cluster related document entries in the log tab for sheet formatting and blank row gap separation (`insertBlankBefore`, `insertBlankAfter`). e.g., `[CSI Section]-[Number]` for Arch Submittals, `[Spec Tag]` for FF&E, or `[RFI Number]` for RFIs.
   - **`IdentityRevisionGroup`**: `[IdentityGroup]-[Revision]`, used to group document revisions for contact history concatenation.
   - **`Identity`**: `[IdentityRevisionGroup]-[Date]`, uniquely identifies a specific document submission/revision instance and acts as the primary sort key.

3. **Pure Dynamic In-Memory JS Calculation**:
   - `IdentityGroup` and `Identity` keys are calculated in-memory in JavaScript during 2D matrix iteration (<1 ms execution time).
   - Eliminates reliance on spreadsheet formula columns (`Calc Group` / `Calc Sort`), ensuring `RowPositionCalculator` remains 100% resilient even if users cause `#REF!` spill collisions in sheet formulas.
   - Makes **0 additional Google Sheets API calls** (operates on the 2D array matrix already loaded into memory by `getValues()`).

## Consequences

- `RowPositionCalculator.ts` becomes fully domain-agnostic and reusable across any future document type.
- Zero risk of spreadsheet formula errors (`#REF!`) corrupting row placement math.
- Complete compatibility with multi-project 2-tier `DocumentTypeConfig` architecture.
