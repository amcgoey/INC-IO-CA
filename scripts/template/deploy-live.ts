/**
 * @file deploy-live.ts
 * @description Single-Pass API Batching & Rate-Limit Backoff Engine for live Google Sheets template deployment.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DOCUMENT_LOG_WORKBOOK_SPEC } from "../../src/core/config/DocumentLogWorkbookSpec";
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from "../../src/core/config/DocumentLogWorkbookViewSpec";
import {
  WorkbookTemplateViewModel,
  BatchUpdateRequestPayload
} from "../../src/core/config/WorkbookTemplateViewModel";

export interface DeployLiveOptions {
  spreadsheetId: string;
  target: "test" | "prod";
  dryRun?: boolean;
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  useJitter?: boolean;
  sleepFn?: (ms: number) => Promise<void>;
}

export interface DeployLiveResult {
  success: boolean;
  spreadsheetId: string;
  target: "test" | "prod";
  dryRun: boolean;
  totalRequests: number;
  response?: any;
}

export function getEnvVars(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const envPaths = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env")
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const idx = trimmed.indexOf("=");
          if (idx > 0) {
            const key = trimmed.substring(0, idx).trim();
            const value = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, "");
            if (!env[key]) {
              env[key] = value;
            }
          }
        }
      }
    }
  }
  return env;
}

export async function resolveGoogleAuthToken(): Promise<string> {
  const env = getEnvVars();
  if (env.GOOGLE_AUTH_TOKEN || env.ACCESS_TOKEN) {
    return env.GOOGLE_AUTH_TOKEN || env.ACCESS_TOKEN;
  }

  const homeDir = process.env.USERPROFILE || process.env.HOME || "";
  const clasprcPaths = [
    path.resolve(process.cwd(), ".clasprc.json"),
    path.join(homeDir, ".clasprc.json")
  ];

  for (const clasprcPath of clasprcPaths) {
    if (fs.existsSync(clasprcPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(clasprcPath, "utf-8"));
        const refreshToken = data.token?.refresh_token || data.tokens?.default?.refresh_token;
        const clientId = data.oauth2ClientSettings?.clientId || data.tokens?.default?.client_id;
        const clientSecret = data.oauth2ClientSettings?.clientSecret || data.tokens?.default?.client_secret;

        if (refreshToken && clientId && clientSecret) {
          console.log("new");
          const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: refreshToken,
              grant_type: "refresh_token"
            })
          });

          if (res.ok) {
            const json = await res.json();
            if (json.access_token) {
              console.log("new");
              return json.access_token;
            }
          }
        } else if (data.token?.access_token) {
          return data.token.access_token;
        }
      } catch (err: any) {
        console.log("new");
      }
    }
  }
  return "";
}

export function parseDeployArgs(
  args: string[] = process.argv.slice(2),
  envOverride?: Record<string, string>
): DeployLiveOptions {
  let spreadsheetId = "";
  let target: "test" | "prod" = "test";
  let dryRun = false;
  let create = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--spreadsheet-id=")) {
      spreadsheetId = arg.substring("--spreadsheet-id=".length);
    } else if (arg === "--spreadsheet-id" && i + 1 < args.length) {
      spreadsheetId = args[++i];
    } else if (arg.startsWith("--target=")) {
      const rawTarget = arg.substring("--target=".length);
      if (rawTarget !== "test" && rawTarget !== "prod") {
        throw new Error(`Invalid --target specified: "${rawTarget}". Expected "test" or "prod".`);
      }
      target = rawTarget;
    } else if (arg === "--target" && i + 1 < args.length) {
      const rawTarget = args[++i];
      if (rawTarget !== "test" && rawTarget !== "prod") {
        throw new Error(`Invalid --target specified: "${rawTarget}". Expected "test" or "prod".`);
      }
      target = rawTarget;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--create") {
      create = true;
    }
  }

  if (!spreadsheetId && !create) {
    const env = envOverride || getEnvVars();
    if (target === "test") {
      spreadsheetId = env.TEST_SPREADSHEET_ID || env.SPREADSHEET_ID || "";
    } else if (target === "prod") {
      spreadsheetId = env.PROD_SPREADSHEET_ID || env.SPREADSHEET_ID || "";
    }
  }

  if (!spreadsheetId && !create) {
    throw new Error(
      `Spreadsheet ID is required for target "${target}". Specify --spreadsheet-id=<id>, use --create to create a new sheet, or configure ${target === "test" ? "TEST_SPREADSHEET_ID" : "PROD_SPREADSHEET_ID"} in .env.local.`
    );
  }

  return { spreadsheetId, target, dryRun, create };
}

export function buildDeploymentPayload(
  viewModel: WorkbookTemplateViewModel = new WorkbookTemplateViewModel(
    DOCUMENT_LOG_WORKBOOK_SPEC,
    DOCUMENT_LOG_WORKBOOK_VIEW_SPEC
  ),
  existingSheetsMap?: Map<string, number>
): BatchUpdateRequestPayload {
  return viewModel.toBatchUpdateRequestPayload(existingSheetsMap);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const useJitter = options.useJitter ?? true;
  const sleepFn = options.sleepFn ?? defaultSleep;

  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;
      const statusCode = error?.status || error?.statusCode || error?.code || error?.response?.status;
      const message = error?.message || String(error);

      const isQuotaOrRateLimit =
        statusCode === 429 ||
        statusCode === 503 ||
        /429|503|quota|rate limit|too many requests|service unavailable/i.test(message);

      if (!isQuotaOrRateLimit || attempt > maxRetries) {
        throw error;
      }

      let delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      if (useJitter) {
        delayMs = Math.floor(Math.random() * delayMs);
      }

      console.warn(
        `[Rate-Limit Backoff] HTTP ${statusCode || "Quota"} error. Retrying attempt ${attempt}/${maxRetries} after ${delayMs}ms delay...`
      );
      await sleepFn(delayMs);
    }
  }
}

export async function createSpreadsheet(
  title: string = "INC Project Document Log (MVT Template)",
  token?: string,
  fetcher?: (url: string, init: any) => Promise<any>
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const endpoint = "https://www.googleapis.com/drive/v3/files";
  const customFetcher = fetcher || (async (url: string, init: any) => {
    const res = await fetch(url, init);
    if (!res.ok) {
      const errText = await res.text();
      const err: any = new Error(`Google Drive API Create Error (${res.status}): ${errText}`);
      err.status = res.status;
      throw err;
    }
    return res;
  });

  const init = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet"
    })
  };

  const res = await executeWithRetry(async () => {
    const response = await customFetcher(endpoint, init);
    return typeof response.json === "function" ? await response.json() : response;
  });

  const spreadsheetId = res.id;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return { spreadsheetId, spreadsheetUrl };
}

export async function deployLiveTemplate(
  options: DeployLiveOptions,
  deps: DeployDependencies = {}
): Promise<DeployLiveResult> {
  console.log("new");

  const token = deps.authToken || (await resolveGoogleAuthToken());
  const fetcher = deps.apiFetcher || (async (url: string, init: any) => {
    const res = await fetch(url, init);
    if (!res.ok) {
      const errText = await res.text();
      const err: any = new Error(`Google Sheets API Error (${res.status}): ${errText}`);
      err.status = res.status;
      throw err;
    }
    return res;
  });

  let spreadsheetId = options.spreadsheetId;

  if (options.create) {
    if (!token && !deps.apiFetcher) {
      console.log("new");
      spreadsheetId = "DRY_RUN_CREATED_SHEET_ID";
    } else {
      console.log("new");
      const created = await createSpreadsheet("INC Project Document Log (MVT Template)", token, fetcher);
      spreadsheetId = created.spreadsheetId;
      console.log("new");
    }
  }

  console.log("new");

  const existingSheetsMap = new Map<string, number>();
  let existingNamedRangeDeletes: object[] = [];

  if (!options.create && (token || deps.apiFetcher) && !options.dryRun) {
    try {
      console.log("new");
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties,namedRanges`;
      const metaRes = await executeWithRetry(async () => {
        const res = await fetcher(metaUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        return typeof res.json === "function" ? await res.json() : res;
      });
      if (metaRes && metaRes.sheets && Array.isArray(metaRes.sheets)) {
        for (const s of metaRes.sheets) {
          if (s.properties?.title && s.properties?.sheetId !== undefined) {
            existingSheetsMap.set(s.properties.title, s.properties.sheetId);
          }
        }
        console.log("new");
      }
      if (metaRes && metaRes.namedRanges && Array.isArray(metaRes.namedRanges)) {
        existingNamedRangeDeletes = metaRes.namedRanges.map((nr: any) => ({
          deleteNamedRange: {
            namedRangeId: nr.namedRangeId
          }
        }));
        console.log("new");
      }
    } catch (err: any) {
      console.log("new");
    }
  }

  const payload = buildDeploymentPayload(undefined, existingSheetsMap);
  if (existingNamedRangeDeletes.length > 0) {
    payload.requests.unshift(...existingNamedRangeDeletes);
  }
  console.log("new");
  const requestCount = payload.requests.length;
  console.log("new");

  if (options.dryRun || (!token && !deps.apiFetcher)) {
    console.log("new");
    if (!token && !deps.apiFetcher) {
      console.log("new");
    }
    return {
      success: true,
      spreadsheetId: spreadsheetId,
      target: options.target,
      dryRun: true,
      totalRequests: requestCount
    };
  }

  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const init = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  };

  const response = await executeWithRetry(async () => {
    const res = await fetcher(endpoint, init);
    return typeof res.json === "function" ? await res.json() : res;
  });

  console.log("new");
  return {
    success: true,
    spreadsheetId: spreadsheetId,
    target: options.target,
    dryRun: false,
    totalRequests: requestCount,
    response
  };
}

if (require.main === module) {
  try {
    const options = parseDeployArgs();
    deployLiveTemplate(options)
      .then((res) => {
        console.log("new");
        process.exit(0);
      })
      .catch((err) => {
        console.log("new");
        process.exit(1);
      });
  } catch (err: any) {
    console.log("new");
    process.exit(1);
  }
}
