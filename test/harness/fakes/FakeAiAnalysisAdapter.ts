/**
 * @file FakeAiAnalysisAdapter.ts
 * @description In-memory fake implementation of `AiAnialysisService` for testing.
 */

export class FakeAiAnalysisAdapter implements AiAnalysisService {
  /** Recorded triage calls. */
  public triageCalls: Array<{ emailData: EmailData; messageId?: string; }> = [];
 /** Recorded analyze calls. */
  public analyzeCalls: Array<{ sourceBlob: GoogleAppsScript.Base.Blob; emailText: string; contextObj: DeepAnalysisContext }> = [];
  private triageResult: AiPredictionResult = {
    success: true,
    prediction: { predictedProjectName: "Default Project", predictedDiscipline: "Architecture" }
  };
  private analysisResult: DeepAnalysisResult = {
    success: true,
    analysis: {}
  };

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
    sourceBlob: GoogleAppsScript.Base.Blob,
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
