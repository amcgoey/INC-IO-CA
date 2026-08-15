/**
 * @file AdminFoldOutPresenter.test.ts
 * @description Unit tests for AdminFoldOutPresenter dispatch, SheetAdminFoldOut and TriageAdminFoldOut UI sections,
 * scoped ScriptCache eviction, _AuditLog event logging, and SpreadsheetBatchReadException error state card (Issue #220, Issue #224).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { GasMockHarness } from "./harness/GasMockHarness";
import { CardSerializer } from "./harness/CardSerializer";
import { AdminFoldOutPresenter, onFlushScriptCache, onSaveToJsonConfiguration, NO_SPECS_FOUND_ERROR } from "../src/adapters/gas/AdminFoldOutPresenter";
import { SpreadsheetBatchData } from "../src/adapters/gas/SpreadsheetBatchReaderAdapter";
import { GoogleSheetsDocumentTypeSpecAdapter } from "../src/adapters/gas/GoogleSheetsDocumentTypeSpecAdapter";
import type { DocumentTypeSpec } from "../src/core/specs/DocumentTypeSpec";
import type { DocumentLogWorkbookSpec } from "../src/core/config/DocumentLogWorkbookSpec";
import { buildSheetsRootCard } from "../src/adapters/gas/SheetsRootCard";
import { convertWorkbookSpecToBatchData } from "./harness/BatchDataConverter";
import { SpreadsheetBatchReadException } from "../src/adapters/gas/SpreadsheetBatchReaderAdapter";

describe("AdminFoldOutPresenter & SheetAdminFoldOut (Issue #220, #224)", () => {
  let harness: ReturnType<typeof GasMockHarness.install>;

  beforeEach(() => {
    harness = GasMockHarness.install();
  });

  afterEach(() => {
    GasMockHarness.uninstall();
  });

  it("dispatches SheetAdminFoldOut for GoogleSheets context and TriageAdminFoldOut for Gmail/GoogleDrive context", () => {
    // 1. GoogleSheets context
    const sheetSection = AdminFoldOutPresenter.renderAdminSection("GoogleSheets", { spreadsheetId: "wb-001" });
    const sheetCard = CardService.newCardBuilder().addSection(sheetSection).build();
    const sheetJson = CardSerializer.toJSON(sheetCard);

    assert.strictEqual(sheetJson.sections.length, 1);
    assert.ok(sheetJson.sections[0].header?.includes("Sheet Administration"));
    assert.ok(CardSerializer.hasWidgetText(sheetJson, "Configuration & Administrative Health"));
    assert.ok(CardSerializer.findButton(sheetJson, "Refresh Config Cache") || CardSerializer.findButton(sheetJson, "🔄 Refresh Config Cache"));

    // 2. Gmail context
    const gmailSection = AdminFoldOutPresenter.renderAdminSection("Gmail", {});
    const gmailCard = CardService.newCardBuilder().addSection(gmailSection).build();
    const gmailJson = CardSerializer.toJSON(gmailCard);

    assert.strictEqual(gmailJson.sections.length, 1);
    assert.ok(gmailJson.sections[0].header?.includes("Triage Administration"));
    assert.ok(CardSerializer.hasWidgetText(gmailJson, "Triage & Intake Cache Controls"));
    assert.ok(CardSerializer.findButton(gmailJson, "Reset Log Search Cache") || CardSerializer.findButton(gmailJson, "🔄 Reset Log Search Cache"));

    // 3. GoogleDrive context
    const driveSection = AdminFoldOutPresenter.renderAdminSection("GoogleDrive", {});
    const driveCard = CardService.newCardBuilder().addSection(driveSection).build();
    const driveJson = CardSerializer.toJSON(driveCard);

    assert.strictEqual(driveJson.sections.length, 1);
    assert.ok(driveJson.sections[0].header?.includes("Triage Administration"));
    assert.ok(CardSerializer.hasWidgetText(driveJson, "Triage & Intake Cache Controls"));
  });

  it("renders SheetAdminFoldOut as a collapsible section in SheetsRootCard", () => {
    const ss = harness.sheetsService.openById("wb-log-220");
    ss.insertSheet("_Config", [["MANIFEST_SCHEMA_VERSION", "1.2.0"]]);
    ss.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    ss.insertSheet("Submittal Arch", [["BUFFER_TOP"], ["Data1"], ["BUFFER_BOTTOM"]]);

    const card = buildSheetsRootCard({ spreadsheetId: "wb-log-220", sheetName: "Submittal Arch" });
    const cardJson = CardSerializer.toJSON(card);

    assert.strictEqual(cardJson.sections.length, 2);
    const foldOutSection = cardJson.sections[1];
    assert.ok(foldOutSection.header?.includes("Sheet Administration"));
    assert.strictEqual(foldOutSection.collapsible, true);
  });

  it("invalidates strictly DOC_CONFIG_<SpreadsheetId>_* ScriptCache entries without purging global drive search or AI triage caches on '🔄 Refresh Config Cache'", () => {
    const ss = harness.sheetsService.openById("wb-target-123");
    ss.insertSheet("_AuditLog");

    // Populate cache entries across different scopes
    const userCache = CacheService.getUserCache();
    userCache.put("DOC_CONFIG_wb-target-123_Submittal", JSON.stringify({ fields: [] }), 21600);
    userCache.put("_INDEX_DOC_CONFIG_wb-target-123", JSON.stringify(["DOC_CONFIG_wb-target-123_Submittal"]), 21600);

    userCache.put("log_search_drive_999_Submittal", JSON.stringify({ logId: "123" }), 21600);
    userCache.put("_INDEX_log_search_drive_999", JSON.stringify(["log_search_drive_999_Submittal"]), 21600);
    userCache.put("ai_triage_msg_456", JSON.stringify({ docType: "Submittal" }), 21600);

    // Verify cache items exist before purge
    assert.ok(userCache.get("DOC_CONFIG_wb-target-123_Submittal") !== null);
    assert.ok(userCache.get("log_search_drive_999_Submittal") !== null);
    assert.ok(userCache.get("ai_triage_msg_456") !== null);

    // Execute flush action handler
    const event = {
      sheetsContext: {
        spreadsheetId: "wb-target-123",
        sheetName: "Submittal Arch"
      }
    };
    const response = onFlushScriptCache(event);
    const actionJson = CardSerializer.actionResponseToJSON(response);

    assert.ok(actionJson.notification?.text?.includes("Workbook config cache purged"));

    // Assert target DOC_CONFIG entries flushed
    assert.strictEqual(userCache.get("DOC_CONFIG_wb-target-123_Submittal"), null);
    assert.strictEqual(userCache.get("_INDEX_DOC_CONFIG_wb-target-123"), null);

    // Assert unrelated drive search and AI triage caches remain intact
    assert.ok(userCache.get("log_search_drive_999_Submittal") !== null);
    assert.ok(userCache.get("ai_triage_msg_456") !== null);
  });

  it("logs CACHE_PURGE event to target workbook _AuditLog tab when cache is refreshed", () => {
    const ss = harness.sheetsService.openById("wb-audit-220");
    ss.insertSheet("_AuditLog");

    const event = {
      parameters: {
        spreadsheetId: "wb-audit-220"
      }
    };
    onFlushScriptCache(event);

    const auditSheet = ss.getSheetByName("_AuditLog");
    assert.ok(auditSheet);
    const data = auditSheet.getDataRange().getValues();

    // Row 1: Headers (Timestamp, Category, EventType, Actor, Status, Details)
    // Row 2: Audit entry
    assert.ok(data.length >= 2);
    const row = data[data.length - 1];

    assert.strictEqual(row[1], "CACHE_PURGE");
    assert.strictEqual(row[2], "CONFIG_CACHE_PURGED");
    assert.strictEqual(row[4], "SUCCESS");
    assert.ok(String(row[5]).includes("wb-audit-220"));
  });

  it("dispatches dedicated Error State Card on SpreadsheetBatchReadException", () => {
    const error = new SpreadsheetBatchReadException(
      "Advanced Sheets Service (v4) is un-enabled or unavailable in appsscript.json manifest.",
      "ss-123"
    );

    // Verify renderAdminSection correctly catches/dispatches error
    const section = AdminFoldOutPresenter.renderAdminSection("GoogleSheets", {
      spreadsheetId: "ss-123",
      error
    });
    assert.ok(section);

    const card = CardService.newCardBuilder().addSection(section).build();
    const serialized = CardSerializer.toJSON(card);
    const textJson = JSON.stringify(serialized);

    assert.match(textJson, /Advanced Sheets API Unavailable/i);
    assert.match(textJson, /appsscript\.json/i);
    assert.match(textJson, /Retry Audit/i);
  });
  it('renders Save to JSON Configuration button in SheetAdminFoldOut', () => {
    const sheetSection = AdminFoldOutPresenter.renderAdminSection('GoogleSheets', { spreadsheetId: 'wb-001' });
    const sheetCard = CardService.newCardBuilder().addSection(sheetSection).build();
    const sheetJson = CardSerializer.toJSON(sheetCard);

    assert.ok(
      CardSerializer.findButton(sheetJson, 'Save to JSON Configuration') ||
      CardSerializer.findButton(sheetJson, '💾 Save to JSON Configuration')
    );
  });

  it('onSaveToJsonConfiguration decompiles valid specs, serializes to JSON via JsonDocumentTypeSpecAdapter, and saves timestamped file to parent Google Drive folder', () => {
    const parentFolder = (globalThis as any).DriveApp.getFolderById('parent-folder-999');
    const fileId = 'wb-save-test-123';
    const virtualFile = (globalThis as any).DriveApp.getFileById(fileId);
    virtualFile.moveTo(parentFolder);

    const mockSpec: DocumentTypeSpec = {
      key: 'SUBMITTAL_ARCH',
      label: 'Submittal Arch',
      name: 'Architectural Submittals',
      identity: {
        format: '${section}-${number}-${revision}',
        groupFormat: '${section}-${number}',
        revisionGroupFormat: '${section}'
      },
      fields: [
        { key: 'status', label: 'Status', type: 'list', required: true },
        { key: 'section', label: 'Section', type: 'string' },
        { key: 'number', label: 'Number', type: 'string' }
      ],
      storage: [
        {
          type: 'drive',
          rootFolderSearchTerms: ['Submittals'],
          projectSearchTerms: ['Project Alpha'],
          closedRootFolderName: 'Closed',
          closedSubfolderFormat: 'Closed/${section}',
          filenamePrefix: 'SUB-ARCH',
          filenameFormat: '${section}-${number}'
        }
      ],
      workflows: [
        {
          context: 'INCOMING',
          sequence: ['extractPages', 'log']
        }
      ]
    };

    const compiledWorkbook = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSpec]);
    const batchData = convertWorkbookSpecToBatchData(compiledWorkbook, fileId);
    const batchReader = {
      readWorkbookBatch: () => batchData
    } as unknown as SpreadsheetBatchReaderAdapter;

    const event = {
      parameters: {
        spreadsheetId: fileId
      }
    };

    const response = onSaveToJsonConfiguration(event, { batchReader });
    const actionJson = CardSerializer.actionResponseToJSON(response);

    assert.ok(actionJson.notification?.text?.includes('Saved 1 configuration file(s) to Google Drive'));

    const files = parentFolder.getFiles();
    const allFiles: any[] = [];
    while (files.hasNext()) {
      allFiles.push(files.next());
    }
    const savedFile = allFiles.find((f: any) => f.getName().startsWith('submittal_arch_spec_') && f.getName().endsWith('.json'));
    assert.ok(savedFile, 'Expected saved submittal_arch_spec_*.json file in parent folder');

    const parsed = JSON.parse(savedFile.getBlob().getDataAsString());
    assert.strictEqual(parsed.key, 'SUBMITTAL_ARCH');
    assert.strictEqual(parsed.name, 'Architectural Submittals');
  });

  it('onSaveToJsonConfiguration handles decompilation validation errors gracefully without crashing', () => {
    const fileId = 'wb-invalid-spec';
    const ss = harness.sheetsService.openById(fileId);
    ss.insertSheet('_Config', [['MANIFEST_SCHEMA_VERSION', '1.2.0']]);
    ss.setNamedRange('MANIFEST_SCHEMA_VERSION', '_Config', 'A1:B1');

    const parentFolder = (globalThis as any).DriveApp.getFolderById('parent-folder-888');
    const virtualFile = (globalThis as any).DriveApp.getFileById(fileId);
    virtualFile.moveTo(parentFolder);

    const batchReader = {
      readWorkbookBatch: () => ({
        spreadsheetId: fileId,
        namedRanges: [],
        sheets: [
          {
            properties: { sheetId: 1, title: '_Config' },
            data: [{ rowData: [{ values: [{ userEnteredValue: { stringValue: 'MANIFEST_SCHEMA_VERSION' } }] }] }]
          }
        ]
      })
    } as unknown as SpreadsheetBatchReaderAdapter;

    const event = {
      parameters: {
        spreadsheetId: fileId
      }
    };

    const response = onSaveToJsonConfiguration(event, { batchReader });
    const actionJson = CardSerializer.actionResponseToJSON(response);

    assert.ok(actionJson.notification?.text?.includes('Decompilation failed'));
    assert.ok(actionJson.navigation?.card, 'Expected updated card in navigation on validation error');
    const navCard = CardSerializer.toJSON(actionJson.navigation?.card);
    assert.ok(CardSerializer.hasWidgetText(navCard, 'Spec Configuration Errors'));
    const files = parentFolder.getFiles();
    const jsonFiles: any[] = [];
    while (files.hasNext()) {
      const f = files.next();
      if (f.getName().endsWith('.json')) {
        jsonFiles.push(f);
      }
    }
    assert.strictEqual(jsonFiles.length, 0, 'No JSON files should be created on validation failure');
  });

  it('onSaveToJsonConfiguration dispatches dedicated Error State Card when SpreadsheetBatchReadException occurs', () => {
    const fileId = 'wb-batch-error';
    const batchReader = {
      readWorkbookBatch: () => {
        throw new SpreadsheetBatchReadException('Advanced Sheets API disabled', fileId);
      }
    } as unknown as SpreadsheetBatchReaderAdapter;

    const event = {
      parameters: {
        spreadsheetId: fileId
      }
    };

    const response = onSaveToJsonConfiguration(event, { batchReader });
    const actionJson = CardSerializer.actionResponseToJSON(response);

    assert.ok(actionJson.notification?.text?.includes('Advanced Sheets API Unavailable'));
  });

  it('onSaveToJsonConfiguration logs SPEC_SAVED_TO_JSON telemetry event to _AuditLog tab', () => {
    const ss = harness.sheetsService.openById('wb-telemetry-123');
    ss.insertSheet('_AuditLog');

    const parentFolder = (globalThis as any).DriveApp.getFolderById('parent-folder-777');
    const virtualFile = (globalThis as any).DriveApp.getFileById('wb-telemetry-123');
    virtualFile.moveTo(parentFolder);

    const mockSpec: DocumentTypeSpec = {
      key: 'SUBMITTAL_FFE',
      label: 'Submittal FFE',
      name: 'FF&E Submittals',
      identity: {
        format: '${specTag}-${revision}',
        groupFormat: '${specTag}',
        revisionGroupFormat: '${specTag}'
      },
      fields: [
        { key: 'status', label: 'Status', type: 'list', required: true },
        { key: 'specTag', label: 'Spec Tag', type: 'string' }
      ],
      storage: [
        {
          type: 'drive',
          rootFolderSearchTerms: ['FFE'],
          projectSearchTerms: ['Project Alpha'],
          closedRootFolderName: 'Closed',
          closedSubfolderFormat: 'Closed/${specTag}',
          filenamePrefix: 'SUB-FFE',
          filenameFormat: '${specTag}'
        }
      ],
      workflows: [
        {
          context: 'INCOMING',
          sequence: ['log']
        }
      ]
    };

    const compiledWorkbook = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec([mockSpec]);
    const batchData = convertWorkbookSpecToBatchData(compiledWorkbook, 'wb-telemetry-123');
    const batchReader = {
      readWorkbookBatch: () => batchData
    } as unknown as SpreadsheetBatchReaderAdapter;

    const event = {
      parameters: {
        spreadsheetId: 'wb-telemetry-123'
      }
    };

    onSaveToJsonConfiguration(event, { batchReader });

    const auditSheet = ss.getSheetByName('_AuditLog');
    assert.ok(auditSheet);
    const data = auditSheet.getDataRange().getValues();
    assert.ok(data.length >= 2);
    const row = data[data.length - 1];

    assert.strictEqual(row[1], 'ADMIN_ACTION');
    assert.strictEqual(row[2], 'SPEC_SAVED_TO_JSON');
    assert.strictEqual(row[4], 'SUCCESS');
    assert.ok(String(row[5]).includes('wb-telemetry-123'));
    assert.ok(String(row[5]).includes('submittal_ffe_spec_'));
  });

  it("renders dedicated Spec Configuration Errors block in SheetAdminFoldOut when specValidationReport contains invalid specs", () => {
    const invalidReport = [
      {
        status: 'invalid' as const,
        errors: [
          "Missing or empty required property 'key'",
          "Duplicate field key 'status' detected",
          "Calculated field 'calcTitle' must specify 'calcFormat' or 'formulaOrFunction'"
        ]
      }
    ];

    const sheetSection = AdminFoldOutPresenter.renderAdminSection('GoogleSheets', {
      spreadsheetId: 'wb-errors-001',
      specValidationReport: invalidReport
    });
    const sheetCard = CardService.newCardBuilder().addSection(sheetSection).build();
    const sheetJson = CardSerializer.toJSON(sheetCard);

    assert.ok(CardSerializer.hasWidgetText(sheetJson, 'Spec Configuration Errors'));
    assert.ok(CardSerializer.hasWidgetText(sheetJson, "Missing or empty required property 'key'"));
    assert.ok(CardSerializer.hasWidgetText(sheetJson, "Duplicate field key 'status' detected"));
    assert.ok(CardSerializer.hasWidgetText(sheetJson, "Calculated field 'calcTitle' must specify 'calcFormat' or 'formulaOrFunction'"));
    assert.ok(CardSerializer.hasWidgetText(sheetJson, '_Config'));
  });

  it('renders both Schema Health Report (drift) and Spec Configuration Errors (domain) concurrently without interference', () => {
    const driftReport: TemplateDriftReport = {
      status: 'MINOR_DRIFT',
      codeSchemaVersion: '1.2.0',
      liveSchemaVersion: '1.2.0',
      issues: [
        {
          category: 'NAMED_RANGE',
          severity: 'WARN',
          description: 'Missing named range Vendors on _Shared tab',
          autoPatchable: true
        }
      ],
      canAutoPatch: true
    };

    const invalidReport = [
      {
        status: 'invalid' as const,
        errors: ["Field 'status' picklistSource references non-existent supportDataKey 'Statuses'"]
      }
    ];

    const sheetSection = AdminFoldOutPresenter.renderAdminSection('GoogleSheets', {
      spreadsheetId: 'wb-dual-report-001',
      auditReport: driftReport,
      specValidationReport: invalidReport
    });
    const sheetCard = CardService.newCardBuilder().addSection(sheetSection).build();
    const sheetJson = CardSerializer.toJSON(sheetCard);

    assert.ok(CardSerializer.hasWidgetText(sheetJson, 'Schema Health Report'));
    assert.ok(CardSerializer.hasWidgetText(sheetJson, 'MINOR_DRIFT'));
    assert.ok(CardSerializer.hasWidgetText(sheetJson, 'Missing named range Vendors on _Shared tab'));
    assert.ok(CardSerializer.findButton(sheetJson, 'Auto-Patch Workbook') || CardSerializer.findButton(sheetJson, '🛠️ Auto-Patch Workbook'));

    assert.ok(CardSerializer.hasWidgetText(sheetJson, 'Spec Configuration Errors'));
    assert.ok(CardSerializer.hasWidgetText(sheetJson, "Field 'status' picklistSource references non-existent supportDataKey 'Statuses'"));
  });
  it('onSaveToJsonConfiguration updates card UI with multi-error Spec Configuration Errors report when decompilation fails', () => {
    const fileId = 'wb-multi-errors';
    const ss = harness.sheetsService.openById(fileId);
    ss.insertSheet('_Config', [['MANIFEST_SCHEMA_VERSION', '1.2.0']]);
    ss.setNamedRange('MANIFEST_SCHEMA_VERSION', '_Config', 'A1:B1');

    const multiErrorReport = [
      {
        status: 'invalid' as const,
        errors: [
          "Missing or empty required property 'key'",
          "Duplicate field key 'status' detected",
          "Calculated field 'calcTitle' must specify 'calcFormat' or 'formulaOrFunction'"
        ]
      }
    ];

    const batchReader = {
      readWorkbookBatch: () => ({
        spreadsheetId: fileId,
        namedRanges: [],
        sheets: []
      })
    } as unknown as SpreadsheetBatchReaderAdapter;

    const originalDecompile = GoogleSheetsDocumentTypeSpecAdapter.decompile;
    GoogleSheetsDocumentTypeSpecAdapter.decompile = () => multiErrorReport;

    try {
      const event = {
        parameters: {
          spreadsheetId: fileId
        }
      };

      const response = onSaveToJsonConfiguration(event, { batchReader });
      const actionJson = CardSerializer.actionResponseToJSON(response);

      assert.ok(actionJson.notification?.text?.includes('Decompilation failed'));
      assert.ok(actionJson.navigation?.card);
      const navCard = CardSerializer.toJSON(actionJson.navigation?.card);
      assert.ok(CardSerializer.hasWidgetText(navCard, 'Spec Configuration Errors'));
      assert.ok(CardSerializer.hasWidgetText(navCard, "Missing or empty required property 'key'"));
      assert.ok(CardSerializer.hasWidgetText(navCard, "Duplicate field key 'status' detected"));
      assert.ok(CardSerializer.hasWidgetText(navCard, "Calculated field 'calcTitle' must specify 'calcFormat' or 'formulaOrFunction'"));
    } finally {
      GoogleSheetsDocumentTypeSpecAdapter.decompile = originalDecompile;
    }
  });

  it('onSaveToJsonConfiguration handles empty decompilation results by presenting invalid error card', () => {
    const fileId = 'wb-empty-specs';
    const ss = harness.sheetsService.openById(fileId);
    ss.insertSheet('_Config', [['MANIFEST_SCHEMA_VERSION', '1.2.0']]);
    ss.setNamedRange('MANIFEST_SCHEMA_VERSION', '_Config', 'A1:B1');

    const batchReader = {
      readWorkbookBatch: () => ({
        spreadsheetId: fileId,
        namedRanges: [],
        sheets: []
      })
    } as unknown as SpreadsheetBatchReaderAdapter;

    const originalDecompile = GoogleSheetsDocumentTypeSpecAdapter.decompile;
    GoogleSheetsDocumentTypeSpecAdapter.decompile = () => [];

    try {
      const event = {
        parameters: {
          spreadsheetId: fileId
        }
      };

      const response = onSaveToJsonConfiguration(event, { batchReader });
      const actionJson = CardSerializer.actionResponseToJSON(response);

      assert.ok(actionJson.notification?.text?.includes('Decompilation failed'));
      assert.ok(actionJson.navigation?.card);
      const navCard = CardSerializer.toJSON(actionJson.navigation?.card);
      assert.ok(CardSerializer.hasWidgetText(navCard, 'Spec Configuration Errors'));
      assert.ok(CardSerializer.hasWidgetText(navCard, NO_SPECS_FOUND_ERROR));
    } finally {
      GoogleSheetsDocumentTypeSpecAdapter.decompile = originalDecompile;
    }
  });
});
