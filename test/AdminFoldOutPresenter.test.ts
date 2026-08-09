import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness } from "./harness/GasMockHarness";
import { CardSerializer } from "./harness/CardSerializer";
import { AdminFoldOutPresenter } from "../src/adapters/gas/AdminFoldOutPresenter";
import { SpreadsheetBatchReadException } from "../src/adapters/gas/SpreadsheetBatchReaderAdapter";

test("AdminFoldOutPresenter - renders SheetAdminFoldOut card section in GoogleSheets context", () => {
  GasMockHarness.install();

  try {
    const section = AdminFoldOutPresenter.renderAdminSection("GoogleSheets", {
      spreadsheetId: "ss-123",
      documentType: "SUBMITTAL_ARCH",
      tabName: "Submittal Arch"
    });

    assert.ok(section);
    const card = CardService.newCardBuilder().addSection(section).build();
    const serialized = CardSerializer.toJSON(card);
    assert.ok(serialized.sections);
    assert.strictEqual(serialized.sections.length, 1);
    assert.ok(serialized.sections[0].widgets.length > 0);
  } finally {
    GasMockHarness.uninstall();
  }
});

test("AdminFoldOutPresenter - dispatches dedicated Error State Card on SpreadsheetBatchReadException", () => {
  GasMockHarness.install();

  try {
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
  } finally {
    GasMockHarness.uninstall();
  }
});
