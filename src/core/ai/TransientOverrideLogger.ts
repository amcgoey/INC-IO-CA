/**
 * @file TransientOverrideLogger.ts
 * @description Tier 1 pure core diagnostic logger for manual AI field overrides on intake forms.
 *
 * Compares initial AI triage values against final form submission payloads. If user overrides are detected,
 * emits non-persistent structured JSON entries ({ fieldKey, aiValue, aiConfidence, userValue }) via Logger.log()
 * or execution logs for debugging, avoiding spreadsheet tab bloat.
 *
 * Classified as Tier 1 (Pure Core Logic) under ADR 0013 / CODING_STANDARDS.md.
 * Dual-compatible with GAS V8 engine and Node.js test environment.
 */

import { AiClassificationResult, AiClassificationField } from '../interfaces/AiAnalysisService';

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
   * @param logFn - Optional custom logging delegate. Defaults to `Logger.log()` if present, else `console.log()`.
   */
  constructor(logFn?: LogFn) {
    this.logFn = logFn || ((msg: string) => {
      if (typeof Logger !== "undefined" && typeof (Logger as any).log === "function") {
        (Logger as any).log(msg);
      } else {
        console.log(msg);
      }
    });
  }

  /**
   * Compares initial AI classification results against final form submission payload fields and logs manual user overrides.
   *
   * @param initialAi - The initial AI classification result or raw field dictionary.
   * @param finalPayload - The final form submission payload key-value map.
   * @returns Array of detected AiOverrideEntry objects.
   */
  logOverrides(
    initialAi: AiClassificationResult | Record<string, AiClassificationField> | undefined | null,
    finalPayload: Record<string, any> | undefined | null
  ): AiOverrideEntry[] {
    if (!initialAi || !finalPayload) {
      return [];
    }

    const fieldsMap: Record<string, AiClassificationField> =
      ('fields' in initialAi && initialAi.fields)
        ? initialAi.fields
        : (initialAi as Record<string, AiClassificationField>);

    const overrides: AiOverrideEntry[] = [];

    for (const fieldKey of Object.keys(fieldsMap)) {
      const aiField = fieldsMap[fieldKey];
      if (!aiField || typeof aiField.value === 'undefined' || aiField.value === null) {
        continue;
      }

      const userRaw = finalPayload[fieldKey];
      if (typeof userRaw === 'undefined' || userRaw === null) {
        continue;
      }

      const aiVal = String(aiField.value).trim();
      const userVal = String(userRaw).trim();

      if (aiVal !== userVal) {
        const entry: AiOverrideEntry = {
          fieldKey,
          aiValue: String(aiField.value),
          aiConfidence: typeof aiField.confidence === 'number' ? aiField.confidence : 0,
          userValue: String(userRaw)
        };

        overrides.push(entry);
        this.logFn(JSON.stringify(entry));
      }
    }

    return overrides;
  }

  /**
   * Static helper for logging manual AI field overrides without manually instantiating TransientOverrideLogger.
   *
   * @param initialAi - The initial AI classification result or raw field dictionary.
   * @param finalPayload - The final form submission payload key-value map.
   * @param logFn - Optional custom logging delegate.
   * @returns Array of detected AiOverrideEntry objects.
   */
  static logOverrides(
    initialAi: AiClassificationResult | Record<string, AiClassificationField> | undefined | null,
    finalPayload: Record<string, any> | undefined | null,
    logFn?: LogFn
  ): AiOverrideEntry[] {
    const logger = new TransientOverrideLogger(logFn);
    return logger.logOverrides(initialAi, finalPayload);
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TransientOverrideLogger
  };
}
