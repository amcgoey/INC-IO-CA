/**
 * @file verify-live.test.ts
 * @description Unit tests for verify-live.ts CLI argument parsing, 6-dimension structural auditing,
 * mock row formula evaluation roundtrip, tab taxonomy rules (Log -> Support -> System -> Backup), and markdown report generation.
 */

import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  parseVerifyArgs,
  evaluateArchFormula,
  evaluateAllArchFormulas,
  generateMarkdownReport,
  runLiveVerification,
  VerifyLiveOptions,
  StructuralDimensionCheck
} from "../scripts/template/verify-live";

test("parseVerifyArgs - parses --spreadsheet-id, --target, and --dry-run flags", () => {
  const args = ["--spreadsheet-id=1ABC_verify123", "--target=prod", "--dry-run"];
  const options = parseVerifyArgs(args, { TEST_SPREADSHEET_ID: "env_test_id" });

  assert.strictEqual(options.spreadsheetId, "1ABC_verify123");
  assert.strictEqual(options.target, "prod");
  assert.strictEqual(options.dryRun, true);
});

test("parseVerifyArgs - space-separated flags parse correctly", () => {
  const args = ["--spreadsheet-id", "1XYZ_999", "--target", "test"];
  const options = parseVerifyArgs(args);

  assert.strictEqual(options.spreadsheetId, "1XYZ_999");
  assert.strictEqual(options.target, "test");
  assert.strictEqual(options.dryRun, false);
});

test("parseVerifyArgs - resolves test spreadsheet ID from env when omitted", () => {
  const args = ["--target=test"];
  const options = parseVerifyArgs(args, { TEST_SPREADSHEET_ID: "env_verify_test_sheet" });

  assert.strictEqual(options.spreadsheetId, "env_verify_test_sheet");
  assert.strictEqual(options.target, "test");
});

test("parseVerifyArgs - resolves prod spreadsheet ID from env when omitted", () => {
  const args = ["--target=prod"];
  const options = parseVerifyArgs(args, { PROD_SPREADSHEET_ID: "env_verify_prod_sheet" });

  assert.strictEqual(options.spreadsheetId, "env_verify_prod_sheet");
  assert.strictEqual(options.target, "prod");
});

test("parseVerifyArgs - throws descriptive error if target is invalid", () => {
  assert.throws(
    () => parseVerifyArgs(["--target=invalid"]),
    /Invalid --target specified/
  );
});

test("parseVerifyArgs - throws descriptive error if spreadsheet ID cannot be resolved", () => {
  assert.throws(
    () => parseVerifyArgs(["--target=prod"], {}),
    /Spreadsheet ID is required/
  );
});

test("evaluateArchFormula - correctly evaluates all 5 calculated submittal columns", () => {
  const sampleRow = {
    section: "033000",
    number: 1,
    title: "Concrete Mix Design",
    revision: "0",
    contact: "arch-reviewer@example.com"
  };

  const calcFileName = evaluateArchFormula("calcFileName", sampleRow);
  const calcNumber = evaluateArchFormula("calcNumber", sampleRow);
  const calcTitle = evaluateArchFormula("calcTitle", sampleRow);
  const calcContactChain = evaluateArchFormula("calcContactChain", sampleRow);
  const calcSort = evaluateArchFormula("calcSort", sampleRow);

  assert.strictEqual(calcFileName, "033000-001-Concrete Mix Design-0");
  assert.strictEqual(calcNumber, "033000-001-0");
  assert.strictEqual(calcTitle, "Concrete Mix Design");
  assert.strictEqual(calcContactChain, "arch-reviewer@example.com");
  assert.strictEqual(calcSort, "0330000001");
});

test("evaluateAllArchFormulas - computes all columns and returns passed boolean", () => {
  const sampleRow = {
    section: "033000",
    number: 1,
    title: "Concrete Mix Design",
    revision: "0",
    contact: "arch-reviewer@example.com"
  };

  const res = evaluateAllArchFormulas(sampleRow);

  assert.strictEqual(res.calcFileName, "033000-001-Concrete Mix Design-0");
  assert.strictEqual(res.calcNumber, "033000-001-0");
  assert.strictEqual(res.calcTitle, "Concrete Mix Design");
  assert.strictEqual(res.calcContactChain, "arch-reviewer@example.com");
  assert.strictEqual(res.calcSort, "0330000001");
  assert.strictEqual(res.passed, true);
});

test("evaluateArchFormula - returns empty string when section is missing", () => {
  const emptyRow = { section: "", number: 1, title: "Test", revision: "0", contact: "a@b.com" };
  assert.strictEqual(evaluateArchFormula("calcFileName", emptyRow), "");
  assert.strictEqual(evaluateArchFormula("calcNumber", emptyRow), "");
});

test("generateMarkdownReport - builds valid Markdown report artifact", () => {
  const checks: StructuralDimensionCheck[] = [
    { dimension: "1. Schema Version and Manifest", status: "PASS", details: "Schema version is 1.0.0" },
    { dimension: "2. Tab Roles and Taxonomy", status: "PASS", details: "Tabs found: _Config, _Shared, Submittal Arch" }
  ];

  const roundtripResult = {
    calcFileName: "033000-001-Concrete Mix Design-0",
    calcNumber: "033000-001-0",
    calcTitle: "Concrete Mix Design",
    calcContactChain: "arch-reviewer@example.com",
    calcSort: "0330000001",
    passed: true
  };

  const md = generateMarkdownReport(checks, roundtripResult);

  assert.ok(md.includes("# MVT Template Formula Verification Audit Report"));
  assert.ok(md.includes("1. Schema Version and Manifest"));
  assert.ok(md.includes("Stage 2: Mock Submittal Row Formula Evaluation Roundtrip"));
  assert.ok(md.includes("Overall Roundtrip Audit Result**: **PASSED**"));
});

test("runLiveVerification - dry-run execution completes 6-dimension checks and writes report", async () => {
  const options: VerifyLiveOptions = {
    spreadsheetId: "1TEST_VERIFY_ID",
    target: "test",
    dryRun: true
  };

  const result = await runLiveVerification(options);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.checks.length, 6);
  assert.strictEqual(result.roundtripResult.passed, true);

  const dim2 = result.checks.find(c => c.dimension.includes("2. Tab Roles"));
  assert.ok(dim2, "Dimension 2 check should exist");
  assert.strictEqual(dim2.status, "PASS");

  const reportPath = path.resolve(process.cwd(), ".scratch", "mvt-verification-report.md");
  assert.ok(fs.existsSync(reportPath), "Report file should exist");
  const reportContent = fs.readFileSync(reportPath, "utf-8");
  assert.ok(reportContent.includes("# MVT Template Formula Verification Audit Report"));
});

test("runLiveVerification - Dimension 2 validates tab order and legacy backup tabs", async () => {
  const options: VerifyLiveOptions = {
    spreadsheetId: "1TEST_VERIFY_ID",
    target: "test",
    dryRun: true
  };

  const fakeApiFetcher = async (url: string, init: RequestInit): Promise<Response | unknown> => {
    if (url.includes("fields=sheets")) {
      return {
        ok: true,
        json: async () => ({
          sheets: [
            { properties: { title: "Submittal Arch", sheetId: 1 } },
            { properties: { title: "Submittal FFE", sheetId: 2 } },
            { properties: { title: "Submittal Arch Support", sheetId: 3 } },
            { properties: { title: "Submittal FFE Support", sheetId: 4 } },
            { properties: { title: "_Shared", sheetId: 5 } },
            { properties: { title: "_Config", sheetId: 6 } },
            { properties: { title: "_AuditLog", sheetId: 7 } },
            { properties: { title: "_Backup_Submittal Arch_20260101", sheetId: 8 } }
          ]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const result = await runLiveVerification(options, {
    apiFetcher: fakeApiFetcher,
    authToken: "ya29.fake_token"
  });

  const dim2 = result.checks.find(c => c.dimension.includes("2. Tab Roles"));
  assert.ok(dim2);
  assert.strictEqual(dim2.status, "PASS");
  assert.ok(dim2.details.includes("_Backup_Submittal Arch_20260101"));
});

test("runLiveVerification - Dimension 2 fails when legacy _Backup_* tab is misplaced before system tab", async () => {
  const options: VerifyLiveOptions = {
    spreadsheetId: "1TEST_VERIFY_ID",
    target: "test",
    dryRun: true
  };

  const fakeApiFetcher = async (url: string, init: RequestInit): Promise<Response | unknown> => {
    if (url.includes("fields=sheets")) {
      return {
        ok: true,
        json: async () => ({
          sheets: [
            { properties: { title: "Submittal Arch", sheetId: 1 } },
            { properties: { title: "_Backup_Submittal Arch_20260101", sheetId: 8 } },
            { properties: { title: "_Config", sheetId: 6 } },
            { properties: { title: "_Shared", sheetId: 5 } },
            { properties: { title: "_AuditLog", sheetId: 7 } }
          ]
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const result = await runLiveVerification(options, {
    apiFetcher: fakeApiFetcher,
    authToken: "ya29.fake_token"
  });

  const dim2 = result.checks.find(c => c.dimension.includes("2. Tab Roles"));
  assert.ok(dim2);
  assert.strictEqual(dim2.status, "FAIL");
  assert.ok(dim2.details.includes("far right"));
});

test("runLiveVerification - live execution uses mock apiFetcher for sheetId query, mock row append, readback, and deletion", async () => {
  const options: VerifyLiveOptions = {
    spreadsheetId: "1LIVE_VERIFY_ID",
    target: "test",
    dryRun: false
  };

  const apiCalls: { url: string; method: string }[] = [];

  const fakeApiFetcher = async (url: string, init: RequestInit): Promise<Response | unknown> => {
    apiCalls.push({ url, method: init.method || "GET" });
    if (url.includes("fields=sheets")) {
      return { ok: true, json: async () => ({ sheets: [{ properties: { title: "Submittal Arch", sheetId: 101 } }] }) };
    }
    if (url.includes(":append")) {
      return { ok: true, json: async () => ({ updates: { updatedRange: "'Submittal Arch'!A20:Z20" } }) };
    }
    if (url.includes("/values/")) {
      return {
        ok: true,
        json: async () => ({
          values: [["033000-001-Concrete Mix Design-0", "033000-001-0", "Concrete Mix Design", "arch-reviewer@example.com", "0330000001"]]
        })
      };
    }
    if (url.includes(":batchUpdate")) {
      return { ok: true, json: async () => ({ replies: [{ deleteDimension: {} }] }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  const result = await runLiveVerification(options, {
    apiFetcher: fakeApiFetcher,
    authToken: "ya29.fake_token"
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.roundtripResult.passed, true);
  assert.ok(apiCalls.some((c) => c.url.includes(":append")));
  assert.ok(apiCalls.some((c) => c.url.includes("/values/")));
  assert.ok(apiCalls.some((c) => c.url.includes(":batchUpdate")));
});

test("runLiveVerification - live execution reports failure on live API error without masking", async () => {
  const options: VerifyLiveOptions = {
    spreadsheetId: "1LIVE_FAIL_ID",
    target: "test",
    dryRun: false
  };

  const fakeFailingApiFetcher = async (url: string, init: RequestInit): Promise<Response | unknown> => {
    throw new Error("HTTP 403 Forbidden: Insufficient Permissions");
  };

  const result = await runLiveVerification(options, {
    apiFetcher: fakeFailingApiFetcher,
    authToken: "ya29.failing_token"
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.roundtripResult.passed, false);
  assert.strictEqual(result.roundtripResult.calcFileName, "API_ERROR");
});
