/**
 * @file AnalyzeDocumentAction.ts
 * @description DocumentAction implementation for AI multimodal submittal document analysis (AnalyzeDocumentAction).
 *
 * Slices up to 3 pages from the target PDF document blob via `ExtractPagesAction` and invokes `AiAnalysisService.analyzeSubmittal`
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

function resolveExtractPagesActionHelper(): ExtractPagesAction | null {
  if (typeof defaultExtractPagesAction !== "undefined" && defaultExtractPagesAction) {
    return defaultExtractPagesAction;
  }
  if ((globalThis as any).defaultExtractPagesAction) {
    return (globalThis as any).defaultExtractPagesAction;
  }
  try {
    return require("./ExtractPagesAction").defaultExtractPagesAction;
  } catch (e) {
    return null;
  }
}

/**
 * Primitive workflow action that executes AI submittal document analysis.
 */
class AnalyzeDocumentAction implements DocumentAction<AnalyzeDocumentInput, DeepAnalysisResult> {
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

  private getExtractPagesAction(): ExtractPagesAction | null {
    if (this.extractPagesAction) return this.extractPagesAction;
    return resolveExtractPagesActionHelper();
  }

  /**
   * Executes AI submittal analysis on the source PDF blob.
   * Slices the first 3 pages of the PDF blob before submitting to AI analysis.
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

    let targetBlob = input.sourceBlob;
    const extractAction = input.extractPagesAction || this.getExtractPagesAction();
    if (extractAction) {
      try {
        const sliceResult = await extractAction.execute({ sourceBlob: input.sourceBlob, maxPages: 3 });
        if (sliceResult && sliceResult.blob) {
          targetBlob = sliceResult.blob;
        }
      } catch (e) {
        // Fall back to sourceBlob if slicing fails
      }
    }

    const aiService = input.aiAnalysisService || this.getAiAnalysisService();
    return await aiService.analyzeSubmittal(targetBlob, emailText, contextObj);
  }
}

/** Global default instance seam for AnalyzeDocumentAction. */
var defaultAnalyzeDocumentAction: AnalyzeDocumentAction = new AnalyzeDocumentAction();

if (typeof (globalThis as any).defaultAnalyzeDocumentAction === "undefined") {
  (globalThis as any).defaultAnalyzeDocumentAction = defaultAnalyzeDocumentAction;
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AnalyzeDocumentAction,
    defaultAnalyzeDocumentAction,
    resolveAiAnalysisServiceHelper
  };
}

(globalThis as any).AnalyzeDocumentAction = AnalyzeDocumentAction;
(globalThis as any).defaultAnalyzeDocumentAction = defaultAnalyzeDocumentAction;
