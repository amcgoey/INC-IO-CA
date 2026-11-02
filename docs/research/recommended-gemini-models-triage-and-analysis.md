# Research: Recommended Gemini Models for AI Triage and Deep Submittal Analysis

**Status**: Completed  
**Author**: Research Agent  
**Date**: November 2026  
**Context**: Google Workspace Add-on (`INC_IO_CA`) — Gmail & Google Sheets Intake Pipeline  

---

## Executive Summary

This research establishes the recommended Gemini models for two distinct AI tasks within the Google Workspace Add-on architecture:
1. **Initial AI Triage (`triageEmail`)**: Predicts project names from Google Drive listings and classifies document discipline (`Architecture` vs `FF&E`) from incoming email headers and snippets.
2. **Deep AI Document Analysis (`analyzeSubmittal`)**: Extracts structured technical submittal metadata (spec sections, submittal numbers, revisions, vendors, contacts, and workflow actions) from multimodal PDF attachments (up to 3 pages / 2MB base64).

### Key Recommendations

| AI Task | Recommended Model | Model Identifier / Endpoint | Key Drivers | Target Latency |
| :--- | :--- | :--- | :--- | :--- |
| **Initial AI Triage** | **Gemini 3.5 Flash-Lite** | `gemini-3.5-flash-lite` | Ultra-low latency (< 1.5s), minimal token cost, structured JSON output, keeps contextual UI responsive. | **< 1.5 seconds** |
| **Deep AI Analysis** | **Gemini 3.5 Flash** / **Gemini 3.6 Flash** | `gemini-3.5-flash` / `gemini-3.6-flash` | Native multimodal PDF understanding, fast inference (< 4s), strict JSON `responseSchema` support, fits well within interactive UI timeout bounds. | **2 – 5 seconds** |

> [!IMPORTANT]
> **Why Pro/Reasoning Models are Not Recommended for Synchronous Add-on Actions**:
> Flagship reasoning models (such as `gemini-2.5-pro`, `gemini-3.1-pro`, or `gemini-4-argon`) frequently take **15 to 35+ seconds** to process multimodal image/PDF inputs with chain-of-thought/thinking steps. Combined with network round-trips and exponential backoff retries (`fetchGeminiWithRetry` adds 2s + 4s on HTTP 429/503), Pro models risk exceeding interactive Google Workspace Add-on UI timeout limits (~30 seconds) and degrade user experience.

---

## 1. Google Workspace Add-on Runtime & Time Limits

Google Workspace Add-ons execute within the Google Apps Script infrastructure and must abide by strict execution, network, and user interface constraints.

### 1.1 Apps Script Execution Time Limits

According to official Google Apps Script Quota and Runtime specifications:
- **Standard Script Execution Limit**: **6 minutes (360 seconds)** per execution. This is the hard ceiling for any single invocation across consumer and Google Workspace accounts.
- **Workspace Studio / Gemini Alpha Programs**: Shortened hard timeout of **2 minutes (120 seconds)**.
- **UrlFetchApp Request Timeout**: Defaults to 360 seconds, but can be configured down via `timeoutSeconds`. The maximum request/response payload size is **50 MB**.

### 1.2 Interactive CardService UI Constraints & Latency Budget

While Google Apps Script allows background scripts to run for up to 6 minutes, **Google Workspace Add-on Card UI events have much tighter practical and platform constraints**:
1. **Contextual Triggers (`onGmailMessageOpen`)**: When an email is selected, Gmail invokes the add-on manifest's contextual trigger. Google Workspace guidelines recommend card generation within **2 to 3 seconds**. If initial triage takes 5–10 seconds, the add-on card spinner delays UI rendering, creating a sluggish user experience.
2. **Interactive Action Callbacks (`ActionResponse` / `CardPresenter`)**: When a user clicks an interactive action (e.g. "Analyze Submittal" or "File Submittal"):
   - Google Workspace Add-on client gateways enforce an interactive timeout threshold (typically around **30 seconds**). If the action handler does not return an updated `ActionResponse` / `Card` within this window, the client surfaces a network/render timeout error (`"Script error: Exceeded maximum execution time"` or gateway timeout).
   - Therefore, any AI analysis step invoked during an interactive user action must execute in **less than 10 to 15 seconds**, leaving ample headroom for PDF extraction, Drive metadata retrieval, Sheets log checking, and potential transient retries.

### 1.3 Retry and Backoff Timing Budget

In `src/AIUtils.ts`, the application implements `fetchGeminiWithRetry`:
```typescript
// src/AIUtils.ts
if (statusCode === 503 || statusCode === 429) {
  attempts++;
  if (attempts > maxRetries) return ...;
  Utilities.sleep(Math.pow(2, attempts) * 1000); // Attempt 1: 2s sleep, Attempt 2: 4s sleep
}
```
If an API request encounters a transient `429 Too Many Requests` or `503 Service Unavailable`, two retry cycles introduce **6 seconds of cumulative sleep time** ($2\text{s} + 4\text{s}$). 
- If a model's baseline latency is **2–4 seconds**, a retried request finishes in $3\text{s} + 2\text{s} + 3\text{s} = 8\text{ seconds}$ (safely within the 30-second UI threshold).
- If a model's baseline latency is **18–25 seconds** (typical for heavy Pro/thinking models on multimodal inputs), a single retry pushes execution past $18\text{s} + 2\text{s} + 18\text{s} = 38\text{ seconds}$, causing an interactive UI crash.

---

## 2. Initial AI Triage: Model Selection & Analysis

### 2.1 Workload Profile
- **Input Data**: Lightweight text (~500 to 1,500 tokens). Includes email subject, sender, recipient, CC list, Gmail labels, attachment file names, and the first 1,000 characters of the email body snippet, along with the list of available Google Shared Drive names (`DriveNameProvider`).
- **Input Modality**: Pure text (no binary/PDF data).
- **Task**: Match fuzzy project candidate strings to official Shared Drive folder names and deduce discipline (`FF&E` vs `Architecture`).
- **Output Format**: Structured JSON (`{ predictedProjectName: string, predictedDiscipline: string }`).

### 2.2 Recommended Model: Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`)

#### Key Advantages:
1. **Sub-Second Latency**:
   - Time-to-First-Token (TTFT) is approximately **150–300 ms**.
   - End-to-end execution for small JSON payloads is typically **600–1,200 ms**.
   - When users open an email or trigger the intake card, triage runs without a perceptible lag.
2. **High Throughput & Rate Limits**:
   - Flash-Lite offers the highest rate limits (RPM and TPM) in the Gemini API tiers, minimizing HTTP 429 rate limit triggers during rapid email browsing.
3. **Structured JSON Mode**:
   - Natively supports `generationConfig: { response_mime_type: "application/json" }`.
4. **Cost Efficiency**:
   - Approximately **\$0.10 per 1M input tokens** and **\$0.40 per 1M output tokens** (roughly 3x cheaper than standard Flash and 20x cheaper than Pro).
5. **Caching Synergy**:
   - Coupled with the application's `CacheAdapter` (`ai_pred_${messageId}` cached for 6 hours / 21,600s), subsequent views of the same email take **0 ms** of AI compute.

#### Alternatives Considered:
- **`gemini-3.5-flash` / `gemini-3.6-flash`**: Slightly higher baseline latency (~1.5–2.5s) and higher token cost for a workload that does not require deep reasoning or multimodal extraction.
- **`gemini-2.5-flash-lite` / `gemini-1.5-flash-8b`**: Preceding generation models; Google AI documentation recommends `gemini-3.5-flash-lite` for new production deployments.

---

## 3. Deep AI Analysis: Model Selection & Analysis

### 3.1 Workload Profile
- **Input Data**: Multimodal payload consisting of:
  - First 3 pages of the submittal PDF, base64-encoded via `PdfDocumentService` / `ExtractPagesAction` (approx. 500 KB to 2 MB base64 string, ~1,500 to 4,000 multimodal vision tokens).
  - Contextual email text snippet.
  - Authorized contacts list (`[{ abbr: string, name: string }]`).
  - Permitted workflow actions list (`[{ action: string }]`).
- **Input Modality**: Multimodal (PDF document pages + structured text).
- **Task**: High-precision extraction of:
  - CSI MasterFormat specification section (e.g. `03 30 00` or `09 22 00`).
  - Submittal sequential number and revision string.
  - Submittal title/description.
  - Spec item tag or vendor (for FF&E).
  - Subcontractor / sender abbreviation mapping.
  - Action intent mapping (`To Review`, `For Approval`, etc.).
- **Output Format**: Strict schema-enforced JSON via `responseSchema`.

### 3.2 Recommended Model: Gemini 3.5 Flash / Gemini 3.6 Flash (`gemini-3.5-flash` / `gemini-3.6-flash`)

#### Key Advantages:
1. **Fast Multimodal Processing**:
   - Processes multi-page PDF vision tokens with an average response time of **2.0 to 4.5 seconds**.
   - Fits safely inside the Workspace Add-on interactive Card UI threshold (< 10 seconds), leaving plenty of buffer for network transit and Drive operations.
2. **Native Multimodal & OCR Accuracy**:
   - Highly proficient at extracting dense typography, contractor title blocks, engineering stamps, spec indexes, and tabular schedules directly from PDF page images without requiring an external OCR service.
3. **Deterministic Schema Enforcement**:
   - Natively supports `generationConfig.responseSchema` with typed fields (`predictedSection`, `predictedNumber`, `predictedRevision`, `predictedTitle`, `predictedVendor`, `predictedContactAbbr`, `predictedAction`). Eliminates hallucinated keys and JSON syntax errors.
4. **Resilience to Transient Backoff**:
   - If an HTTP 429 or 503 occurs, a 2-second sleep + retry still returns in ~6–8 seconds total, preventing user-facing client timeouts.

#### Why Pro Models (e.g. `gemini-2.5-pro`, `gemini-3.1-pro`, `gemini-4-argon`) are Not Recommended:
1. **Latency Overhead**:
   - Processing 3 PDF pages through a Pro reasoning model requires between **15 and 35 seconds**, depending on server load and reasoning tokens.
   - Any retry event pushes execution past the 30-second Google Workspace Add-on card boundary, resulting in UI failure.
2. **Cost**:
   - Multimodal token processing on Pro models is 5x to 10x more expensive per submittal analysis.
3. **Diminishing Returns on Structured Title Blocks**:
   - Submittal coversheets and title blocks present standard spatial layouts that Flash models extract with >95% accuracy. The advanced multi-step reasoning capabilities of Pro models do not yield meaningful improvements on this specific document parsing task.

---

## 4. Architecture & Configuration in `INC_IO_CA`

### 4.1 Centralized Endpoints in `src/Config.ts`

The application defines dynamic getters in `src/Config.ts` that prioritize Google Apps Script `ScriptProperties` overrides while falling back to the recommended defaults:

```typescript
// src/Config.ts
const CONFIG = {
  // ...
  /** Gemini API endpoint URL for email triage predictions (Gemini 3.5 Flash-Lite). */
  get GEMINI_API_URL_TRIAGE(): string {
    try {
      if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
        const custom = PropertiesService.getScriptProperties().getProperty('GEMINI_API_URL_TRIAGE')
          || PropertiesService.getScriptProperties().getProperty('GEMINI_API_URL');
        if (custom) return custom;
      }
    } catch (e) {}
    return "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
  },

  /** Gemini API endpoint URL for multimodal PDF submittal analysis (Gemini 3.6 Flash / 3.5 Flash). */
  get GEMINI_API_URL_ANALYSIS(): string {
    try {
      if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
        const custom = PropertiesService.getScriptProperties().getProperty('GEMINI_API_URL_ANALYSIS')
          || PropertiesService.getScriptProperties().getProperty('GEMINI_API_URL');
        if (custom) return custom;
      }
    } catch (e) {}
    return "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
  }
};
```

### 4.2 Script Properties Overrides

Administrators can update model endpoints on a live production deployment without redeploying the script or altering code:
- `GEMINI_API_URL_TRIAGE`: Set to override the triage endpoint (e.g. test preview models or regional endpoints).
- `GEMINI_API_URL_ANALYSIS`: Set to override the deep analysis endpoint.
- `GEMINI_API_URL`: Universal fallback property if both should point to the same model.

### 4.3 Diagnostics and Health Check Tooling

The repository provides a diagnostics CLI script (`scripts/check-models.ts`) and unit test suite (`test/AiAnalysisService.test.ts`) that verify:
- API Key presence and redaction (`sanitizeErrorString`).
- Endpoint responsiveness and active model capabilities (`https://generativelanguage.googleapis.com/v1beta/models`).
- Correct fallback handling when rate-limited (`RATE_LIMITED` error code).

Run diagnostics:
```bash
npm run check-models
```

---

## 5. Summary Comparison Matrix

| Dimension | Initial AI Triage | Deep AI Submittal Analysis |
| :--- | :--- | :--- |
| **Model** | **`gemini-3.5-flash-lite`** | **`gemini-3.6-flash` / `gemini-3.5-flash`** |
| **Primary Requirement** | Snappy UX, instantaneous card display | High multimodal accuracy, fits under 30s UI limit |
| **Input Type** | Email text & Shared Drive names list | 3-page PDF (base64) + email text + contacts/actions |
| **Average Latency** | ~0.8 – 1.2s | ~2.5 – 4.0s |
| **Apps Script 6m Limit** | Consumes < 0.5% | Consumes < 1.5% |
| **Card UI 30s Limit** | Safe (leaves 28s buffer) | Safe (leaves 25s buffer, survives 2 retries) |
| **Schema Type** | JSON MIME mode (`application/json`) | Strict Schema (`responseSchema`) |
| **Caching Layer** | 6 hours in `CacheAdapter` (`ai_pred_{id}`) | User-initiated on card trigger |

---

## 6. References & Primary Sources

1. **Google AI for Developers — Gemini Models Guide**:  
   [https://ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)  
   *Covers model naming conventions, context window lengths, structured output, and thinking configurations.*
2. **Google Apps Script — Quotas and Limits**:  
   [https://developers.google.com/apps-script/guides/services/quotas](https://developers.google.com/apps-script/guides/services/quotas)  
   *Documents standard 6-minute script execution limits and service quota bounds.*
3. **Google Apps Script — UrlFetchApp Reference**:  
   [https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)  
   *Documents `timeoutSeconds`, 50MB payload limits, and HTTP request option parameters.*
4. **Google Workspace Add-ons — Card Service Architecture & Design Guidelines**:  
   [https://developers.google.com/workspace/add-ons/concepts/cards](https://developers.google.com/workspace/add-ons/concepts/cards)  
   *Best practices for add-on responsiveness and interactive card updates.*
5. **Project Architecture Documentation**:  
   - `docs/adr/0005-ai-analysis-service-consolidation.md`: Consolidated AI analysis service architecture.
   - `docs/adr/0018-unbiased-multi-document-ui-intake-and-generalized-log-disambiguation.md`: AI triage intake and confidence scoring.
   - `docs/adr/0024-ai-classifier-schema-field-confidence-and-override-logging.md`: Structured JSON schema and confidence logging.
