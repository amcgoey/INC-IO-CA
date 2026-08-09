import test from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness } from "./harness/GasMockHarness";
import {
  SpreadsheetBatchReaderAdapter,
  SpreadsheetBatchReadException,
  SpreadsheetBatchData
} from "../src/adapters/gas/SpreadsheetBatchReaderAdapter";

test("SpreadsheetBatchReaderAdapter - executes Sheets.Spreadsheets.get v4 with strict range and field mask bounding", () => {
  let requestedId = "";
  let requestedOptions: any = null;

  const mockSheetsApi = {
    Spreadsheets: {
      get: (spreadsheetId: string, options: any) => {
        requestedId = spreadsheetId;
        requestedOptions = options;
        return {
          spreadsheetId,
          properties: { title: "Test Log Workbook" },
          namedRanges: [
            {
              name: "Config_Manifest",
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 26 }
            }
          ],
          sheets: [
            {
              properties: { sheetId: 0, title: "_Config" },
              data: [
                {
                  rowData: [
                    {
                      values: [
                        { userEnteredValue: { stringValue: "MANIFEST_SCHEMA_VERSION" } },
                        { userEnteredValue: { stringValue: "1.2.0" } }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        };
      }
    }
  };

  GasMockHarness.install({
    sheetsAdvancedServiceOverrides: mockSheetsApi
  });

  try {
    const adapter = new SpreadsheetBatchReaderAdapter();
    const result: SpreadsheetBatchData = adapter.readWorkbookBatch("ss-test-123");

    assert.strictEqual(requestedId, "ss-test-123");
    assert.deepEqual(requestedOptions.ranges, ["_Config!A1:Z100", "1:2"]);
    assert.strictEqual(
      requestedOptions.fields,
      "namedRanges,sheets(properties(sheetId,title),data(rowData(values(userEnteredValue,dataValidation))))"
    );
    assert.strictEqual(result.spreadsheetId, "ss-test-123");
    assert.strictEqual(result.namedRanges.length, 1);
    assert.strictEqual(result.namedRanges[0].name, "Config_Manifest");
    assert.strictEqual(result.sheets.length, 1);
    assert.strictEqual(result.sheets[0].properties.title, "_Config");
  } finally {
    GasMockHarness.uninstall();
  }
});

test("SpreadsheetBatchReaderAdapter - throws SpreadsheetBatchReadException immediately when Sheets global is missing or API throws", () => {
  // Test case 1: Sheets global missing / disabled
  GasMockHarness.install({
    sheetsAdvancedServiceOverrides: undefined
  });

  try {
    const harness = GasMockHarness.instance!;
    const initialCallCount = harness.sheetsService.calls.length;
    const adapter = new SpreadsheetBatchReaderAdapter();

    assert.throws(
      () => adapter.readWorkbookBatch("ss-test-123"),
      (err: any) => {
        assert.ok(err instanceof SpreadsheetBatchReadException);
        assert.strictEqual(err.spreadsheetId, "ss-test-123");
        assert.match(err.message, /Advanced Sheets Service \(v4\) is un-enabled or unavailable/i);
        return true;
      }
    );

    // Fast-fail assertion: Zero fallback to synchronous SpreadsheetApp loops
    assert.strictEqual(harness.sheetsService.calls.length, initialCallCount);
  } finally {
    GasMockHarness.uninstall();
  }

  // Test case 2: API method throws runtime error
  const failingSheetsApi = {
    Spreadsheets: {
      get: () => {
        throw new Error("API call quota exceeded");
      }
    }
  };

  GasMockHarness.install({
    sheetsAdvancedServiceOverrides: failingSheetsApi
  });

  try {
    const harness = GasMockHarness.instance!;
    const initialCallCount = harness.sheetsService.calls.length;
    const adapter = new SpreadsheetBatchReaderAdapter();

    assert.throws(
      () => adapter.readWorkbookBatch("ss-test-123"),
      (err: any) => {
        assert.ok(err instanceof SpreadsheetBatchReadException);
        assert.strictEqual(err.spreadsheetId, "ss-test-123");
        assert.match(err.message, /API call quota exceeded/i);
        return true;
      }
    );

    // Fast-fail assertion: Zero fallback to synchronous SpreadsheetApp loops
    assert.strictEqual(harness.sheetsService.calls.length, initialCallCount);
  } finally {
    GasMockHarness.uninstall();
  }
});
