/// <reference path="./types.ts" />
/**
 * @file AnalyzeDocumentAction.ts
 * @description DocumentAction implementation for AI multimodal submittal document analysis (AnalyzeDocumentAction).
 *
 * Slices up to 3 pages from the target PDF document blob via ExtractPagesAction and invokes AiAnalysisService.analyzeSubmittal
 * to extract candidate submittal form fields. Adheres to execute(context: DocumentActionContext): Promise<DocumentActionContext>.
 */

declare var defaultAiAnalysisService: AiAnalysisService;
declare var defaultExtractPagesAction: ExtractPagesAction;

/**
 * Primitive workflow action that executes AI submittal document analysis.
 */
class AnalyzeDocumentAction implements DocumentAction<DocumentActionContext> {
  name: string = "AnalyzeDocument";
  private extractPagesAction?: ExtractPagesAction;

  constructor(options?: { extractPagesAction?: ExtractPagesAction }) {
    if (options?.extractPagesAction) {
      this.extractPagesAction = options.extractPagesAction;
    }
  }

  /**
   * Executes AI submittal analysis on the target document context.
   * Performs fail-fast early guard validation for required context fields and adapters.
   *
   * @param context - Target DocumentActionContext.
   * @returns Promise resolving to updated DocumentActionContext containing analysis results.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    if (!context) {
      throw new Error("AnalyzeDocumentAction requires context");
    }

    const blob = context.blob || (context as any).sourceBlob;
    if (!blob) {
      throw new Error("AnalyzeDocumentAction requires 'blob' in context");
    }

    const aiService =
      context.adapters?.aiService ||
      context.adapters?.aiAnalysisService ||
      context.aiService ||
      context.aiAnalysisService ||
      (typeof defaultAiAnalysisService !== "undefined" ? defaultAiAnalysisService : (globalThis as any).defaultAiAnalysisService);

    if (!aiService) {
      throw new Error("AnalyzeDocumentAction requires 'aiService' adapter in context.adapters");
    }

    const emailText = context.emailText || (context.emailData ? context.emailData.body : "");
    const contextObj = context.contextObj || { contacts: [], actions: [] };

    let targetBlob = blob;
    const extractAction =
      this.extractPagesAction ||
      (typeof defaultExtractPagesAction !== "undefined" ? defaultExtractPagesAction : ((globalThis as any).defaultExtractPagesAction || (typeof require !== "undefined" ? require("./core/workflow/ExtractPagesAction").defaultExtractPagesAction : undefined)));

    if (extractAction) {
      try {
        const sliceResult = await extractAction.execute({ sourceBlob: blob, maxPages: 3 });
        if (sliceResult?.blob) {
          targetBlob = sliceResult.blob;
        }
      } catch (e) {}
    }

    const analysisResult = await aiService.analyzeSubmittal(targetBlob, emailText, contextObj);
    const analysis = analysisResult?.success ? analysisResult.analysis : undefined;

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
    defaultAnalyzeDocumentAction
  };
}

(globalThis as any).AnalyzeDocumentAction = AnalyzeDocumentAction;
(globalThis as any).defaultAnalyzeDocumentAction = defaultAnalyzeDocumentAction;