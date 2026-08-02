/// <reference path="./types.ts" />
/**
 * @file DocumentTypeConfigRegistry.ts
 * @description Central application registry managing DocumentTypeConfig instances by document type name.
 */

const DEFAULT_SUBMITTAL_CONFIG: DocumentTypeConfig = {
  documentType: 'Submittal',
  rootFolderSearchTerms: ['Submittals', 'Submittal'],
  projectSearchTerms: ['Submittals', 'Submittal'],
  closedRootFolderName: 'Closed',
  closedSubfolderMap: {
    Architecture: 'Architecture',
    'FF&E': 'FFE'
  },
  filenamePrefix: '_',
  coverPageTemplateId: '',
  logSearchTerms: ['submittal log', 'submittal'],
  logSheetName: 'Log',
  logParentFolderTerms: ['Submittals'],
  logAdapterKey: 'GoogleSheetsLogRepository',
  filingAdapterKey: 'GoogleDriveFilingRepository',
  pdfAdapterKey: 'PdfDocumentService',
  aiAdapterKey: 'GeminiAiAnalysisAdapter'
};

export class DocumentTypeConfigRegistry {
  private configs: Map<string, DocumentTypeConfig>;

  constructor() {
    this.configs = new Map<string, DocumentTypeConfig>();
    this.reset();
  }

  /**
   * Registers a DocumentTypeConfig instance in the registry.
   */
  public registerConfig(config: DocumentTypeConfig): void {
    if (!config || !config.documentType) {
      throw new Error('Invalid DocumentTypeConfig: documentType is required');
    }
    this.configs.set(config.documentType, config);
  }

  /**
   * Retrieves a DocumentTypeConfig by document type name.
   */
  public getConfig(documentType: string): DocumentTypeConfig {
    const config = this.configs.get(documentType);
    if (!config) {
      throw new Error('DocumentTypeConfig not registered for document type: ' + documentType);
    }
    return config;
  }

  /**
   * Checks if a DocumentTypeConfig is registered for a given document type.
   */
  public hasConfig(documentType: string): boolean {
    return this.configs.has(documentType);
  }

  /**
   * Resets the registry back to default state (pre-configured for Submittal).
   */
  public reset(): void {
    this.configs.clear();
    this.registerConfig({ ...DEFAULT_SUBMITTAL_CONFIG });
  }
}

export const defaultDocumentTypeConfigRegistry = new DocumentTypeConfigRegistry();

declare var module: any;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DocumentTypeConfigRegistry,
    defaultDocumentTypeConfigRegistry
  };
}
