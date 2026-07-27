/**
 * @file AnalyzeDocumentAction.ts
 * @description DocumentAction implementation for AI multimodal submittal document analysis (AnalyzeDocumentAction).
 *
 * Slices up to 3 pages from the target PDF document blob and invokes `AiAnalysisService.analyzeSubmittal`
 * to extract candidate submittal form fields.
 */

declare var require: any;

function resolveAiAnalysisServiceHelper(): AiAnalysisService {
  if (typeof defaultAiAnalysisService !== "undefined" && defaultAiAnalysisService) {
    return defaultAiAnalysisService;
  }
  if ((globalThis as any).defaultAiAnalysisService) {
    return (globalThis as any).defaultAiAnalysisService;
  }
  try {
    return require("./AiAnalysisService").defaultAiAnalysisService;
  } catch (e) {
    throw new Error("AiAnalysisService is not available");
  }
}

/**
 * Primitive workflow action that executes AI submittal document analysis.
 */
export class AnalyzeDocumentAction implements DocumentAction<AnalyzeDocumentInput, DeepAnalysisResult> {
  private aiAnalysisService?: AiAnalysisService;
  private extractPagesAction?: ExtractPagesAction;

  /**
   * Constructs an `AnalyzeDocumentAction` instance.
   *
   * @param options - Injection options for `aiAnalysisService` and `extractPagesAction`.
   */
  constructor(options?: { aiAnalysisService?: AiAnalysisService; extractPagesAction?: ExtractPagesAction }) {
    if (options && options.aiAnalysisService) {
      this.aiAnalysisService = options.aiAnalysisService;
    }
    if (options && options.extractPagesAction) {
      this.extractPagesAction = options.extractPagesAction;
    }
  }

  private getAiAnalysisService(): AiAnalysisService {
    if (this.aiAnalysisService) return this.aiAnalysisService;
    return resolveAiAnalysisServiceHelper();
  }

  /**
   * Executes AI submittal analysis on the source PDF blob.
   *
   * @param input - `AnalyzeDocumentInput` containing `sourceBlob`, optional `emailText`, and `contextObj`.
   * @returns A Promise resolving to `DeepAnalysisResult`.
   */
  async execute(input: AnalyzeDocumentInput): Promise<DeepAnalysisResult> {
    if (!input || !input.sourceBlob) {
      throw new Error("INVALID_ANALYZE_INPUT: Missing sourceBlob in AnalyzeDocumentAction input");
    }

    const emailText = input.emailText || "";
    const contextObj = input.contextObj || { contacts: [], actions: [] };

    const aiService = input.aiAnalysisService || this.getAiAnalysisService();
    return await aiService.analyzeSubmittal(input.sourceBlob, emailText, contextObj);
  }
}

/** Global default instance seam for AnalyzeDocumentAction. */
export var defaultAnalyzeDocumentAction: AnalyzeDocumentAction = new AnalyzeDocumentAction();

if (typeof (globalThis as any).defaultAnalyzeDocumentAction === "undefined") {
  (globalThis as any).defaultAnalyzeDocumentAction = defaultAnalyzeDocumentAction;
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AnalyzeDocumentAction,
    defaultAnalyzeDocumentAction
  };
}
