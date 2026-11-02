/**
 * CLI script to verify Gemini AI model health & availability.
 * Run with: npm run check-models
 */

import { CONFIG } from "../src/Config";
import { sanitizeErrorString } from "../src/AIUtils";

export function sanitizeDiagnosticOutput(text: any, customKey?: string): string {
  let sanitized = sanitizeErrorString(text);
  if (customKey && customKey.trim().length > 5) {
    const escapedKey = customKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sanitized = sanitized.replace(new RegExp(escapedKey, 'g'), '[REDACTED_API_KEY]');
  }
  return sanitized;
}

export async function testModelEndpoint(
  label: string,
  url: string,
  apiKey: string,
  isAnalysis = false,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean; status?: number | string; error?: string; response?: string }> {
  try {
    const payload: Record<string, any> = {
      contents: [{ parts: [{ text: "ping" }] }]
    };
    if (isAnalysis) {
      payload.generationConfig = {
        thinkingConfig: {
          thinkingBudget: 0
        }
      };
    }

    const resp = await fetchFn(`${url}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (resp.status === 200) {
      console.log(`✅ ${label}: ACTIVE (200 OK)`);
      return { ok: true, status: 200 };
    } else {
      const text = await resp.text();
      const sanitized = sanitizeDiagnosticOutput(text, apiKey);
      console.log(`❌ ${label}: FAILED (HTTP ${resp.status})`);
      console.log(`   Response: ${sanitized.substring(0, 300)}`);
      return { ok: false, status: resp.status, response: sanitized };
    }
  } catch (e: any) {
    const sanitizedError = sanitizeDiagnosticOutput(e && e.message ? e.message : String(e), apiKey);
    console.log(`❌ ${label}: ERROR (${sanitizedError})`);
    return { ok: false, error: sanitizedError };
  }
}

export async function main(fetchFn: typeof fetch = fetch) {
  console.log("==================================================");
  console.log("      Gemini AI Model Health & Diagnostics");
  console.log("==================================================");

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  const triageUrl = CONFIG.GEMINI_API_URL_TRIAGE;
  const analysisUrl = CONFIG.GEMINI_API_URL_ANALYSIS;

  console.log(`Triage Endpoint:   ${triageUrl}`);
  console.log(`Analysis Endpoint: ${analysisUrl}`);
  console.log("--------------------------------------------------");

  if (!apiKey) {
    console.log("⚠️  No GEMINI_API_KEY or GOOGLE_API_KEY found in process environment.");
    console.log("   To run a live API test against Google Servers, run:");
    console.log("   $env:GEMINI_API_KEY=\"your_api_key\"; npm run check-models\n");
    return;
  }

  await testModelEndpoint("Triage Model  (Flash-Lite)", triageUrl, apiKey, false, fetchFn);
  await testModelEndpoint("Analysis Model (Flash)     ", analysisUrl, apiKey, true, fetchFn);

  console.log("--------------------------------------------------");
  console.log("Fetching available models list from Google API...");
  try {
    const listResp = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (listResp.status === 200) {
      const data: any = await listResp.json();
      console.log("\nActive Available Gemini Models:");
      if (data.models && Array.isArray(data.models)) {
        data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
          .forEach((m: any) => {
            console.log(`  - ${m.name} (${m.displayName || "Model"})`);
          });
      }
    } else {
      const errText = await listResp.text();
      console.log(`Failed to list models: HTTP ${listResp.status} - ${sanitizeDiagnosticOutput(errText, apiKey)}`);
    }
  } catch (e: any) {
    console.log(`Failed to list models: ${sanitizeDiagnosticOutput(e && e.message ? e.message : String(e), apiKey)}`);
  }
  console.log("==================================================\n");
}

if (process.argv[1] && process.argv[1].includes("check-models")) {
  main().catch((err: any) => {
    console.error(sanitizeDiagnosticOutput(err));
  });
}
