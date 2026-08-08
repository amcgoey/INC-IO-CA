/**
 * @file deploy-live.test.ts
 * @description Unit tests for deploy-live.ts CLI argument parsing, single-pass batch update payload generation,
 * 3-retry exponential backoff rate-limit handling, target spreadsheet ID resolution, and deployment execution.
 */

import test from "node:test";
import assert from "node:assert";
import {
  parseDeployArgs,
  buildDeploymentPayload,
  executeWithRetry,
  deployLiveTemplate,
  DeployLiveOptions
} from "../scripts/template/deploy-live";
import { WorkbookTemplateViewModel } from "../src/core/config/WorkbookTemplateViewModel";

test("parseDeployArgs - parses --spreadsheet-id, --target, and --dry-run flags", () => {
  const args = ["--spreadsheet-id=1ABC_xyz123", "--target=prod", "--dry-run"];
  const options = parseDeployArgs(args, { TEST_SPREADSHEET_ID: "env_test_id" });

  assert.strictEqual(options.spreadsheetId, "1ABC_xyz123");
  assert.strictEqual(options.target, "prod");
  assert.strictEqual(options.dryRun, true);
});

test("parseDeployArgs - space-separated flags parse correctly", () => {
  const args = ["--spreadsheet-id", "1XYZ_456", "--target", "test"];
  const options = parseDeployArgs(args);

  assert.strictEqual(options.spreadsheetId, "1XYZ_456");
  assert.strictEqual(options.target, "test");
  assert.strictEqual(options.dryRun, false);
});

test("parseDeployArgs - resolves test spreadsheet ID from env when omitted", () => {
  const args = ["--target=test"];
  const options = parseDeployArgs(args, { TEST_SPREADSHEET_ID: "env_test_sheet_123" });

  assert.strictEqual(options.spreadsheetId, "env_test_sheet_123");
  assert.strictEqual(options.target, "test");
});

test("parseDeployArgs - resolves prod spreadsheet ID from env when omitted", () => {
  const args = ["--target=prod"];
  const options = parseDeployArgs(args, { PROD_SPREADSHEET_ID: "env_prod_sheet_999" });

  assert.strictEqual(options.spreadsheetId, "env_prod_sheet_999");
  assert.strictEqual(options.target, "prod");
});

test("parseDeployArgs - throws descriptive error if target is invalid", () => {
  assert.throws(
    () => parseDeployArgs(["--target=staging"]),
    /Invalid --target specified/
  );
});

test("parseDeployArgs - throws descriptive error if spreadsheet ID cannot be resolved", () => {
  assert.throws(
    () => parseDeployArgs(["--target=prod"], {}),
    /Spreadsheet ID is required/
  );
});

test("buildDeploymentPayload - produces single-pass batch update request payload via WorkbookTemplateViewModel", () => {
  const payload = buildDeploymentPayload();
  assert.ok(payload, "Payload must be defined");
  assert.ok(Array.isArray(payload.requests), "Payload requests must be an array");
  assert.ok(payload.requests.length > 0, "Requests array must contain batch requests");

  const repeatCellReqs = payload.requests.filter((r: any) => r.repeatCell);
  assert.ok(repeatCellReqs.length >= 4, "Must include header and formula row repeatCell requests");

  const validationReqs = payload.requests.filter((r: any) => r.setDataValidation);
  assert.ok(validationReqs.length >= 2, "Must include setDataValidation requests");

  const namedRangeReqs = payload.requests.filter((r: any) => r.addNamedRange);
  assert.ok(namedRangeReqs.length >= 5, "Must include addNamedRange requests");
});

test("executeWithRetry - succeeds on first call if no errors occur", async () => {
  let calls = 0;
  const result = await executeWithRetry(async () => {
    calls++;
    return "SUCCESS";
  }, { maxRetries: 3, initialDelayMs: 10, useJitter: false });

  assert.strictEqual(result, "SUCCESS");
  assert.strictEqual(calls, 1);
});

test("executeWithRetry - retries on 429 quota error and succeeds on 3rd attempt", async () => {
  let calls = 0;
  const delays: number[] = [];
  const fakeSleep = (ms: number) => { delays.push(ms); return Promise.resolve(); };

  const result = await executeWithRetry(
    async () => {
      calls++;
      if (calls < 3) {
        const err: any = new Error("Rate limit exceeded: 429 Too Many Requests");
        err.status = 429;
        throw err;
      }
      return "OK_AFTER_RETRIES";
    },
    { maxRetries: 3, initialDelayMs: 100, useJitter: false, sleepFn: fakeSleep }
  );

  assert.strictEqual(result, "OK_AFTER_RETRIES");
  assert.strictEqual(calls, 3);
  assert.deepStrictEqual(delays, [100, 200]);
});

test("executeWithRetry - retries on 503 Service Unavailable", async () => {
  let calls = 0;
  const delays: number[] = [];
  const fakeSleep = (ms: number) => { delays.push(ms); return Promise.resolve(); };

  const result = await executeWithRetry(
    async () => {
      calls++;
      if (calls === 1) {
        const err: any = new Error("Service Unavailable");
        err.status = 503;
        throw err;
      }
      return "OK_503_RECOVERY";
    },
    { maxRetries: 3, initialDelayMs: 100, useJitter: false, sleepFn: fakeSleep }
  );

  assert.strictEqual(result, "OK_503_RECOVERY");
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(delays, [100]);
});

test("executeWithRetry - throws after exhausting max retries on repeated 429 errors", async () => {
  let calls = 0;
  const fakeSleep = () => Promise.resolve();

  await assert.rejects(
    async () => {
      await executeWithRetry(
        async () => {
          calls++;
          const err: any = new Error("Quota exceeded 429");
          err.status = 429;
          throw err;
        },
        { maxRetries: 3, initialDelayMs: 10, useJitter: false, sleepFn: fakeSleep }
      );
    },
    (err: any) => {
      assert.strictEqual(calls, 4);
      assert.ok(err.message.includes("Quota exceeded 429"));
      return true;
    }
  );
});

test("executeWithRetry - throws immediately on non-retryable 400 Bad Request error without retrying", async () => {
  let calls = 0;
  const fakeSleep = () => Promise.resolve();

  await assert.rejects(
    async () => {
      await executeWithRetry(
        async () => {
          calls++;
          const err: any = new Error("Bad Request: Invalid sheet ID");
          err.status = 400;
          throw err;
        },
        { maxRetries: 3, initialDelayMs: 10, useJitter: false, sleepFn: fakeSleep }
      );
    },
    (err: any) => {
      assert.strictEqual(calls, 1);
      assert.strictEqual(err.status, 400);
      return true;
    }
  );
});

test("deployLiveTemplate - dry-run execution returns deployment summary without API calls", async () => {
  const options: DeployLiveOptions = {
    spreadsheetId: "1TEST_DRY_RUN_ID",
    target: "test",
    dryRun: true
  };

  let apiCalled = false;
  const fakeApiFetcher = async () => {
    apiCalled = true;
    return { ok: true, json: async () => ({}) };
  };

  const result = await deployLiveTemplate(options, { apiFetcher: fakeApiFetcher });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.spreadsheetId, "1TEST_DRY_RUN_ID");
  assert.strictEqual(apiCalled, false);
  assert.ok(result.totalRequests > 0);
  assert.strictEqual(result.target, "test");
});

test("parseDeployArgs - parses --create flag when no spreadsheet ID is provided", () => {
  const args = ["--create", "--target=test"];
  const options = parseDeployArgs(args);

  assert.strictEqual(options.create, true);
  assert.strictEqual(options.target, "test");
  assert.strictEqual(options.spreadsheetId, "");
});

test("deployLiveTemplate - --create flag invokes createSpreadsheet and provisions new sheet", async () => {
  const options: DeployLiveOptions = {
    spreadsheetId: "",
    target: "test",
    dryRun: false,
    create: true
  };

  const calls: string[] = [];
  const fakeApiFetcher = async (url: string, init: any) => {
    calls.push(url);
    if (url === "https://www.googleapis.com/drive/v3/files") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "NEWLY_CREATED_SHEET_999", name: "INC Project Document Log (MVT Template)", mimeType: "application/vnd.google-apps.spreadsheet" })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ spreadsheetId: "NEWLY_CREATED_SHEET_999", replies: [] })
    };
  };

  const result = await deployLiveTemplate(options, {
    apiFetcher: fakeApiFetcher,
    authToken: "ya29.fake_token"
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.spreadsheetId, "NEWLY_CREATED_SHEET_999");
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0], "https://www.googleapis.com/drive/v3/files");
  assert.ok(calls[1].includes("/spreadsheets/NEWLY_CREATED_SHEET_999:batchUpdate"));
});
