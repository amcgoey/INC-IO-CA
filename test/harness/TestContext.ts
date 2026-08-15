/**
 * @file TestContext.ts
 * @description Composite test harness container instantiating domain fakes with inspection and reset convenience methods.
 */

import { FakeLogRepository } from "./fakes/FakeLogRepository";
import { FakeDriveFilingRepository } from "./fakes/FakeDriveFilingRepository";
import { FakePdfDocumentService } from "./fakes/FakePdfDocumentService";
import { FakeAiAnalysisAdapter } from "./fakes/FakeAiAnalysisAdapter";

export interface TestContextOptions {
  logRepositorySettings?: Record<string, LogSettings>;
  driveFilingCustomPaths?: Record<string, string>;
  pdfFormActions?: Record<string, string | null>;
}

export class TestContext {
  public logRepository: FakeLogRepository;
  public driveFilingRepository: FakeDriveFilingRepository;
  public pdfDocumentService: FakePdfDocumentService;
  public aiAnalysisAdapter: FakeAiAnalysisAdapter;

  constructor(options: TestContextOptions = {}) {
    this.logRepository = new FakeLogRepository(options.logRepositorySettings);
    this.driveFilingRepository = new FakeDriveFilingRepository(options.driveFilingCustomPaths);
    this.pdfDocumentService = new FakePdfDocumentService(options.pdfFormActions);
    this.aiAnalysisAdapter = new FakeAiAnalysisAdapter();
  }

  resetAll(): void {
    this.logRepository.reset();
    this.driveFilingRepository.reset();
    this.pdfDocumentService.reset();
    this.aiAnalysisAdapter.reset();
  }

  getFiledDocuments(): Array<{ file: { fileId?: string; blob?: GoogleAppsScript.Base.Blob }; options: FilingOptions; result: FilingResult }> {
    return this.driveFilingRepository.filedDocuments;
  }

  getLoggedRows(): Array<{ spreadsheetId: string; headers: string[]; rowData: any[]; plan: RowInsertionPlan }> {
    return this.logRepository.insertedRows;
  }
}

export function createTestContext(options?: TestContextOptions): TestContext {
  return new TestContext(options);
}

declare let module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TestContext,
    createTestContext
  };
}
