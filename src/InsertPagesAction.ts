/// <reference path="./types.ts" />
/**
 * @file InsertPagesAction.ts
 * @description DocumentAction implementation for prepending cover sheet pages onto PDF blobs.
 *
 * Delegates to PdfDocumentService.stampSubmittal() into a primitive DocumentAction handler.
 * Adheres to execute(context: DocumentActionContext): Promise<DocumentActionContext>.
 */

declare let defaultPdfDocumentService: PdfDocumentService;

/**
 * Primitive workflow action that prepends CoverPageDocument onto a PDF blob
 * by delegating to PdfDocumentService.stampSubmittal().
 */
class InsertPagesAction implements DocumentAction<DocumentActionContext> {
  name: string = "InsertPages";

  /**
   * Executes the cover page insertion action.
   * Performs fail-fast early guard validation on required context fields (`blob`) and `pdfService` adapter.
   *
   * @param context - Target DocumentActionContext.
   * @returns Promise resolving to updated DocumentActionContext containing stamped blob.
   */
  async execute(context: DocumentActionContext): Promise<DocumentActionContext> {
    if (!context) {
      throw new Error("InsertPagesAction requires context");
    }

    const blob = context.blob || (context as any).sourceBlob;
    if (!blob) {
      throw new Error("InsertPagesAction requires 'blob' in context");
    }

    const pdfService =
      context.adapters?.pdfService ||
      context.adapters?.pdfDocumentService ||
      context.pdfService ||
      context.pdfDocumentService ||
      (typeof defaultPdfDocumentService !== "undefined" ? defaultPdfDocumentService : (globalThis as any).defaultPdfDocumentService);

    if (!pdfService) {
      throw new Error("InsertPagesAction requires 'pdfService' adapter in context.adapters");
    }

    const coverPageTemplateId =
      context.coverPageTemplateId ||
      context.config?.coverPageTemplateId ||
      context.options?.templateId ||
      "";

    const analysis = context.analysis;
    const validatedDoc = context.validatedDoc;

    const data: ParsedData = context.data || (validatedDoc ? {
      title: validatedDoc.disciplineDetails?.discipline === 'Architecture'
        ? validatedDoc.disciplineDetails.title
        : validatedDoc.disciplineDetails?.specTitle,
      action: validatedDoc.action,
      section: validatedDoc.disciplineDetails?.discipline === 'Architecture'
        ? validatedDoc.disciplineDetails.section
        : undefined,
      number: validatedDoc.disciplineDetails?.discipline === 'Architecture'
        ? validatedDoc.disciplineDetails.number
        : undefined,
      revision: validatedDoc.disciplineDetails?.revision
    } : (analysis ? {
      title: analysis.predictedTitle,
      action: analysis.predictedAction,
      section: analysis.predictedSection,
      number: analysis.predictedNumber,
      revision: analysis.predictedRevision
    } : {}));

    const stampOptions: StampOptions = context.options || {
      newFileName: context.newFileName || "Stamped_Submittal",
      stampSubmittalNo: context.stampSubmittalNo || `${data.section || '000000'}-${data.number || '000'}-${data.revision || '0'}`,
      templateId: coverPageTemplateId
    };

    let stampedBlob: GoogleAppsScript.Base.Blob;
    try {
      stampedBlob = await pdfService.stampSubmittal(blob, data, stampOptions);
    } catch (err: any) {
      if (err && err.message === "TEMPLATE_MISSING") {
        stampedBlob = blob.copyBlob ? blob.copyBlob() : blob;
      } else {
        throw err;
      }
    }

    return {
      ...context,
      blob: stampedBlob
    };
  }
}

/** Global default instance seam for InsertPagesAction. */
const defaultInsertPagesAction: InsertPagesAction = new InsertPagesAction();

if (typeof (globalThis as any).defaultInsertPagesAction === "undefined") {
  (globalThis as any).defaultInsertPagesAction = defaultInsertPagesAction;
}

declare let module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    InsertPagesAction,
    defaultInsertPagesAction
  };
}

(globalThis as any).InsertPagesAction = InsertPagesAction;
(globalThis as any).defaultInsertPagesAction = defaultInsertPagesAction;