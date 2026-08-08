# 0024-ai-classifier-schema-field-confidence-and-override-logging.md

Establish structured per-field confidence schema (`value` + `confidence`), numerical confidence thresholding (`< 0.85`), and transient `Logger.log()` override logging for 1-pass AI document classification.

## Context & Decision

To support 1-pass AI classification and triage in `AiAnalysisService` and the `UnbiasedIntakeCard` UI, we need clear architecture contracts for:
1. JSON prompt schema structure from 1-pass Gemini models.
2. UI rendering rules for uncertain predictions below a numerical threshold.
3. Diagnostic logging for manual user overrides when users edit AI-predicted values prior to document processing.

We have locked the following architectural standards:

1. **Per-Field Value & Confidence JSON Schema**:
   - 1-pass Gemini AI triage and document analysis prompts use structured JSON responses where each extracted field returns both its predicted string `value` and a numerical `confidence` score (`0.00` to `1.00`), along with top-level `overallConfidence`:
     ```json
     {
       "overallConfidence": 0.92,
       "fields": {
         "projectName": { "value": "24-001 - Modern Highrise", "confidence": 0.98 },
         "discipline": { "value": "Architecture", "confidence": 0.95 },
         "docTypeKey": { "value": "SUBMITTAL_ARCH", "confidence": 0.90 },
         "specSection": { "value": "08 11 13", "confidence": 0.82 },
         "contactAbbr": { "value": "ABC", "confidence": 0.65 }
       }
     }
     ```

2. **Numerical Confidence Thresholding (`< 0.85`) & Non-Blocking UI Warnings**:
   - The system establishes a fixed numerical confidence threshold (`FieldConfidenceThreshold = 0.85`).
   - If any extracted field or overall confidence score is `< 0.85`, `CardPresenter` / `UnbiasedIntakeCard` displays:
     - A yellow non-blocking top warning banner: `⚠️ Low AI Confidence (<85%) on X fields — please review before processing.`
     - Visual warning cues in low-confidence input labels (e.g. `Spec Section ⚠️ (82% AI Confidence)`).
   - Card submission is **non-blocking**: users can immediately process documents once required input rules pass, but visual cues direct attention to low-confidence predictions.

3. **Transient `Logger.log()` Debug Logging for Overrides**:
   - Manual user overrides (differences between initial AI classification and final user-submitted values) are logged strictly via `Logger.log()` / `console.log()` execution logs during submission for developer debugging.
   - Dedicated sheet logging (`_AiOverrides` tabs) and `ScriptProperties` JSON arrays are intentionally excluded to keep spreadsheets lightweight and avoid storage bloat.

## Consequences

- Strict per-field confidence scoring enables target UI highlighting without raw regex parsing.
- Non-blocking visual warning cues maintain high intake speed while drawing attention to low-confidence fields.
- Diagnostic override logging stays lightweight and 0-overhead for production spreadsheet workbooks.
