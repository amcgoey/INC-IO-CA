# 0048-gemini-3-8-flash-submittal-analysis-migration.md

Adopt **Gemini 3.8 Flash** for deep submittal document analysis with explicit zero-budget thinking controls, while retaining **Gemini 3.5 Flash-Lite** for initial email triage to protect Google Workspace Add-on interactive UI latency budgets and control output token costs.

## Context

Deep submittal document analysis (`analyzeSubmittal`) previously targeted `gemini-3.6-flash`. With Google's release of `gemini-3.8-flash` in September 2026 and automated backend deprecation routing for older 3.x Flash endpoints, production workloads risk unpinned redirects or deprecation warnings. Furthermore, Gemini 3.8 Flash introduces tunable reasoning/thinking levels: unconstrained thinking generates hundreds to thousands of reasoning tokens billed at full output rates ($3.75 to $7.50 / 1M tokens) and increases latency by 10 to 25+ seconds. In a Google Workspace Add-on running on Google Apps Script, interactive card action handlers (`CardPresenter` / `ActionResponse`) enforce an interactive timeout threshold of approximately 30 seconds; multi-second reasoning delays combined with exponential backoff retries (`fetchGeminiWithRetryHelper`) risk hard client gateway timeouts.

Meanwhile, initial email triage (`triageEmail`) executes automatically on contextual message selection (`onGmailMessageOpen`). Triage requires sub-second latency (< 1.5s) to prevent perceived UI spinner delays, a profile for which the lightweight `gemini-3.5-flash-lite` remains uniquely optimal.

## Decision

We decided to upgrade deep submittal document analysis to `gemini-3.8-flash` with the following architectural constraints:

1. **Two-Tier Model Allocation**:
   - **Initial Triage (`triageEmail`)**: Remains pinned to `gemini-3.5-flash-lite:generateContent` with 6-hour caching in `CacheAdapter` (`ai_pred_{messageId}`).
   - **Deep Analysis (`analyzeSubmittal`)**: Upgrades default fallback endpoint in `CONFIG.GEMINI_API_URL_ANALYSIS` to `gemini-3.8-flash:generateContent`.

2. **Configurable Thinking Budget with Zero-Budget Default**:
   - Introduce `CONFIG.GEMINI_THINKING_BUDGET` (default `0`, overridable via Script Property `GEMINI_THINKING_BUDGET`).
   - `GeminiAiAnalysisAdapter` injects `thinkingConfig: { thinkingBudget: CONFIG.GEMINI_THINKING_BUDGET }` into `generationConfig`. If overridden to `< 0`, `thinkingConfig` is omitted entirely for backward compatibility with legacy endpoints. Setting budget `0` ensures submittal metadata extraction runs in 2 to 5 seconds without reasoning token charges.

3. **Defensive Candidate Part Resolution**:
   - Replace brittle `candidates[0].content.parts[0].text` indexing with non-thought candidate filtering:
     `parts.find((p: any) => !p.thought)?.text`
     This prevents fatal `PARSE_FAILURE` errors if preamble, thoughts, or metadata parts precede the JSON payload.

4. **Payload Memory & Token Boundary Protection**:
   - Enforce a hard 20 MB input blob ceiling on `analyzeSubmittal` (returning `PDF_TOO_LARGE` if exceeded) to prevent Google Apps Script V8 heap exhaustion.
   - Delegate to `ExtractPagesAction` to slice the first 3 pages if the blob exceeds 2 MB **or** contains more than 3 pages, preventing vector PDF token explosions while keeping compact single-page sheets on the fast path.

5. **Double-Click Deduplication**:
   - Introduce a 10-minute cache in `analyzeSubmittal` via `CacheAdapter` keyed on ``submittal_analysis_${sourceBlob.getName()}_${sourceBlob.getBytes().length}`` to deduplicate accidental double-clicks and avoid redundant token billing or concurrent CardService update races.

6. **Diagnostics Sanitization & Ping Alignment**:
   - Update `scripts/check-models.ts` and `checkAiModelHealth` to test `gemini-3.8-flash` with matching `thinkingConfig`, ensuring all error outputs pass through `sanitizeErrorString` to prevent plaintext secret leakage.

## Consequences

- Deep submittal analysis achieves superior multimodal OCR and spatial layout comprehension on construction drawings while maintaining response times between 2 and 5 seconds.
- Workspace Add-on interactive card actions remain comfortably within the 30-second UI gateway limit, even when encountering transient 429/503 exponential backoff retries.
- Production operators retain dynamic zero-code hot-swapping through Script Properties (`GEMINI_API_URL_ANALYSIS`, `GEMINI_API_URL`, `GEMINI_THINKING_BUDGET`).
- Legacy deployments with `GEMINI_API_URL` set must be documented in release notes to prevent shadowing the new 3.8 Flash default.
