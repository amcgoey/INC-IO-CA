/**
 * @file TriageDocumentAction.ts
 * @description DocumentAction implementation for AI email triage (TriageDocumentAction).
 *
 * Evaluates email header/body context using `AiAnalysisService.triageEmail` to predict project name and discipline.
 */

import { defaultAiAnalysisService } from './AiAnalysisService';

function resolveAiAnalysisService(): AiAnalysisService {
  if ((globalThis as any).defaultAiAnalysisService) return (globalThis as any).defaultAiAnalysisService;
  return defaultAiAnalysisService;
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
const defaultTriageDocumentAction: TriageDocumentAction = new TriageDocumentAction();

export {
  TriageDocumentAction,
  defaultTriageDocumentAction
};
