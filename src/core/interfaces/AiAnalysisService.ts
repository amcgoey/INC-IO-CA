/**
 * @file AiAnalysisService.ts
 * @description Pure core abstract interface for AI email triage and submittal document deep analysis.
 *
* Classified as Tier 1 (Pure Core Logic) under ADR 0013 / CODING_STANDARDS.md.
 * Dual-compatible with GAS V8 engine and Node.js test environment.
 * Zero GAS ambient API dependencies (no GoogleAppsScript references) and zero Node.js built-in imports.
 */


/** Fixed numerical confidence threshold (< 0.85) for triggering visual low-confidence warning indicators. */
export const FieldConfidenceThreshold = 0.85;

/** Extracted field confidence object from 1-pass AI classification. */
export interface AiClassificationField {
  value: string;
  confidence: number;
}

/** Standardized payload returned from 1-pass AI document triage and classification. */
export interface AiClassificationResult {
  overallConfidence?: number;
  fields?: Record<string, AiClassificationField>;
}

/** Raw email header and content structure used for AI triage. */
export interface EmailData {
  subject: string;
  sender: string;
  replyTo: string;
  to: string;
  cc: string;
  labels: string[];
  attachmentNames: string[];
  body: string;
}

/** Prediction output payload returned from email triage. */
export interface AIPrediction {
  predictedProjectName?: string;
  predictedDiscipline?: string;
  error?: string;
  confidence?: number;
}

/** Discriminated union outcome for AI email triage execution. */
export type AiPredictionResult =
  | { success: true; prediction: AIPrediction }
  | {
      success: false;
      error: {
        code: 'RATE_LIMITED' | 'MISSING_KEY' | 'API_FAILURE' | 'PARSE_FAILURE';
        userMessage: string;
      };
    };

/** Context containing valid contact and action options passed to deep AI submittal analysis. */
export interface DeepAnalysisContext {
  contacts: Array<{ abbr: string; name: string }>;
  actions: Array<{ action: string }>;
}

/** Extracted metadata fields returned from multimodal submittal PDF analysis. */
export interface DeepAnalysisPrediction {
  predictedSection?: string;
  predictedNumber?: string;
  predictedRevision?: string;
  predictedTitle?: string;
  predictedSpecTag?: string;
  predictedVendor?: string;
  predictedContactAbbr?: string;
  predictedAction?: string;
}

/** Discriminated union outcome for deep AI submittal analysis. */
export type DeepAnalysisResult =
  | { success: true; analysis: DeepAnalysisPrediction }
  | {
      success: false;
      error: {
        code: "RATE_LIMITED" | "MISSING_KEY" | "API_FAILURE" | "PARSE_FAILURE" | "PDF_PROCESSING_ERROR";
        userMessage: string;
      };
    };

/** Payload shape representing binary blob data dual-compatible across node/browser/GAS environments. */
export interface DocumentBlob {
  getBytes(): Uint8Array | number[];
  getName?(): string;
  getContentType?(): string;
}

/**
 * Service interface for email triage and submittal document deep AI analysis.
 */
export interface AiAnalysisService {
  /** Analyzes email header/body context to predict project name and discipline. */
  triageEmail(emailData: EmailData, messageId?: string): Promise<AiPredictionResult>;

  /** Analyzes submittal document blob/payload and email text using multimodal capabilities. */
  analyzeSubmittal(
    sourceBlob: DocumentBlob | any,
    emailText: string,
    contextObj: DeepAnalysisContext
  ): Promise<DeepAnalysisResult>;
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FieldConfidenceThreshold
  };
}
