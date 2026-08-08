# 0022-dual-tier-named-range-taxonomy-and-hardened-log-boundaries.md

Establish a Dual-Tier Named Range Scoping Taxonomy, 2-row `Headers` Named Range structure, protected `BufferRow`-anchored `Data` Named Ranges for automatic row insertion expansion, and hardened `LogEngine` sparse blank row tolerance.

## Context & Decision

To enable seamless log tab duplication for new document types, eliminate hardcoded row indices, and protect log reading and insertion against sparse blank rows and formula corruption:

1. **Dual-Tier Named Range Scoping Taxonomy**:
   - **Sheet-Scoped Generic Ranges** (`Headers`, `FormulaRow`, `Data`, `Vendors`, `SpecTags`): Defined with sheet scope on individual log tabs and support tabs. Allows log tabs to be duplicated or cloned for new document types without range renaming overhead or namespace collisions.
   - **Workbook-Scoped Specific Ranges** (`MANIFEST_SCHEMA_VERSION`, `Config_Manifest`, `Config_<DocTypeKey>`, `Shared_Contacts_<Discipline>`, `Actions_<DocType>`): Defined with global workbook scope on consolidated tabs (`_Config`, `_Shared`) housing multiple tables.

2. **2-Row `Headers` Named Range Structure & Dynamic Resolution**:
   - The sheet-scoped `Headers` Named Range spans exactly 2 rows: Row 1 (`Header Row` $H$) and Row 2 (`FormulaRow` $H+1$).
   - `LogEngine.readLog()` and `appendDocument()` use Row 1 of `Headers` as the primary mechanism to resolve header column names, falling back to a top 5-row scan if the Named Range is not registered.

3. **Protected `BufferRow`-Anchored `Data` Named Range & Automatic Expansion**:
   - The sheet-scoped `Data` Named Range encloses active data rows, anchored at the top by a protected `BufferRow` (below `FormulaRow`) and at the bottom by a protected bottom `BufferRow`.
   - All row insertions executed by `LogEngine.appendDocument()` occur strictly **between** the top and bottom buffer rows. Native Google Sheets row insertions automatically expand the `Data` Named Range boundaries without requiring explicit API range resize operations.

4. **Hardened Boundary & Sparse Blank Row Tolerance in `LogEngine`**:
   - `getBoundedData()` reads data within the `Data` range boundaries.
   - Internal blank rows (1–2 empty spacer rows between submittal groups) are recognized as valid structural spacers.
   - In fallback scanning mode, `getBoundedData()` tolerates up to $K=5$ consecutive blank rows (or encounters the bottom protected `BufferRow` / footer boundary), preventing premature log truncation while avoiding infinite iteration across empty grid rows.

## Consequences

- Log tabs can be duplicated directly in Google Sheets to instantiate new document types without breaking or renaming range references.
- Dynamic header resolution eliminates hardcoded row offset assumptions across all log operations.
- `Data` range boundaries remain 100% self-healing and expand automatically upon row insertion.
- `LogEngine` reads complete log histories without premature truncation from sparse blank rows.
