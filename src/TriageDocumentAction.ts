/**
 * @file TriageDocumentAction.ts
 * @description DocumentAction implementation for AI email triage (TriageDocumentAction).
 *
 * Evaluates email header/body context using `AiAnalysisService.triageEmail` to predict project name and discipline.
 */

declare var require: any;

function resolveAiAnalysisService(): AiAnalysisService {
  if (typeof defaultAiAnalysisService !== "undefined" && defaultAiAnalysisService) {
    return defaultAiAnalysisService;
  }
  if ((globalThis as any).defaultAiAnalysisService) {
    return (globalThis as any).defaultAiAnalysisService;
  }
  try {
    const analyzeMod = require("./AnalyzeDocumentAction");
    if (analyzeMod && analyzeMod.resolveAiAnalysisServiceHelper) {
      return analyzeMod.resolveAiAnalysisServiceHelper();
    }
    return require("./AiAnalysisService").defaultAiAnalysisService;
  } catch (e) {
    throw new Error("AiAnalysisService is not available");
  }
}

/**
 * Primitive workflow action that executes AI email triage.
 */
class TriageDocumentAction implements DocumentAction<TriageDocumentInput, AiPredictionResult> {
  private aiAnalysisService?: AiAnalysisService;

  /**
   * Constructs a `TriageDocumentAction` instance.
   *
   * @param options - Injection options for `aiAnalysisService`.
   */
  constructor(options?: { aiAnalysisService?: AiAnalysisService }) {
    if (options && options.aiAnalysisService) {
      this.aiAnalysisService = options.aiAnalysisService;
    }
  }

  private getAiAnalysisService(): AiAnalysisService {
    if (this.aiAnalysisService) return this.aiAnalysisService;
    return resolveAiAnalysisService();
  }

  /**
   * Executes AI email triage on email header/body context.
   *
   * @param input - `TriageDocumentInput` containing `emailData` and optional `messageId`.
   * @returns A Promise resolving to `AiPredictionResult`.
   */
  async execute(input: TriageDocumentInput): Promise<AiPredictionResult> {
    if (!input || !input.emailData) {
      throw new Error("INVALID_TRIAGE_INPUT: Missing emailData in TriageDocumentAction input");
    }

    const aiService = input.aiAnalysisService || this.getAiAnalysisService();
    if (!aiService.triageEmail) {
      return {
        success: false,
        error: {
          code: "API_FAILURE",
          userMessage: "AiAnalysisService.triageEmail is not implemented"
        }
      };
    }

    return await aiService.triageEmail(input.emailData, input.messageId);
  }
}

/** Global default instance seam for TriageDocumentAction. */
var defaultTriageDocumentAction: TriageDocumentAction = new TriageDocumentAction();

if (typeof (globalThis as any).defaultTriageDocumentAction === "undefined") {
  (globalThis as any).defaultTriageDocumentAction = defaultTriageDocumentAction;
}

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TriageDocumentAction,
    defaultTriageDocumentAction
  };
}

(globalThis as any).TriageDocumentAction = TriageDocumentAction;
(globalThis as any).defaultTriageDocumentAction = defaultTriageDocumentAction;
