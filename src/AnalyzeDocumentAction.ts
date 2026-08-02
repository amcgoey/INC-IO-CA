/// <reference path="./types.ts" />
/**
 * @file AnalyzeDocumentAction.ts
 * @description DocumentAction implementation for AI multimodal submittal document analysis (AnalyzeDocumentAction).
 *
 * Slices up to 3 pages from the target PDF document blob via `ExtractPagesAction` and invokes `AiAnalysisService.analyzeSubmittal`
 * to extract candidate submittal form fields. Adheres to execute(context: DocumentActionContext): Promise<DocumentActionContext>.
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
class AnalyzeDocumentAction implements DocumentAction<any, any> {
  name: string = "AnalyzeDocument";
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

  private getAiAnalysisService(context?: DocumentActionContext): AiAnalysisService {
    if (this.aiAnalysisService) return this.aiAnalysisService;
    if (context) {
      if (context.adapters?.aiService) return context.adapters.aiService;
      if (context.adapters?.aiAnalysisService) return context.adapters.aiAnalysisService;
      if (context.aiService) return context.aiService;
      if (context.aiAnalysisService) return context.aiAnalysisService;
    }
    return resolveAiAnalysisServiceHelper();
  }

  private getExtractPagesAction(): ExtractPagesAction | null {
    if (this.extractPagesAction) return this.extractPagesAction;
    return resolveExtractPagesActionHelper();
  }

  /**
   * Executes AI submittal analysis on the target document context or input payload.
   * Performs fail-fast early guard validation for required context fields and adapters.
   * Slices the first 3 pages of the PDF blob before submitting to AI analysis.
   *
   * @param contextOrInput - `DocumentActionContext` or legacy `AnalyzeDocumentInput`.
   * @returns Promise resolving to updated `DocumentActionContext` (or `DeepAnalysisResult` for legacy input).
   */
  async execute(contextOrInput: DocumentActionContext | AnalyzeDocumentInput): Promise<any> {
    if (!contextOrInput) {
      throw new Error("INVALID_ANALYZE_INPUT: Missing input context in AnalyzeDocumentAction");
    }

    const isDirectInput = !("adapters" in contextOrInput) && "sourceBlob" in contextOrInput && !("blob" in contextOrInput);

    if (isDirectInput) {
      const input = contextOrInput as AnalyzeDocumentInput;
      if (!input.sourceBlob) {
        throw new Error("INVALID_ANALYZE_INPUT: Missing sourceBlob in AnalyzeDocumentAction input");
      }
      const aiService = input.aiAnalysisService || this.getAiAnalysisService();
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
        } catch (e) {}
      }

      return await aiService.analyzeSubmittal(targetBlob, emailText, contextObj);
    }

    // DocumentActionContext execution mode
    const context = contextOrInput as DocumentActionContext;
    const blob = context.blob || context.sourceBlob;
    if (!blob) {
      throw new Error("INVALID_ANALYZE_INPUT: AnalyzeDocumentAction requires 'blob' in context");
    }

    const aiService = context.adapters?.aiService || context.adapters?.aiAnalysisService || context.aiService || context.aiAnalysisService || this.aiAnalysisService;
    if (!aiService) {
      throw new Error("AnalyzeDocumentAction requires 'aiService' adapter in context.adapters");
    }

    const emailText = context.emailText || (context.emailData ? context.emailData.body : "");
    const contextObj = context.contextObj || { contacts: [], actions: [] };

    let targetBlob = blob;
    const extractAction = this.getExtractPagesAction();
    if (extractAction) {
      try {
        const sliceResult = await extractAction.execute({ sourceBlob: blob, maxPages: 3 });
        if (sliceResult && sliceResult.blob) {
          targetBlob = sliceResult.blob;
        }
      } catch (e) {}
    }

    const analysisResult = await aiService.analyzeSubmittal(targetBlob, emailText, contextObj);
    const analysis = analysisResult.success ? analysisResult.analysis : undefined;

    return {
      ...context,
      analysisResult,
      analysis
    };
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