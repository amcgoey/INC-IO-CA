import test from "node:test";
import assert from "node:assert";
import { testModelEndpoint, sanitizeDiagnosticOutput } from "../scripts/check-models";

test("check-models: testModelEndpoint sends thinkingConfig with thinkingBudget 0 for analysis endpoint", async () => {
  let capturedPayload: any = null;
  let capturedUrl = "";

  const mockFetch = async (url: any, init?: any) => {
    capturedUrl = String(url);
    capturedPayload = JSON.parse(init.body);
    return {
      status: 200,
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "pong" }] } }] })
    } as any;
  };

  const result = await testModelEndpoint(
    "Analysis Model (Flash)",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    "AIzaSyDummyKey12345678901234567890",
    true,
    mockFetch as any
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 200);
  assert.ok(capturedUrl.includes("AIzaSyDummyKey12345678901234567890"));
  assert.deepStrictEqual(capturedPayload.generationConfig, {
    thinkingConfig: { thinkingBudget: 0 }
  });
});

test("check-models: testModelEndpoint omits thinkingConfig for triage endpoint", async () => {
  let capturedPayload: any = null;

  const mockFetch = async (_url: any, init?: any) => {
    capturedPayload = JSON.parse(init.body);
    return {
      status: 200,
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "pong" }] } }] })
    } as any;
  };

  const result = await testModelEndpoint(
    "Triage Model (Flash-Lite)",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    "AIzaSyDummyKey12345678901234567890",
    false,
    mockFetch as any
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(capturedPayload.generationConfig, undefined);
});

test("check-models: testModelEndpoint redacts API key and secrets on HTTP failure response", async () => {
  const secretKey = "AIzaSyLeakedSecretKeyInResponse_12345";
  const mockFetch = async () => {
    return {
      status: 400,
      text: async () => `Error 400: API key ${secretKey} is invalid`
    } as any;
  };

  const result = await testModelEndpoint(
    "Analysis Model",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    secretKey,
    true,
    mockFetch as any
  );

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 400);
  assert.ok(result.response);
  assert.ok(!result.response.includes(secretKey), "Error response should redact secret API key");
  assert.ok(result.response.includes("[REDACTED_API_KEY]"));
});

test("check-models: testModelEndpoint redacts API key on network/fetch exception", async () => {
  const secretKey = "AIzaSyExceptionSecretKey_98765";
  const mockFetch = async () => {
    throw new Error(`Failed to fetch https://endpoint.test?key=${secretKey}`);
  };

  const result = await testModelEndpoint(
    "Analysis Model",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    secretKey,
    true,
    mockFetch as any
  );

  assert.strictEqual(result.ok, false);
  assert.ok(result.error);
  assert.ok(!result.error.includes(secretKey), "Exception message should redact secret API key");
  assert.ok(result.error.includes("[REDACTED_API_KEY]"));
});

test("check-models: sanitizeDiagnosticOutput redacts both standard AIza Google keys and custom keys", () => {
  const output1 = sanitizeDiagnosticOutput("Google error with AIzaSyDirectSecretKey1234567890 embedded");
  assert.ok(!output1.includes("AIzaSyDirectSecretKey1234567890"));
  assert.ok(output1.includes("[REDACTED_API_KEY]"));

  const customSecret = "custom-secret-token-abcdef";
  const output2 = sanitizeDiagnosticOutput(`Failed auth: token=${customSecret}`, customSecret);
  assert.ok(!output2.includes(customSecret));
  assert.ok(output2.includes("[REDACTED_API_KEY]"));
});
