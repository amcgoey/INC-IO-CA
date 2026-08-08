/**
 * @file FakeAiAnalysisAdapter.ts
 * @description In-memory fake implementation of `AiAnalysisService` for unit testing and offline fallback.
 *
 * Classified as Tier 2/3 Fake Adapter Seam under ADR 0013 / CODING_STANDARDS.md.
 */

import { AiAnalysisService, EmailData, AiPredictionResult, DeepAnalysisContext, DeepAnalysisResult } from '../../core/interfaces/AiAnalysisService';

export class FakeAiAnalysisAdapter implements AiAnalysisService {
  /** Recorded triage calls. */
  public triageCalls: Array<{ emailData: EmailData; messageId?: string; }> = [];
  /** Recorded analyze calls. */
  public analyzeCalls: Array<{ sourceBlob: any; emailText: string; contextObj: DeepAnalysisContext }> = [];
  private triageResult: AiPredictionResult = {
    success: true,
    prediction: { predictedProjectName: "Default Project", predictedDiscipline: "Architecture" }
  };
  private analysisResult: DeepAnalysisResult = {
    success: true,
    analysis: {}
  };

  reset(): void {
    this.triageCalls = [];
    this.analyzeCalls = [];
  }

  setTriageResult(result: AiPredictionResult): void {
    this.triageResult = result;
  }

  setAnalyzeSubmittalResult(result: DeepAnalysisResult): void {
    this.analysisResult = result;
  }

  setAnalysisResult(result: DeepAnalysisResult): void {
    this.analysisResult = result;
  }

  /** @override */
  async triageEmail(emailData: EmailData, messageId?: string): Promise<AiPredictionResult> {
    this.triageCalls.push({ emailData, messageId });
    return this.triageResult;
  }

  /** @override */
  async analyzeSubmittal(
    sourceBlob: any,
    emailText: string,
    contextObj: DeepAnalysisContext
  ): Promise<DeepAnalysisResult> {
    this.analyzeCalls.push({ sourceBlob, emailText, contextObj });
    return this.analysisResult;
  }
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeAiAnalysisAdapter
  };
}
