/**
 * @file FakeAiAnalysisAdapter.ts
 * @description In-memory fake implementation of `AiAnalysisService` for testing.
 */

export class FakeAiAnalysisAdapter implements AiAnialysisService {
  public triageCalls: Array<{ emailData: EmailData; messageId?: string }> = [];
  public analyzeCalls: Array<{ sourceBlob: GoogleAppsScript.Base.Blob; emailText: string; contextObj: DeepAnalysisContext }> = [];
  public calls: Array<{ method: string; args: any[] }> = [];
  public configuredPrediction: TriagePrediction | null = null;
  public configuredDeepAnalysis: DeepAnalysisResult | null = null;

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
    this.actionMap = result;
  }

 async triageEmail(emailData: EmailData, messageId?: string): Promise<AiPredictionResult> {
    this.triageCalls.push({ emailData, messageId });
    return this.triageResult;
  }

  async analyzeSubmittal(
    sourceBlob: GoogleAppsScript.Base.Blob,
    emailText: string,
    contextObj: DeepAnalysisContext
  ): Promise<DeepAnalysisResult> {
    this.analyzeCalls.push({ sourceBlob, emailText, contextObj });
    return this.analysisResult;
  }

  async triageDocument(
    sourceBlob: GoogleAppsScript.Base.Blob,
    context?: TriageContext
  ): Promise<TriageResult> {
    this.calls.push({ method: "triageDocument", args: [sourceBlob, context] });
    const prediction: TriagePrediction = this.configuredPrediction || {
      predictedProjectName: "Project Alpha",
      predictedDiscipline: "Architecture"
    };
    return {
      status: "SUCCESS",
      prediction
    };
  }

  async analyzeDocument(
    sourceBlob: GoogleAppsScript.Base.Blob,
    discipline: string,
    context?: DeepAnalysisContext
  ): Promise<DeepAnalysisResult> {
    this.calls.push({ method: "analyzeDocument", args: [sourceBlob, discipline, context] });
    return (
      this.configuredDeepAnalysis || {
        status: "SUCCESS",
        extractedFields: { specTitle: "Fake Title", vendor: "Fake Vendor" },
        confidence: 0.95
      }
    );
  }
}
