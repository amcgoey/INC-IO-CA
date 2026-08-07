import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ResilientConfigParser,
  parseResilientBoolean,
  parseResilientRange,
  parseResilientList,
  parseResilientNumber,
  parseResilientEnum,
  sanitizeRawInput,
  ManifestSchema
} from "../src/prototypes/ResilientConfigParser";

describe("ResilientConfigParser & Input Recovery Unit Tests", () => {
  it("sanitizeRawInput strips smart quotes, zero-width spaces, and wrapping outer quotes", () => {
    assert.strictEqual(sanitizeRawInput("“YES”"), "YES");
    assert.strictEqual(sanitizeRawInput("‘submittal arch’"), "submittal arch");
    assert.strictEqual(sanitizeRawInput("'true"), "true");
    assert.strictEqual(sanitizeRawInput("\u00A0A4:Z\u200B"), "A4:Z");
  });

  it("parseResilientBoolean normalizes truthy and falsy human inputs", () => {
    assert.strictEqual(parseResilientBoolean("YES", "ENABLED").value, true);
    assert.strictEqual(parseResilientBoolean("[TRUE]", "ENABLED").value, true);
    assert.strictEqual(parseResilientBoolean("ENABLE", "ENABLED").value, true);
    assert.strictEqual(parseResilientBoolean("1", "ENABLED").value, true);

    assert.strictEqual(parseResilientBoolean("NO", "AUTO_MIGRATE").value, false);
    assert.strictEqual(parseResilientBoolean("DISABLED", "AUTO_MIGRATE").value, false);
    assert.strictEqual(parseResilientBoolean("0", "AUTO_MIGRATE").value, false);

    // Default recovery for unrecognized input
    const unrec = parseResilientBoolean("MAYBE", "ENABLED", true);
    assert.strictEqual(unrec.value, true);
    assert.strictEqual(unrec.issue?.severity, "WARNING");
  });

  it("parseResilientRange fixes missing exclamation marks, open-ended bounds, and delimiters", () => {
    // Missing '!' sheet separator and dash delimiter
    const range1 = parseResilientRange("'Submittal Support' A4-Z", "DATA_RANGE");
    assert.strictEqual(range1.value, "'Submittal Support'!A4:Z");
    assert.strictEqual(range1.issue?.severity, "RECOVERED");

    // Double dot delimiter
    const range2 = parseResilientRange("A4..Z", "DATA_RANGE");
    assert.strictEqual(range2.value, "A4:Z");

    // Trailing open-ended colon
    const range3 = parseResilientRange("A4:", "DATA_RANGE");
    assert.strictEqual(range3.value, "A4:Z");

    // Invalid range syntax without schema default returns ERROR
    const range4 = parseResilientRange("INVALID!!!", "DATA_RANGE");
    assert.strictEqual(range4.value, "");
    assert.strictEqual(range4.issue?.severity, "ERROR");

    // Empty range without schema default returns ERROR
    const range5 = parseResilientRange("", "DATA_RANGE");
    assert.strictEqual(range5.value, "");
    assert.strictEqual(range5.issue?.severity, "ERROR");
  });

  it("parseResilientList handles multi-delimiters and literal JSON arrays", () => {
    const list1 = parseResilientList("Submittal Arch | Submittal FFE ; RFI Log", "SUPPORTED_LOGS");
    assert.deepStrictEqual(list1.value, ["Submittal Arch", "Submittal FFE", "RFI Log"]);

    const list2 = parseResilientList('["Submittal Arch", "Submittal FFE"]', "SUPPORTED_LOGS");
    assert.deepStrictEqual(list2.value, ["Submittal Arch", "Submittal FFE"]);
    assert.strictEqual(list2.issue?.message.includes("JSON"), true);
  });

  it("parseResilientNumber strips formatting, currency, and unit suffixes", () => {
    assert.strictEqual(parseResilientNumber("21,600,000", "TTL").value, 21600000);
    assert.strictEqual(parseResilientNumber("500 ms", "TTL").value, 500);
    assert.strictEqual(parseResilientNumber("$50,000.00", "COST").value, 50000);

    const badNum = parseResilientNumber("NOT_A_NUM", "COST", 100);
    assert.strictEqual(badNum.value, 100);
    assert.strictEqual(badNum.issue?.severity, "WARNING");
  });

  it("parseResilientEnum normalizes strings into UPPER_SNAKE_CASE with fallback", () => {
    const en1 = parseResilientEnum("submittal arch", "DOC_KEY", ["SUBMITTAL_ARCH", "SUBMITTAL_FFE"]);
    assert.strictEqual(en1.value, "SUBMITTAL_ARCH");

    const en2 = parseResilientEnum("submittal-ffe", "DOC_KEY", ["SUBMITTAL_ARCH", "SUBMITTAL_FFE"]);
    assert.strictEqual(en2.value, "SUBMITTAL_FFE");

    const en3 = parseResilientEnum("UNKNOWN", "DOC_KEY", ["SUBMITTAL_ARCH"], "SUBMITTAL_ARCH");
    assert.strictEqual(en3.value, "SUBMITTAL_ARCH");
    assert.strictEqual(en3.issue?.severity, "WARNING");
  });

  it("ResilientConfigParser processes full manifest schema resiliently", () => {
    const parser = new ResilientConfigParser();
    const schema: ManifestSchema = {
      fields: {
        ENABLED: { key: "ENABLED", type: "boolean", defaultValue: true },
        DOC_TYPE_KEY: { key: "DOC_TYPE_KEY", type: "enum", allowedValues: ["SUBMITTAL_ARCH"], defaultValue: "SUBMITTAL_ARCH" },
        DATA_RANGE: { key: "DATA_RANGE", type: "range", defaultValue: "A4:Z" },
        CACHE_TTL_MS: { key: "CACHE_TTL_MS", type: "number", defaultValue: 1000 }
      }
    };

    const rawInputs = {
      ENABLED: "“YES”",
      DOC_TYPE_KEY: "‘submittal arch’",
      DATA_RANGE: "A4-Z",
      CACHE_TTL_MS: "‘5,000 ms’"
    };

    const res = parser.parseManifest(schema, rawInputs);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.config.ENABLED, true);
    assert.strictEqual(res.config.DOC_TYPE_KEY, "SUBMITTAL_ARCH");
    assert.strictEqual(res.config.DATA_RANGE, "A4:Z");
    assert.strictEqual(res.config.CACHE_TTL_MS, 5000);
    assert.strictEqual(res.issues.length > 0, true);
  });
});
