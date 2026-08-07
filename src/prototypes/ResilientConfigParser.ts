/**
 * @file ResilientConfigParser.ts
 * @description Tier 1 Pure Core logic prototype for Issue #129: Resilient Config Parser & Recovery Engine.
 * Recovers from non-technical user input errors (smart quotes, missing range colons, ambiguous booleans/arrays,
 * formatted numbers, and loose enums) without crashing execution.
 */

export type FieldType = "string" | "boolean" | "number" | "range" | "list" | "enum";

export type IssueSeverity = "INFO" | "RECOVERED" | "WARNING" | "ERROR";

export interface RecoveryIssue {
  field: string;
  severity: IssueSeverity;
  rawInput: string;
  recoveredValue: any;
  message: string;
}

export interface FieldDefinition {
  key: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: any;
  allowedValues?: string[]; // for enum fields
}

export interface ManifestSchema {
  fields: Record<string, FieldDefinition>;
}

export interface ParseResult<T = Record<string, any>> {
  config: T;
  issues: RecoveryIssue[];
  success: boolean;
}

/**
 * Strips non-technical text quirks:
 * - Smart quotes (“”, ‘’, ``, ´) -> straight quotes ("")
 * - Non-breaking spaces (\u00A0, \u200B) -> standard spaces
 * - Leading apostrophe (' used in Excel/Sheets to force text)
 * - Em-dashes in range strings (A4—Z -> A4-Z)
 * - Outer whitespace trimming
 */
export function sanitizeRawInput(raw: any): string {
  if (raw === null || raw === undefined) {
    return "";
  }
  let str = String(raw);

  // Replace smart double quotes
  str = str.replace(/[“”„«»]/g, '"');

  // Replace smart single quotes
  str = str.replace(/[‘’`´]/g, "'");

  // Replace non-breaking spaces and zero-width spaces
  str = str.replace(/[\u00A0\u200B\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]/g, " ");

  // Trim whitespace
  str = str.trim();

  // Strip wrapping outer double or single quotes if they enclose the full value and are not sheet range specifiers
  if (
    (str.startsWith('"') && str.endsWith('"') && str.length >= 2) ||
    (str.startsWith("'") && str.endsWith("'") && str.length >= 2 && !str.includes("!"))
  ) {
    str = str.substring(1, str.length - 1).trim();
  }

  // Strip leading apostrophe if present (' used in Sheets/Excel to force text mode, e.g. "'123" or "'true")
  // Do not strip if it is a quoted sheet name e.g. "'Sheet Name' A4:Z"
  const isQuotedSheetTitle = /^'[A-Za-z0-9_ ]+'\s+[A-Za-z0-9]/.test(str);
  if (str.startsWith("'") && !str.endsWith("'") && !str.includes("!") && !isQuotedSheetTitle) {
    str = str.substring(1).trim();
  }

  return str;
}

/**
 * Resiliently parses boolean values from ambiguous human inputs:
 * "YES", "Y", "TRUE", "true", "1", "ENABLE", "ENABLED", "ACTIVE", "[TRUE]", "\"YES\"", "ON" -> true
 * "NO", "N", "FALSE", "false", "0", "DISABLE", "DISABLED", "INACTIVE", "[FALSE]", "\"NO\"", "OFF" -> false
 */
export function parseResilientBoolean(
  raw: any,
  fieldKey: string,
  defaultValue: boolean = false
): { value: boolean; issue?: RecoveryIssue } {
  const sanitized = sanitizeRawInput(raw);
  if (!sanitized) {
    return {
      value: defaultValue,
      issue: {
        field: fieldKey,
        severity: "INFO",
        rawInput: String(raw),
        recoveredValue: defaultValue,
        message: `Empty boolean input; used default value (${defaultValue}).`
      }
    };
  }

  // Strip brackets and quotes: "[TRUE]" -> "TRUE", "\"yes\"" -> "yes"
  const cleanStr = sanitized.replace(/^[\["']+|[\]"']+$|\s/g, "").toLowerCase();

  const TRUTHY_SYNONYMS = new Set(["true", "yes", "y", "1", "enable", "enabled", "active", "on"]);
  const FALSY_SYNONYMS = new Set(["false", "no", "n", "0", "disable", "disabled", "inactive", "off"]);

  if (TRUTHY_SYNONYMS.has(cleanStr)) {
    const isExactMatch = sanitized === "true" || sanitized === "false";
    return {
      value: true,
      issue: !isExactMatch
        ? {
            field: fieldKey,
            severity: "RECOVERED",
            rawInput: String(raw),
            recoveredValue: true,
            message: `Normalized ambiguous truthy string "${sanitized}" to true.`
          }
        : undefined
    };
  }

  if (FALSY_SYNONYMS.has(cleanStr)) {
    const isExactMatch = sanitized === "false";
    return {
      value: false,
      issue: !isExactMatch
        ? {
            field: fieldKey,
            severity: "RECOVERED",
            rawInput: String(raw),
            recoveredValue: false,
            message: `Normalized ambiguous falsy string "${sanitized}" to false.`
          }
        : undefined
    };
  }

  // Unrecognized string -> recover with default
  return {
    value: defaultValue,
    issue: {
      field: fieldKey,
      severity: "WARNING",
      rawInput: String(raw),
      recoveredValue: defaultValue,
      message: `Unrecognized boolean input "${sanitized}"; recovered using default (${defaultValue}).`
    }
  };
}

/**
 * Resiliently parses sheet cell ranges and Named Ranges:
 * "A4-Z", "A4..Z", "A4 Z", "A4:", ":Z", "'Sheet 1' A4:Z" -> standard A1 notation range
 * Arbitrary fallback ranges (e.g. hardcoded "A4:Z") are strictly forbidden to prevent sheet corruption.
 */
export function parseResilientRange(
  raw: any,
  fieldKey: string,
  defaultValue?: string
): { value: string; issue?: RecoveryIssue } {
  const sanitized = sanitizeRawInput(raw);
  if (!sanitized) {
    if (defaultValue) {
      return {
        value: defaultValue,
        issue: {
          field: fieldKey,
          severity: "INFO",
          rawInput: String(raw),
          recoveredValue: defaultValue,
          message: `Empty range input; used schema default Named Range "${defaultValue}".`
        }
      };
    }
    return {
      value: "",
      issue: {
        field: fieldKey,
        severity: "ERROR",
        rawInput: String(raw),
        recoveredValue: null,
        message: `Missing cell range input for "${fieldKey}". Arbitrary range defaulting is forbidden to prevent structural sheet corruption.`
      }
    };
  }

  let repaired = sanitized;
  let changesMade: string[] = [];

  // Separate sheet prefix if present, or detect missing sheet prefix space e.g. "'Submittal Support' A4-Z"
  const missingExclMatch = repaired.match(/^(['"]?[A-Za-z0-9_ ]+['"]?)\s+([A-Za-z0-9:\-—\.\.\s]+)$/);
  if (missingExclMatch && !repaired.includes("!")) {
    repaired = `${missingExclMatch[1]}!${missingExclMatch[2]}`;
    changesMade.push("Added missing '!' sheet separator");
  }

  let prefix = "";
  let rangeBody = repaired;
  if (repaired.includes("!")) {
    const exIndex = repaired.lastIndexOf("!");
    let sheetName = repaired.substring(0, exIndex).trim();
    rangeBody = repaired.substring(exIndex + 1).trim();

    // Ensure sheet name with spaces is properly wrapped in single quotes
    if (sheetName.includes(" ") && !sheetName.startsWith("'")) {
      sheetName = `'${sheetName}'`;
    }
    prefix = `${sheetName}!`;
  }

  // Replace em-dash, en-dash, hyphens, double dots, or spaces with colon inside range body
  if (rangeBody.includes("-") || rangeBody.includes("—") || rangeBody.includes("..") || rangeBody.includes(" ")) {
    const oldBody = rangeBody;
    rangeBody = rangeBody.replace(/[\-\—\.\.\s]+/g, ":");
    changesMade.push(`Replaced delimiter in "${oldBody}" with ":"`);
  }

  // Fix open-ended missing bounds: "A4:" -> "A4:Z", ":Z" -> "A1:Z"
  if (rangeBody.endsWith(":")) {
    rangeBody += "Z";
    changesMade.push("Completed open-ended trailing range bound to ':Z'");
  } else if (rangeBody.startsWith(":")) {
    rangeBody = "A1" + rangeBody;
    changesMade.push("Completed open-ended leading range bound to 'A1:'");
  }

  repaired = prefix + rangeBody;

  const rangeSyntaxRegex = /^('?[A-Za-z0-9_ ]+'?!)?[A-Za-z]+[0-9]*:[A-Za-z]+[0-9]*$/;
  if (!rangeSyntaxRegex.test(repaired)) {
    // If it's a single word without numbers/colons, could be a Named Range e.g. "CONFIG_RANGE"
    const isNamedRange = /^[A-Za-z_][A-Za-z0-9_]*$/.test(repaired);
    if (!isNamedRange) {
      if (defaultValue) {
        return {
          value: defaultValue,
          issue: {
            field: fieldKey,
            severity: "WARNING",
            rawInput: String(raw),
            recoveredValue: defaultValue,
            message: `Invalid range syntax "${sanitized}"; recovered using explicit schema default "${defaultValue}".`
          }
        };
      }
      return {
        value: "",
        issue: {
          field: fieldKey,
          severity: "ERROR",
          rawInput: String(raw),
          recoveredValue: null,
          message: `Invalid cell range syntax "${sanitized}" for "${fieldKey}". Arbitrary range defaulting is forbidden.`
        }
      };
    }
  }

  return {
    value: repaired,
    issue: changesMade.length > 0
      ? {
          field: fieldKey,
          severity: "RECOVERED",
          rawInput: String(raw),
          recoveredValue: repaired,
          message: `Recovered range: ${changesMade.join("; ")}.`
        }
      : undefined
  };
}

/**
 * Resiliently parses array / list entries from ambiguous delimiters or literal JSON arrays:
 * "Submittal Arch, Submittal FFE"
 * "Submittal Arch | Submittal FFE"
 * "Submittal Arch; Submittal FFE"
 * "[\"Submittal Arch\", \"Submittal FFE\"]"
 */
export function parseResilientList(
  raw: any,
  fieldKey: string,
  defaultValue: string[] = []
): { value: string[]; issue?: RecoveryIssue } {
  const sanitized = sanitizeRawInput(raw);
  if (!sanitized) {
    return {
      value: defaultValue,
      issue: {
        field: fieldKey,
        severity: "INFO",
        rawInput: String(raw),
        recoveredValue: defaultValue,
        message: `Empty list input; used default empty list.`
      }
    };
  }

  let items: string[] = [];
  let recoveryNote = "";

  // Attempt JSON parsing if enclosed in brackets
  if (sanitized.startsWith("[") && sanitized.endsWith("]")) {
    try {
      const parsedJson = JSON.parse(sanitized);
      if (Array.isArray(parsedJson)) {
        items = parsedJson.map((item) => sanitizeRawInput(item)).filter(Boolean);
        recoveryNote = "Parsed literal JSON array string";
      }
    } catch {
      // Fallback to regex splitting if JSON parsing fails
    }
  }

  if (items.length === 0) {
    // Split by multi-delimiters: newline, pipe, semicolon, comma
    const rawTokens = sanitized.split(/[\r\n;|]+/);
    let finalTokens: string[] = [];
    for (const token of rawTokens) {
      const commaTokens = token.split(",");
      finalTokens.push(...commaTokens);
    }

    items = finalTokens
      .map((item) => sanitizeRawInput(item).replace(/^["']+|["']+$/g, "").trim())
      .filter((item) => item.length > 0);

    if (sanitized.includes("|") || sanitized.includes(";") || sanitized.includes("\n")) {
      recoveryNote = "Normalized list using multi-delimiter fallback (pipe/semicolon/newline)";
    }
  }

  return {
    value: items.length > 0 ? items : defaultValue,
    issue: recoveryNote
      ? {
          field: fieldKey,
          severity: "RECOVERED",
          rawInput: String(raw),
          recoveredValue: items,
          message: `${recoveryNote}. Extracted ${items.length} items.`
        }
      : undefined
  };
}

/**
 * Resiliently parses numeric input with currency, formatting commas, or units:
 * "$1,500.00", "500 ms", "80%", "1 000" -> number
 */
export function parseResilientNumber(
  raw: any,
  fieldKey: string,
  defaultValue: number = 0
): { value: number; issue?: RecoveryIssue } {
  const sanitized = sanitizeRawInput(raw);
  if (!sanitized) {
    return {
      value: defaultValue,
      issue: {
        field: fieldKey,
        severity: "INFO",
        rawInput: String(raw),
        recoveredValue: defaultValue,
        message: `Empty numeric input; used default value (${defaultValue}).`
      }
    };
  }

  // Strip currency symbols, commas, trailing unit text (ms, px, %, sec)
  const cleanedNumStr = sanitized
    .replace(/[$€£¥,]/g, "")
    .replace(/%\s*$/, "")
    .replace(/\s*(ms|px|sec|seconds|rows|cells|kb|mb)$/i, "")
    .trim();

  const parsed = parseFloat(cleanedNumStr);

  if (isNaN(parsed)) {
    return {
      value: defaultValue,
      issue: {
        field: fieldKey,
        severity: "WARNING",
        rawInput: String(raw),
        recoveredValue: defaultValue,
        message: `Could not parse number from "${sanitized}"; recovered using default (${defaultValue}).`
      }
    };
  }

  const isExactNumeric = sanitized === String(parsed);
  return {
    value: parsed,
    issue: !isExactNumeric
      ? {
          field: fieldKey,
          severity: "RECOVERED",
          rawInput: String(raw),
          recoveredValue: parsed,
          message: `Stripped formatting/units from "${sanitized}" -> ${parsed}.`
        }
      : undefined
  };
}

/**
 * Resiliently parses Enum / Keyword strings into UPPER_SNAKE_CASE:
 * "submittal arch" -> "SUBMITTAL_ARCH"
 */
export function parseResilientEnum(
  raw: any,
  fieldKey: string,
  allowedValues?: string[],
  defaultValue?: string
): { value: string; issue?: RecoveryIssue } {
  const sanitized = sanitizeRawInput(raw);
  const fallback = defaultValue || (allowedValues && allowedValues[0]) || "";

  if (!sanitized) {
    return {
      value: fallback,
      issue: {
        field: fieldKey,
        severity: "INFO",
        rawInput: String(raw),
        recoveredValue: fallback,
        message: `Empty enum input; used default "${fallback}".`
      }
    };
  }

  // Convert "submittal arch" -> "SUBMITTAL_ARCH"
  const normalizedKey = sanitized
    .toUpperCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");

  if (allowedValues && allowedValues.length > 0) {
    const matched = allowedValues.find((val) => val.toUpperCase() === normalizedKey);
    if (matched) {
      const isExact = sanitized === matched;
      return {
        value: matched,
        issue: !isExact
          ? {
              field: fieldKey,
              severity: "RECOVERED",
              rawInput: String(raw),
              recoveredValue: matched,
              message: `Normalized enum value "${sanitized}" to "${matched}".`
            }
          : undefined
      };
    }

    // Try fuzzy match (contains)
    const fuzzy = allowedValues.find((val) => normalizedKey.includes(val.toUpperCase()));
    if (fuzzy) {
      return {
        value: fuzzy,
        issue: {
          field: fieldKey,
          severity: "RECOVERED",
          rawInput: String(raw),
          recoveredValue: fuzzy,
          message: `Fuzzy matched enum "${sanitized}" to "${fuzzy}".`
        }
      };
    }

    return {
      value: fallback,
      issue: {
        field: fieldKey,
        severity: "WARNING",
        rawInput: String(raw),
        recoveredValue: fallback,
        message: `Invalid enum option "${sanitized}"; recovered using default "${fallback}".`
      }
    };
  }

  return {
    value: normalizedKey,
    issue: sanitized !== normalizedKey
      ? {
          field: fieldKey,
          severity: "RECOVERED",
          rawInput: String(raw),
          recoveredValue: normalizedKey,
          message: `Normalized key "${sanitized}" to "${normalizedKey}".`
        }
      : undefined
  };
}

/**
 * Main Resilient Config Loader Engine
 * Processes a record of raw input key-values against a manifest schema,
 * performing auto-healing on non-technical user errors.
 */
export class ResilientConfigParser {
  public parseManifest(
    schema: ManifestSchema,
    rawInputs: Record<string, any>
  ): ParseResult {
    const config: Record<string, any> = {};
    const issues: RecoveryIssue[] = [];

    for (const [key, fieldDef] of Object.entries(schema.fields)) {
      const rawVal = rawInputs[key];

      switch (fieldDef.type) {
        case "boolean": {
          const res = parseResilientBoolean(rawVal, key, fieldDef.defaultValue ?? false);
          config[key] = res.value;
          if (res.issue) issues.push(res.issue);
          break;
        }
        case "range": {
          const res = parseResilientRange(rawVal, key, fieldDef.defaultValue);
          config[key] = res.value;
          if (res.issue) issues.push(res.issue);
          if (fieldDef.required && (!res.value || res.issue?.severity === "ERROR")) {
            if (!issues.some((i) => i.field === key && i.severity === "ERROR")) {
              issues.push({
                field: key,
                severity: "ERROR",
                rawInput: String(rawVal),
                recoveredValue: null,
                message: `Required range field "${key}" is missing or unparseable. Arbitrary defaults are forbidden.`
              });
            }
          }
          break;
        }
        case "list": {
          const res = parseResilientList(rawVal, key, fieldDef.defaultValue ?? []);
          config[key] = res.value;
          if (res.issue) issues.push(res.issue);
          break;
        }
        case "number": {
          const res = parseResilientNumber(rawVal, key, fieldDef.defaultValue ?? 0);
          config[key] = res.value;
          if (res.issue) issues.push(res.issue);
          break;
        }
        case "enum": {
          const res = parseResilientEnum(rawVal, key, fieldDef.allowedValues, fieldDef.defaultValue);
          config[key] = res.value;
          if (res.issue) issues.push(res.issue);
          break;
        }
        case "string":
        default: {
          const sanitized = sanitizeRawInput(rawVal);
          const val = sanitized || fieldDef.defaultValue || "";
          config[key] = val;
          if (rawVal !== undefined && rawVal !== val) {
            issues.push({
              field: key,
              severity: "RECOVERED",
              rawInput: String(rawVal),
              recoveredValue: val,
              message: `Sanitized smart quotes/whitespace from string input.`
            });
          }
          break;
        }
      }
    }

    const hasErrors = issues.some((iss) => iss.severity === "ERROR");
    return {
      config,
      issues,
      success: !hasErrors
    };
  }
}
