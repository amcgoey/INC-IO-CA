/**
 * @file TransientOverrideLogger.ts
 * @description Tier 1 pure core diagnostic logger for manual AI field overrides on intake forms.
 *
 * Compares initial AI triage values against final form submission payloads. If user overrides are detected,
 * emits non-persistent structured JSON entries ({ fieldKey, aiValue, aiConfidence, userValue }) via execution logs
 * for debugging, avoiding spreadsheet tab bloat.
 *
 * Classified as Tier 1 (Pure Core Logic) under ADR 0013 / CODING_STANDARDS.md.
 * Dual-compatible with GAS V8 engine and Node.js test environment.
 * Zero GAS ambient API dependencies (no SpreadsheetApp, DriveApp, or Logger references).
 */

import { AiClassificationResult } from '../interfaces/AiAnalysisService';

/** Structured JSON entry payload for a manual AI field override. */
export interface AiOverrideEntry {
  fieldKey: string;
  aiValue: string;
  aiConfidence: number;
  userValue: string;
}

/** Logging function delegate type. */
export type LogFn = (message: string) => void;

/**
 * Diagnostic logger comparing initial AI classification predictions with final form submission payloads.
 */
export class TransientOverrideLogger {
  private logFn: LogFn;

  /**
   * Constructs a TransientOverrideLogger instance.
   *
   * @param logFn - Optional custom logging delegate. Defaults to `console.log`.
   */
  constructor(logFn?: LogFn) {
    this.logFn = logFn || ((msg: string) => console.log(msg));
  }

  /**
   * Compares initial AI classification results against final form submission payload fields and logs manual user overrides.
   *
   * @param initialAi - The initial AI classification result.
   * @param finalPayload - The final form submission payload key-value map.
   * @returns Array of detected AiOverrideEntry objects.
   */
  logOverrides(
    initialAi: AiClassificationResult | undefined | null,
    finalPayload: Record<string, unknown> | undefined | null
  ): AiOverrideEntry[] {
    if (!initialAi || !initialAi.fields || !finalPayload) {
      return [];
    }

    const fieldsMap = initialAi.fields;
    const overrides: AiOverrideEntry[] = [];

    for (const fieldKey of Object.keys(fieldsMap)) {
      const aiField = fieldsMap[fieldKey];
      if (!aiField || typeof aiField.value === 'undefined' || aiField.value === null) {
        continue;
      }

      const userRaw = finalPayload[fieldKey];
      const userValue = (userRaw !== undefined && userRaw !== null) ? String(userRaw) : "";
      const aiValue = String(aiField.value);

      if (aiValue !== userValue) {
        const entry: AiOverrideEntry = {
          fieldKey,
          aiValue,
          aiConfidence: typeof aiField.confidence === 'number' ? aiField.confidence : 0,
          userValue
        };

        overrides.push(entry);
        this.logFn(JSON.stringify(entry));
      }
    }

    return overrides;
  }
}

declare let module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TransientOverrideLogger
  };
}
