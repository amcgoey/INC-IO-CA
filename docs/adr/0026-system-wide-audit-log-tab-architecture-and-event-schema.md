# 0026-system-wide-audit-log-tab-architecture-and-event-schema.md

Establish dedicated system-wide administrative tab (`_AuditLog`), standardized 6-column event schema (`Category`, `Timestamp`, `EventType`, `Actor`, `Status`, `Details`), and cell-budget retention policy.

## Context & Decision

As the application architecture expands across multiple system domains (Log Migration, Template Drift Audit, Multi-Project Cache Flushing, Document Workflows, and Workspace Add-on Admin Actions), recording execution telemetry and diagnostic audit trails in `_Config` or transient cloud logs creates storage pollution or visibility loss. To establish a unified, structured audit logging framework inside `DocumentLogWorkbook`:

1. **Dedicated System Administrative Tab (`_AuditLog`)**:
   - All system telemetry, administrative events, and execution reports are recorded in a dedicated, system-managed administrative tab named `_AuditLog`.
   - `_AuditLog` is placed alongside `_Config` and `_Shared` as a system tab, keeping configuration settings and telemetry strictly separated.

2. **Standardized 6-Column Event Schema with `Category` Indexing**:
   - Every audit log entry follows a strict 6-column tabular layout:
     1. **`Timestamp`**: ISO 8601 UTC timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`).
     2. **`Category`**: System feature domain for rapid filtering (`MIGRATION`, `SCHEMA_DRIFT`, `CACHE_PURGE`, `WORKFLOW_EXECUTION`, `ADMIN_ACTION`).
     3. **`EventType`**: Specific event key (e.g. `MIGRATION_COMMITTED`, `MIGRATION_ROLLED_BACK`, `DRIFT_AUDIT_MATCH`, `CACHE_INVALIDATED`).
     4. **`Actor`**: User email or execution context (`user@company.com`, `@system`, or `GoogleAppsScript`).
     5. **`Status`**: Execution outcome status (`SUCCESS` | `WARNING` | `FAILED` | `ROLLED_BACK`).
     6. **`Details`**: JSON string payload containing detailed metrics, remapped column counts, `MigrationAuditReport` summaries, or error stack traces.

3. **Append-Only Write Strategy & Retention Boundary Policy**:
   - Log entries are written in append-only batch operations to minimize API request overhead.
   - To respect the 1M workbook cell limit and 800k soft alert ceiling (ADR 0022), `_AuditLog` enforces a max capacity threshold (e.g., 5,000 log rows), automatically truncating the oldest log entries when capacity is reached.

## Consequences

- Telemetry across all system engines (Migration, Drift, Caching, Workflows) is centralized in a single queryable tab.
- The `Category` column allows developers and administrators to quickly filter logs by system domain in Google Sheets.
- `_Config` remains clean and strictly dedicated to environment configuration parameters.
