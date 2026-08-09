/**
 * @file SheetsRootCard.test.ts
 * @description Unit tests for SheetsRootCard header layout, 5-tier tab role badges,
 * unrecognized spreadsheet fallback state, and context refresh action handling under GasMockHarness (Issue #219).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { GasMockHarness } from "./harness/GasMockHarness";
import { CardSerializer } from "./harness/CardSerializer";
import { SheetsRootCard, buildSheetsRootCard, onSheetsContextRefresh } from "../src/adapters/gas/SheetsRootCard";

describe("SheetsRootCard Header Layout & Context Refresh Action (Issue #219)", () => {
  beforeEach(() => {
    GasMockHarness.install();
  });

  afterEach(() => {
    GasMockHarness.uninstall();
  });

  it("renders Workbook Context Header correctly for LOG_TAB role", () => {
    const harness = GasMockHarness.install();
    const ss = harness.sheetsService.openById("wb-log-001");
    ss.insertSheet("_Config", [["MANIFEST_SCHEMA_VERSION", "1.2.0"]]);
    ss.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");

    const archSheet = ss.insertSheet("Submittal Arch", [
      ["Title"],
      ["Date"],
      ["Header1", "Header2"],
      ["Formula1", "Formula2"],
      ["BUFFER_TOP", ""],
      ["DataRow1Col1", "DataRow1Col2"],
      ["DataRow2Col1", "DataRow2Col2"],
      ["BUFFER_BOTTOM", ""]
    ]);
    ss.setNamedRange("Data", "Submittal Arch", "A5:B8");

    const card = buildSheetsRootCard({ spreadsheetId: "wb-log-001", sheetName: "Submittal Arch" });
    const cardJson = CardSerializer.toJSON(card);

    assert.strictEqual(cardJson.sections.length, 2);
    assert.strictEqual(cardJson.sections[0].header, "Workbook Context");

    assert.ok(CardSerializer.hasWidgetText(cardJson, "Submittal Arch"));
    assert.ok(CardSerializer.hasWidgetText(cardJson, "Log Tab"));
    assert.ok(CardSerializer.hasWidgetText(cardJson, "SUBMITTAL_ARCH"));
    assert.ok(CardSerializer.hasWidgetText(cardJson, "Data Rows: 2"));

    const btn = CardSerializer.findButton(cardJson, "Refresh Context");
    assert.ok(btn);
    assert.strictEqual(btn?.onClickAction?.functionName, "onSheetsContextRefresh");
  });

  it("renders Workbook Context Header across all 5 tab roles", () => {
    const harness = GasMockHarness.install();
    const ss = harness.sheetsService.openById("wb-log-002");
    ss.insertSheet("_Config", [["MANIFEST_SCHEMA_VERSION", "1.2.0"]]);
    ss.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    ss.insertSheet("_AuditLog");
    ss.insertSheet("Documentation");
    ss.insertSheet("ScratchPad");

    // 1. LOG_TAB
    ss.insertSheet("Submittal FFE", [["BUFFER_TOP"], ["Data1"], ["BUFFER_BOTTOM"]]);
    const card1 = CardSerializer.toJSON(buildSheetsRootCard({ spreadsheetId: "wb-log-002", sheetName: "Submittal FFE" }));
    assert.ok(CardSerializer.hasWidgetText(card1, "Log Tab"));
    assert.ok(CardSerializer.hasWidgetText(card1, "SUBMITTAL_FFE"));

    // 2. SYSTEM_CONFIG
    const card2 = CardSerializer.toJSON(buildSheetsRootCard({ spreadsheetId: "wb-log-002", sheetName: "_Config" }));
    assert.ok(CardSerializer.hasWidgetText(card2, "System Config"));
    assert.ok(CardSerializer.hasWidgetText(card2, "_Config"));

    // 3. AUDIT_LOG
    const card3 = CardSerializer.toJSON(buildSheetsRootCard({ spreadsheetId: "wb-log-002", sheetName: "_AuditLog" }));
    assert.ok(CardSerializer.hasWidgetText(card3, "System Audit Log"));

    // 4. DOCUMENTATION
    const card4 = CardSerializer.toJSON(buildSheetsRootCard({ spreadsheetId: "wb-log-002", sheetName: "Documentation" }));
    assert.ok(CardSerializer.hasWidgetText(card4, "Documentation"));

    // 5. USER_CREATED
    const card5 = CardSerializer.toJSON(buildSheetsRootCard({ spreadsheetId: "wb-log-002", sheetName: "ScratchPad" }));
    assert.ok(CardSerializer.hasWidgetText(card5, "User Created"));
  });

  it("renders 'Unrecognized Document Log' fallback banner for non-log spreadsheets", () => {
    const harness = GasMockHarness.install();
    const ss = harness.sheetsService.openById("non-log-999");
    ss.insertSheet("Summary");

    const card = buildSheetsRootCard({ spreadsheetId: "non-log-999", sheetName: "Summary" });
    const cardJson = CardSerializer.toJSON(card);

    assert.strictEqual(cardJson.sections[0].header, "Unrecognized Document Log");
    assert.ok(CardSerializer.hasWidgetText(cardJson, "missing configuration information"));
    assert.strictEqual(cardJson.sections[1].header, "Sheet Administration (Disabled)");
    assert.strictEqual(cardJson.sections[1].collapsible, true);

    const btn = CardSerializer.findButton(cardJson, "Refresh Context");
    assert.ok(btn);
  });

  it("handles 'Refresh Context' action re-inspecting active spreadsheet context", () => {
    const harness = GasMockHarness.install();
    const ss = harness.sheetsService.openById("wb-log-003");
    ss.insertSheet("_Config", [["MANIFEST_SCHEMA_VERSION", "1.2.0"]]);
    ss.setNamedRange("MANIFEST_SCHEMA_VERSION", "_Config", "A1:B1");
    ss.insertSheet("Submittal Arch");

    const event = {
      parameter: {},
      parameters: {},
      formInput: {},
      sheetsContext: {
        spreadsheetId: "wb-log-003",
        sheetName: "Submittal Arch"
      }
    };

    const actionResponse = onSheetsContextRefresh(event);
    const actionJson = CardSerializer.actionResponseToJSON(actionResponse);

    assert.strictEqual(actionJson.notification?.text, "Card context refreshed.");
    assert.ok(actionJson.navigation?.card);

    const navCard = CardSerializer.toJSON(actionJson.navigation?.card);
    assert.ok(CardSerializer.hasWidgetText(navCard, "Submittal Arch"));
    assert.ok(CardSerializer.hasWidgetText(navCard, "Log Tab"));
  });
});
