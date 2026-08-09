/**
 * @file AdminFoldOutPresenter.test.ts
 * @description Unit tests for AdminFoldOutPresenter dispatch, SheetAdminFoldOut and TriageAdminFoldOut UI sections,
 * scoped ScriptCache eviction, and _AuditLog event logging (Issue #220).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { GasMockHarness } from "./harness/GasMockHarness";
import { CardSerializer } from "./harness/CardSerializer";
import { AdminFoldOutPresenter, onFlushScriptCache } from "../src/adapters/gas/AdminFoldOutPresenter";
import { buildSheetsRootCard } from "../src/adapters/gas/SheetsRootCard";

describe("AdminFoldOutPresenter & SheetAdminFoldOut (Issue #220)", () => {
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
});
