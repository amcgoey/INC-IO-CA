# 0023-loss-less-card-state-preservation-via-usercache.md

Establish `CardDraftStateManager` logic module and `CacheService.getUserCache()` context-isolated keying for loss-less card draft state preservation across section re-renders and email context switching.

## Context & Decision

In Google Workspace Add-ons (Gmail Add-ons), form input state entered by users into card widgets (e.g. notes, CSI section codes, document types) can be lost when card sections re-render during action callbacks (e.g. toggling AI analysis) or when users switch between emails (Email A -> Email B -> Email A).

To guarantee 100% loss-less card state preservation:

1. **Context-Isolated Draft Keying (`CARD_DRAFT_V1_<messageId>`)**:
   - Draft form inputs are isolated in `CacheService.getUserCache()` using deterministic keys scoped to the active Gmail `messageId`.
   - Switching between emails in Gmail automatically restores the unsubmitted draft state specific to each message context.

2. **4-Tier State Resolution & Provenance**:
   - `CardDraftStateManager.resolveCardFormState()` resolves the active card input state via four prioritized tiers:
     1. `LIVE_INPUT`: Transient action event inputs passed in the current card action payload (`e.formInputs`).
     2. `USER_CACHE_DRAFT`: Stored draft overrides retrieved from `UserCache`.
     3. `EXTRACTED_METADATA`: Baseline extracted email metadata or AI analysis predictions.
     4. `DEFAULT`: System fallback values.
   - Each resolved field carries an explicit provenance tag (`LIVE_INPUT`, `USER_CACHE_DRAFT`, `EXTRACTED_METADATA`, or `DEFAULT`).

3. **Loss-Less Section Re-rendering**:
   - Whenever a section action or partial reload occurs, active form fields are persisted via `CardDraftStateManager.saveDraft()`. Touchless fields (e.g. `notes`, `csiSection`) remain cached in `UserCache` and are restored during card section re-renders.

4. **Lifecycle & Cleardown**:
   - Draft entries are stored with a 1-hour (3,600s) default TTL.
   - Successful document completion (`Process Document`) invokes `CardDraftStateManager.clearDraft()` to purge the cached draft.

## Prototype & Artifacts

- **Logic Module**: `src/prototypes/CardDraftStateManager.ts`
- **Interactive CLI TUI Runner**: `npm run prototype:usercache-state` (`scripts/prototype-usercache-state.ts`)
- **Automated Verification**: `npm run prototype:usercache-state -- --auto`
- **Primary Source Branch**: [`prototype/usercache-state`](https://github.com/amcgoey/INC-IO-CA/tree/prototype/usercache-state)
- **Unit Test Suite**: `test/CardDraftStateManager.test.ts`

## Consequences

- Form inputs entered by users are completely safe against card section re-renders and email context switches.
- Explicit field provenance tracking clarifies state origin during debugging and UI card rendering.
- UserCache storage overhead is minimal (JSON strings per active draft with automatic TTL expiration).
