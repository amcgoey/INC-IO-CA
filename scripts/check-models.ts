/**
 * CLI script to verify Gemini AI model health & availability.
 * Run with: npm run check-models
 */

import { CONFIG } from "../src/Config";

async function main() {
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

  const testEndpoint = async (label: string, url: string) => {
    try {
      const resp = await fetch(`${url}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
      });

      if (resp.status === 200) {
        console.log(`✅ ${label}: ACTIVE (200 OK)`);
      } else {
        const text = await resp.text();
        console.log(`❌ ${label}: FAILED (HTTP ${resp.status})`);
        console.log(`   Response: ${text.substring(0, 300)}`);
      }
    } catch (e: any) {
      console.log(`❌ ${label}: ERROR (${e.message})`);
    }
  };

  await testEndpoint("Triage Model  (Flash-Lite)", triageUrl);
  await testEndpoint("Analysis Model (Flash)     ", analysisUrl);

  console.log("--------------------------------------------------");
  console.log("Fetching available models list from Google API...");
  try {
    const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
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
      console.log(`Failed to list models: HTTP ${listResp.status}`);
    }
  } catch (e: any) {
    console.log(`Failed to list models: ${e.message}`);
  }
  console.log("==================================================\n");
}

main().catch(console.error);
