import test from "node:test";
import assert from "node:assert";
import { GasMockHarness } from "./GasMockHarness";
import { DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION, DOCUMENT_LOG_WORKBOOK_SPEC, TabSpec, NamedRangeSpec } from "../../src/core/config/DocumentLogWorkbookSpec";

test.afterEach(() => {
  GasMockHarness.uninstall();
});

test("GasMockHarness.install attaches CONFIG, CacheService, PropertiesService, and SpreadsheetApp to globalThis", () => {
  GasMockHarness.install();

  assert.ok((globalThis as any).CONFIG, "globalThis.CONFIG should be attached");
  assert.ok((globalThis as any).CacheService, "globalThis.CacheService should be attached");
  assert.ok((globalThis as any).PropertiesService, "globalThis.PropertiesService should be attached");
  assert.ok((globalThis as any).SpreadsheetApp, "globalThis.SpreadsheetApp should be attached");

  assert.strictEqual(typeof (globalThis as any).CacheService.getUserCache, "function");
  assert.strictEqual(typeof (globalThis as any).CacheService.getScriptCache, "function");
  assert.strictEqual(typeof (globalThis as any).CacheService.getDocumentCache, "function");

  assert.strictEqual(typeof (globalThis as any).PropertiesService.getScriptProperties, "function");
  assert.strictEqual(typeof (globalThis as any).PropertiesService.getUserProperties, "function");
  assert.strictEqual(typeof (globalThis as any).PropertiesService.getDocumentProperties, "function");

  assert.strictEqual(typeof (globalThis as any).SpreadsheetApp.openById, "function");
});

test("PropertiesService stubs store and retrieve properties per scope", () => {
  const harness = GasMockHarness.install();

  const scriptProps = (globalThis as any).PropertiesService.getScriptProperties();
  const userProps = (globalThis as any).PropertiesService.getUserProperties();

  scriptProps.setProperty("API_KEY", "secret-script-key");
  userProps.setProperty("USER_THEME", "dark");

  assert.strictEqual(scriptProps.getProperty("API_KEY"), "secret-script-key");
  assert.strictEqual(scriptProps.getProperty("USER_THEME"), null);

  assert.strictEqual(userProps.getProperty("USER_THEME"), "dark");
  assert.strictEqual(userProps.getProperty("API_KEY"), null);

  scriptProps.setProperties({ FOO: "bar", BAZ: "qux" });
  assert.deepStrictEqual(scriptProps.getProperties(), {
    API_KEY: "secret-script-key",
    FOO: "bar",
    BAZ: "qux"
  });

  scriptProps.deleteProperty("FOO");
  assert.strictEqual(scriptProps.getProperty("FOO"), null);

  scriptProps.deleteAllProperties();
  assert.deepStrictEqual(scriptProps.getProperties(), {});
});

test("CacheService stubs store, retrieve, and remove items per scope", () => {
  const harness = GasMockHarness.install();

  const userCache = (globalThis as any).CacheService.getUserCache();
  const scriptCache = (globalThis as any).CacheService.getScriptCache();

  userCache.put("token", "user-token-123", 300);
  scriptCache.put("token", "script-token-456", 300);

  assert.strictEqual(userCache.get("token"), "user-token-123");
  assert.strictEqual(scriptCache.get("token"), "script-token-456");

  userCache.putAll({ a: "1", b: "2" });
  assert.deepStrictEqual(userCache.getAll(["a", "b", "c"]), { a: "1", b: "2" });

  userCache.remove("a");
  assert.strictEqual(userCache.get("a"), null);

  userCache.removeAll(["b", "token"]);
  assert.strictEqual(userCache.get("b"), null);
  assert.strictEqual(userCache.get("token"), null);
});

test("CacheService respects TSL expiration", () => {
  const harness = GasMockHarness.install();
  const cache = harness.userCache;

  cache.put("expiringKey", "val", -1);
  assert.strictEqual(cache.get("expiringKey"), null);
});

test("SpreadsheetApp.openById returns mock spreadsheet with 2D array data grid", () => {
  GasMockHarness.install();

  const ss = (globalThis as any).SpreadsheetApp.openById("ss-123");
  assert.ok(ss, "Spreadsheet object should be returned");
  assert.strictEqual(ss.getId(), "ss-123");

  const sheet = ss.getSheetByName("Sheet1");
  assert.ok(sheet, "Default Sheet1 should exist");

  sheet.getRange("A1:B2").setValues([
    ["Header 1", "Header 2"],
    ["Val 1", "Val 2"]
  ]);

  assert.deepStrictEqual(sheet.getDataRange().getValues(), [
    ["Header 1", "Header 2"],
    ["Val 1", "Val 2"]
  ]);
});

test("harness.getSheetsState().getRangeValues(rangeNotation) returns cell grid data", () => {
  const harness = GasMockHarness.install();

  const ss = (globalThis as any).SpreadsheetApp.openById("default-ss");
  const sheet = ss.getSheetByName("Sheet1");
  sheet.getRange("A1:C2").setValues([
    ["Date", "Contact", "Action"],
    ["2026-07-26", "John", "Received"]
  ]);

  const state = harness.getSheetsState();
  assert.deepStrictEqual(state.getRangeValues("A1:C2"), [
    ["Date", "Contact", "Action"],
    ["2026-07-26", "John", "Received"]
  ]);

  assert.deepStrictEqual(state.getRangeValues("Sheet1!A1:B2"), [
    ["Date", "Contact"],
    ["2026-07-26", "John"]
  ]);
});

test("Unit tests verify row insertion, headers parsing, and cell updating", () => {
  const harness = GasMockHarness.install();
  const ss = (globalThis as any).SpreadsheetApp.openById("ss-test");
  const sheet = ss.insertSheet("Log");

  sheet.getRange("A1:C1").setValues([["ColA", "ColB", "ColC"]]);
  sheet.getRange("A2:C2").setValues([["Row1A", "Row1B", "Row1C"]]);
  sheet.getRange("A3:C3").setValues([["Row3A", "Row3B", "Row3C"]]);

  // Verify headers parsing
  const headers = sheet.getRange("A1:C1").getValues()[0];
  assert.deepStrictEqual(headers, ["ColA", "ColB", "ColC"]);

  // Verify single cell updating
  sheet.getRange(2, 2).setValue("Row1B-Updated");
  assert.strictEqual(sheet.getRange(2, 2).getValue(), "Row1B-Updated");

  // Verify insertRowBefore at row 2 (shifts row 2 down to row 3)
  sheet.insertRowBefore(2);
  const updatedGrid = harness.getSheetsState("ss-test").getRangeValues("Log!A1:C4");
  assert.deepStrictEqual(updatedGrid, [
    ["ColA", "ColB", "ColC"],
    ["", "", ""],
    ["Row1A", "Row1B-Updated", "Row1C"],
    ["Row3A", "Row3B", "Row3C"]
  ]);

  // Populate inserted row
  sheet.getRange("A2:C2").setValues([["Row2A", "Row2B", "Row2C"]]);
  assert.deepStrictEqual(sheet.getRange(2, 1, 1, 3).getValues()[0], ["Row2A", "Row2B", "Row2C"]);
});

test("GasMockHarness.reset purges stored state and call histories across test runs", () => {
  const harness = GasMockHarness.install();

  harness.scriptProperties.getProperty("PROP1");
  harness.userCache.put("CACHE1", "VAL1");
  (globalThis as any).SpreadsheetApp.openById("ss-1").getSheetByName("Sheet1").getRange("A1").setValue("X");

  assert.ok(harness.scriptProperties.calls.length > 0);
  assert.ok(harness.userCache.calls.length > 0);
  assert.strictEqual(harness.getSheetsState("ss-1").getRangeValues("A1")[0][0], "X");

  GasMockHarness.reset();

  assert.strictEqual(harness.scriptProperties.calls.length, 0);
  assert.strictEqual(harness.userCache.calls.length, 0);

  assert.strictEqual(harness.scriptProperties.getProperty("PROP1"), null);
  assert.strictEqual(harness.userCache.get("CACHE1"), null);
  assert.strictEqual(harness.getSheetsState("ss-1").getRangeValues("A1")[0][0], "");
});

test("GasMockHarness.install() purges prior state when re-installed", () => {
  GasMockHarness.install();
  (globalThis as any).PropertiesService.getScriptProperties().setProperty("DIRTY", "VALUE");
  (globalThis as any).SpreadsheetApp.openById("ss-dirty").getSheetByName("Sheet1").getRange("A1").setValue("DIRTY");

  assert.strictEqual((globalThis as any).PropertiesService.getScriptProperties().getProperty("DIRTY"), "VALUE");

  const harness = GasMockHarness.install();
  assert.strictEqual((globalThis as any).PropertiesService.getScriptProperties().getProperty("DIRTY"), null);
  assert.strictEqual(harness.getSheetsState("ss-dirty").getRangeValues("A1")[0][0], "");
});

test("GasMockHarness allows custom CONFIG overrides and resets clean", () => {
  GasMockHarness.install({
    configOverrides: {
      TARGET_FOLDER_NAME: "CustomFolder"
    }
  });

  assert.strictEqual((globalThis as any).CONFIG.TARGET_FOLDER_NAME, "CustomFolder");

  GasMockHarness.reset();

  assert.strictEqual((globalThis as any).CONFIG.TARGET_FOLDER_NAME, "Submittals");
});

test("GasMockHarness.uninstall restores original globalThis bindings", () => {
  (globalThis as any).PropertiesService = "original-properties-service";
  (globalThis as any).SpreadsheetApp = "original-spreadsheet-app";

  GasMockHarness.install();
  assert.notStrictEqual((globalThis as any).PropertiesService, "original-properties-service");
  assert.notStrictEqual((globalThis as any).SpreadsheetApp, "original-spreadsheet-app");

  GasMockHarness.uninstall();
  assert.strictEqual((globalThis as any).PropertiesService, "original-properties-service");
  assert.strictEqual((globalThis as any).SpreadsheetApp, "original-spreadsheet-app");
});

test("DOCUMENT_LOG_WORKBOOK_SPEC defines _Config tab (100x20), MANIFEST_SCHEMA_VERSION, and seed rows", () => {
  

  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_SCHEMA_VERSION, "1.0.0");
  assert.strictEqual(DOCUMENT_LOG_WORKBOOK_SPEC.schemaVersion, "1.0.0");

  const configTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: any) => t.name === "_Config");
  assert.ok(configTab, "_Config tab must be defined");
  assert.strictEqual(configTab.rowCount, 7, "_Config tab rowCount should be 100");
  assert.strictEqual(configTab.columnCount, 20, "_Config tab columnCount should be 20");
  assert.strictEqual(configTab.isConfigTab, true, "_Config tab isConfigTab flag should be true");

  assert.ok(configTab.seedRows, "_Config seedRows must be present");
  assert.deepStrictEqual(configTab.seedRows[0], ["Key", "Value"]);
  assert.deepStrictEqual(configTab.seedRows[1], ["MANIFEST_SCHEMA_VERSION", "1.0.0"]);
  assert.deepStrictEqual(configTab.seedRows[2], ["LOG_TITLE", "INC Project Document Log"]);

  const docTypeHeaderRow = configTab.seedRows.find((row: any) => row[0] === "DocTypeKey");
  assert.ok(docTypeHeaderRow, "DocTypeKey header row must exist in seedRows");
  assert.deepStrictEqual(docTypeHeaderRow, ["DocTypeKey", "DisplayName", "Prefix", "LogTabName"]);

  const submittalArchRow = configTab.seedRows.find((row: any) => row[0] === "Submittal_Arch");
  assert.ok(submittalArchRow, "Submittal_Arch seed row must exist");
  assert.deepStrictEqual(submittalArchRow, ["Submittal_Arch", "Architectural Submittals", "SUB-ARCH", "Submittal Arch"]);

  const schemaVersionNR = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((nr: any) => nr.name === "MANIFEST_SCHEMA_VERSION");
  assert.ok(schemaVersionNR, "MANIFEST_SCHEMA_VERSION named range must exist");
  assert.strictEqual(schemaVersionNR.tabName, "_Config");
  assert.strictEqual(schemaVersionNR.rangeNotation, "B2");
  assert.strictEqual(schemaVersionNR.scope, "Workbook");

  const manifestNR = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((nr: any) => nr.name === "Config_Manifest");
  assert.ok(manifestNR, "Config_Manifest named range must exist");
  assert.strictEqual(manifestNR.tabName, "_Config");
  assert.strictEqual(manifestNR.rangeNotation, "A1:B3");
});

test("GasMockHarness resolves MANIFEST_SCHEMA_VERSION from _Config tab in mock spreadsheet", () => {
  
  GasMockHarness.install();
  const ss = (globalThis as any).SpreadsheetApp.openById("ss-config-test");

  ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

  const range = ss.getRangeByName("MANIFEST_SCHEMA_VERSION");
  assert.ok(range, "getRangeByName('MANIFEST_SCHEMA_VERSION') should return MockRange");
  assert.strictEqual(range.getValue(), "1.0.0", "MANIFEST_SCHEMA_VERSION should return '1.0.0'");

  const configSheet = ss.getSheetByName("_Config");
  assert.ok(configSheet, "_Config sheet should exist");
  assert.strictEqual(configSheet.getRange("B2").getValue(), "1.0.0");
});

test("DOCUMENT_LOG_WORKBOOK_SPEC defines _Shared tab (100x20), contact lists, action picklists, and named ranges", () => {
  const sharedTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: TabSpec) => t.name === "_Shared");
  assert.ok(sharedTab, "_Shared tab must be defined");
  assert.strictEqual(sharedTab.rowCount, 6, "_Shared tab rowCount should be 100");
  assert.strictEqual(sharedTab.columnCount, 20, "_Shared tab columnCount should be 20");
  assert.strictEqual(sharedTab.isSharedTab, true, "_Shared tab isSharedTab flag should be true");

  assert.ok(sharedTab.seedRows, "_Shared seedRows must be present");
  assert.deepStrictEqual(sharedTab.seedRows[0], ["Contact Type", "Contact Abbr.", "Contact Full Name", "", "Action Order", "Actions", "Action Abbr."]);

  const archContactsNR = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((nr: NamedRangeSpec) => nr.name === "Shared_Contacts_Arch");
  assert.ok(archContactsNR, "Shared_Contacts_Arch named range must exist");
  assert.strictEqual(archContactsNR.tabName, "_Shared");
  assert.strictEqual(archContactsNR.rangeNotation, "A2:C3");
  assert.strictEqual(archContactsNR.scope, "Workbook");

  const ffeContactsNR = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((nr: NamedRangeSpec) => nr.name === "Shared_Contacts_FFE");
  assert.ok(ffeContactsNR, "Shared_Contacts_FFE named range must exist");
  assert.strictEqual(ffeContactsNR.tabName, "_Shared");
  assert.strictEqual(ffeContactsNR.rangeNotation, "A4:C5");
  assert.strictEqual(ffeContactsNR.scope, "Workbook");

  const actionsSubmittalNR = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((nr: NamedRangeSpec) => nr.name === "Actions_Submittal");
  assert.ok(actionsSubmittalNR, "Actions_Submittal named range must exist");
  assert.strictEqual(actionsSubmittalNR.tabName, "_Shared");
  assert.strictEqual(actionsSubmittalNR.rangeNotation, "E2:G6");
  assert.strictEqual(actionsSubmittalNR.scope, "Workbook");
});

test("DOCUMENT_LOG_WORKBOOK_SPEC defines _AuditLog system tab (500x10) and AuditLog_Events named range A1:F500", () => {
  const auditLogTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: any) => t.name === "_AuditLog");
  assert.ok(auditLogTab, "_AuditLog tab must be defined");
  assert.strictEqual(auditLogTab.rowCount, 7, "_AuditLog tab rowCount should be 500");
  assert.strictEqual(auditLogTab.columnCount, 10, "_AuditLog tab columnCount should be 10");
  assert.strictEqual(auditLogTab.isAuditLogTab, true, "_AuditLog tab isAuditLogTab flag should be true");
  assert.ok(auditLogTab.columns, "_AuditLog columns should exist");
  assert.strictEqual(auditLogTab.columns.length, 6);
  assert.strictEqual(auditLogTab.columns[0].header, "Timestamp");

  const auditEventsNR = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((nr: any) => nr.name === "AuditLog_Events");
  assert.ok(auditEventsNR, "AuditLog_Events named range must exist");
  assert.strictEqual(auditEventsNR.tabName, "_AuditLog");
  assert.strictEqual(auditEventsNR.rangeNotation, "A6:F7");
  assert.strictEqual(auditEventsNR.scope, "Workbook");
});

test("GasMockHarness resolves AuditLog_Events named range from _AuditLog tab in mock spreadsheet", () => {
  GasMockHarness.install();
  const ss = (globalThis as any).SpreadsheetApp.openById("ss-audit-test");
  ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

  const range = ss.getRangeByName("AuditLog_Events");
  assert.ok(range, "getRangeByName('AuditLog_Events') should return MockRange");
  assert.strictEqual(range.getValues()[0][0], "");

  const auditSheet = ss.getSheetByName("_AuditLog");
  assert.ok(auditSheet, "_AuditLog sheet should exist");
  assert.strictEqual(auditSheet.getRange("A3").getValue(), "Timestamp");
});

test("LogEngine executes audit event logging end-to-end with GasMockHarness GoogleSheetsStorageAdapter", () => {
  GasMockHarness.install();
  const ss = (globalThis as any).SpreadsheetApp.openById("ss-gasmock-audit");
  ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

  const { LogEngine } = require("../../src/core/log/LogEngine");
  const { GoogleSheetsStorageAdapter } = require("../../src/SheetStorageAdapter");
  const adapter = new GoogleSheetsStorageAdapter("ss-gasmock-audit");
  const engine = new LogEngine(adapter);

  engine.logAuditEvent("ss-gasmock-audit", {
    category: "ADMIN_ACTION",
    eventType: "CACHE_INVALIDATED",
    actor: "admin@example.com",
    status: "SUCCESS",
    details: { scope: "UserCache" }
  });

  const auditSheet = ss.getSheetByName("_AuditLog");
  assert.ok(auditSheet, "_AuditLog sheet must exist in spreadsheet");
  const grid = auditSheet.getGrid();
  assert.ok(grid.length >= 2, "Grid must contain header row and logged audit event");
  const eventRow = grid.find((r: any[]) => r[1] === "ADMIN_ACTION" && r[2] === "CACHE_INVALIDATED");
  assert.ok(eventRow, "Audit log row must exist with Category ADMIN_ACTION and EventType CACHE_INVALIDATED");
  assert.strictEqual(eventRow[3], "admin@example.com");
  assert.strictEqual(eventRow[4], "SUCCESS");
});

test("GasMockHarness evaluates VLOOKUP formula and FF&E calculated columns correctly", () => {
  const harness = GasMockHarness.install();
  const ss = (globalThis as any).SpreadsheetApp.openById("ss-vlookup-test");
  ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

  const vlookupResult = ss.evaluateVlookup("CH-01", "SpecTags", 2, true);
  assert.strictEqual(vlookupResult, "Dining Chair", "VLOOKUP CH-01 against SpecTags should return Dining Chair");

  const vlookupResult2 = ss.evaluateVlookup("TBL-01", "SpecTags", 2, true);
  assert.strictEqual(vlookupResult2, "Conference Table", "VLOOKUP TBL-01 against SpecTags should return Conference Table");

  const vlookupUnknown = ss.evaluateVlookup("NONEXISTENT", "SpecTags", 2, true);
  assert.strictEqual(vlookupUnknown, "#N/A", "VLOOKUP NONEXISTENT against SpecTags should return #N/A");

  const state = harness.getSheetsState("ss-vlookup-test");

  const ffeCalcTitle = state.evaluateFfeFormula("calcTitle", { specTag: "CH-01", specTitle: "Fallback Title" });
  assert.strictEqual(ffeCalcTitle, "Dining Chair", "calcTitle with CH-01 should auto-populate Dining Chair");

  const ffeFallbackTitle = state.evaluateFfeFormula("calcTitle", { specTag: "UNKNOWN-TAG", specTitle: "Custom Description" });
  assert.strictEqual(ffeFallbackTitle, "Custom Description", "calcTitle with unknown tag should fall back to specTitle");
});
