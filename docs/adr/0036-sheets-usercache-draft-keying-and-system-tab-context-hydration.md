# 0036-sheets-usercache-draft-keying-and-system-tab-context-hydration.md

Establish `SheetsUserCacheDraftKey` tab-scoped keying, polymorphic context keying in `CardDraftStateManager`, and `SystemTabContextBinding` for `AppContext.GoogleSheets`.

## Context & Decision

When running the Google Workspace Add-on inside Google Sheets (`AppContext.GoogleSheets`), card state and sidebar hydration must behave predictably across log tabs (e.g. `Submittal Arch`, `Submittal FFE`) and non-log system tabs (`_Config`, `_AuditLog`, `Documentation`, `User Created`). Form draft state stored in `CacheService.getUserCache()` must be isolated per tab to prevent key collisions, draft overwrites, or cross-tab state leakage when switching tabs in multi-log workbooks.

To govern `UserCache` draft state management and hydration behavior in Google Sheets context:

1. **Tab-Scoped `SheetsUserCacheDraftKey` Schema & 100KB Size Guard**:
   - `UserCache` draft keys in `AppContext.GoogleSheets` are deterministically formatted as `CARD_DRAFT_V1_SHEETS_<SpreadsheetId>_<TabName>` (e.g. `CARD_DRAFT_V1_SHEETS_1a2b3c_SubmittalArch`).
   - Tab names are sanitized using `encodeURIComponent()` to strip spaces and invalid key characters.
   - **UserCache 100KB Size Limit Guard**: Prior to executing `UserCache.put()`, `CardDraftStateManager` checks payload byte length. If the serialized draft state exceeds the 100KB GAS UserCache quota limit, it skips caching and displays a clear warning to the user: `"⚠️ Form draft state exceeds cache size limits (100KB). Please reduce text input size."`
   - Isolates unsubmitted draft state per active spreadsheet ID and sheet tab name, ensuring tab switches within a log workbook preserve draft inputs on each tab independently without cross-tab leakage.

2. **Polymorphic `contextKey` in `CardDraftStateManager`**:
   - Generalize `CardDraftStateManager` logic module methods (`getDraft`, `saveDraft`, `clearDraft`, `resolveCardFormState`) to accept a polymorphic `contextKey: string`.
   - For `AppContext.Gmail`: `contextKey` is `GMAIL_<messageId>`. Key becomes `CARD_DRAFT_V1_GMAIL_<messageId>`.
   - For `AppContext.GoogleSheets`: `contextKey` is `SHEETS_<SpreadsheetId>_<TabName>`. Key becomes `CARD_DRAFT_V1_SHEETS_<SpreadsheetId>_<TabName>`.
   - Preserves 4-tier state resolution logic (`LIVE_INPUT` -> `USER_CACHE_DRAFT` -> `EXTRACTED_METADATA` -> `DEFAULT`) in a single generic, decoupled module.

3. **`SystemTabContextBinding` Rules for System & Non-Log Tabs**:
   - When active tab is classified as a `System Config Tab` (`_Config`), `Audit Log Tab` (`_AuditLog`), `Documentation Tab`, or `User Created Tab`, context binding sets `documentType = null` and displays `DocType: N/A` alongside the classified tab role header in `SheetsRootCard`.
   - Log entry forms are suppressed and `CardDraftStateManager` draft hydration is bypassed on system/non-log tabs.
   - **Action Button Disabling**: Primary submittal/intake submit action buttons are **disabled** on system/non-log tabs where log entry actions are not possible.
   - Sidebar displays tab context metadata and `SheetAdminFoldOut` for diagnostic health checks, schema drift audits, and cache controls.

## Consequences

- `CardDraftStateManager` operates polymorphically across `Gmail` and `GoogleSheets` contexts without duplicating state resolution code.
- Unsubmitted draft states on individual log tabs are 100% isolated and protected across tab switches in Google Sheets.
- System tabs (`_Config`, `_AuditLog`) render clean administrative status cards with disabled submit buttons and `documentType = null`, preventing misleading log bindings or accidental data entry risks.
- UserCache 100KB payload quota limits are guarded safely with clear user warnings.
