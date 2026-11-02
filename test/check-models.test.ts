import { describe, it, expect } from "vitest";
import { testModelEndpoint, sanitizeDiagnosticOutput } from "../scripts/check-models";

describe("check-models CLI diagnostics", () => {
  it("sends thinkingConfig with thinkingBudget 0 for analysis endpoint", async () => {
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

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(capturedUrl).toContain("AIzaSyDummyKey12345678901234567890");
    expect(capturedPayload.generationConfig).toEqual({
      thinkingConfig: { thinkingBudget: 0 }
    });
  });

  it("omits thinkingConfig for triage endpoint", async () => {
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

    expect(result.ok).toBe(true);
    expect(capturedPayload.generationConfig).toBeUndefined();
  });

  it("redacts API key and secrets on HTTP failure response", async () => {
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

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.response).toBeDefined();
    expect(result.response).not.toContain(secretKey);
    expect(result.response).toContain("[REDACTED_API_KEY]");
  });

  it("redacts API key on network/fetch exception", async () => {
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

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain(secretKey);
    expect(result.error).toContain("[REDACTED_API_KEY]");
  });

  it("sanitizeDiagnosticOutput redacts both standard AIza Google keys and custom keys", () => {
    const output1 = sanitizeDiagnosticOutput("Google error with AIzaSyDirectSecretKey1234567890 embedded");
    expect(output1).not.toContain("AIzaSyDirectSecretKey1234567890");
    expect(output1).toContain("[REDACTED_API_KEY]");

    const customSecret = "custom-secret-token-abcdef";
    const output2 = sanitizeDiagnosticOutput(`Failed auth: token=${customSecret}`, customSecret);
    expect(output2).not.toContain(customSecret);
    expect(output2).toContain("[REDACTED_API_KEY]");
  });
});
