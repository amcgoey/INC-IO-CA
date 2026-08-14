/**
 * @file TemplateFormatCompiler.ts
 * @description Tier 1 stateless format string parser, evaluator, and Sheets formula compiler.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

const VARIABLE_TOKEN_PATTERN = /\$\{([^}]+)\}/g;

export class TemplateFormatCompiler {
  /**
   * Helper to create a fresh regular expression for token matching.
   */
  private static createTokenRegex(): RegExp {
    return new RegExp(VARIABLE_TOKEN_PATTERN.source, 'g');
  }

  /**
   * Extracts all unique variable token names from a ${variable} format string.
   */
  public static extractVariableTokens(formatStr: string): string[] {
    if (!formatStr) return [];
    const regex = TemplateFormatCompiler.createTokenRegex();
    const tokens: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(formatStr)) !== null) {
      if (!tokens.includes(match[1])) {
        tokens.push(match[1]);
      }
    }
    return tokens;
  }

  /**
   * Evaluates a format string against a record of values,
   * substituting variables and cleaning up dangling delimiters.
   */
  public static evaluate(formatStr: string, record: Record<string, any>): string {
    if (!formatStr) return '';

    let result = formatStr.replace(TemplateFormatCompiler.createTokenRegex(), (_, varName) => {
      const val = record[varName];
      if (val === null || val === undefined) return '';
      return String(val).trim();
    });

    // Clean up repeated delimiters (e.g. "--" -> "-", "//" -> "/")
    result = result.replace(/([-_/. ])\1+/g, '$1');

    // Clean up delimiter collisions around slashes (e.g. "/-" or "-/")
    result = result.replace(/[-_. ]+\/|\/[-_. ]+/g, '/');

    // Trim leading and trailing delimiters
    result = result.replace(/^[-_/. ]+|[-_/. ]+$/g, '');

    return result;
  }

  /**
   * Compiles a format string into a Google Sheets =MAP(..., LAMBDA(...)) spill formula.
   * Utilizes the "Delimiter Split & TEXTJOIN" AST algorithm for delimiter collapse.
   */
  public static compileToSheetsFormula(
    formatStr: string,
    columnMap?: Record<string, string>
  ): string {
    if (!formatStr) return '=TEXTJOIN("-", TRUE, "")';

    const tokens = TemplateFormatCompiler.extractVariableTokens(formatStr);
    if (tokens.length === 0) {
      return `=CONCATENATE(${JSON.stringify(formatStr)})`;
    }

    // Candidate delimiters to check outside ${...}
    const candidateDelimiters = ['-', '/', '_', ' ', ':'];

    // Identify primary delimiter by inspecting static text outside ${...}
    const templateMasked = formatStr.replace(TemplateFormatCompiler.createTokenRegex(), '');
    let primaryDelimiter = '';
    let maxCount = 0;

    for (const d of candidateDelimiters) {
      const escapedD = '\\' + d;
      const count = (templateMasked.match(new RegExp(escapedD, 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        primaryDelimiter = d;
      }
    }

    // If single variable and no delimiter in static parts
    if (!primaryDelimiter && tokens.length === 1 && formatStr.trim() === `\${${tokens[0]}}`) {
      const token = tokens[0];
      const range = columnMap && columnMap[token] ? columnMap[token] : token;
      return `=MAP(${range}, LAMBDA(${token}, IF(ISBLANK(${token}), "", ${token})))`;
    }

    // Default to '-' if none found but tokens exist
    const delimiter = primaryDelimiter || '-';

    // Split format string into segments by primary delimiter
    const rawSegments = formatStr.split(delimiter);
    const segmentExprs: string[] = [];

    for (const seg of rawSegments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;

      const segTokens = TemplateFormatCompiler.extractVariableTokens(trimmed);
      if (segTokens.length === 0) {
        // Pure static literal segment
        segmentExprs.push(JSON.stringify(trimmed));
      } else if (trimmed === `\${${segTokens[0]}}`) {
        // Pure single variable token segment
        const varName = segTokens[0];
        segmentExprs.push(`IF(ISBLANK(${varName}), "", ${varName})`);
      } else {
        // Mixed segment (e.g. "Closed/${section}" or "PRE${tag}POST")
        // Tokenize into literal chunks and variable chunks
        const parts: string[] = [];
        const regex = TemplateFormatCompiler.createTokenRegex();
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(trimmed)) !== null) {
          if (match.index > lastIndex) {
            parts.push(JSON.stringify(trimmed.slice(lastIndex, match.index)));
          }
          parts.push(match[1]);
          lastIndex = regex.lastIndex;
        }
        if (lastIndex < trimmed.length) {
          parts.push(JSON.stringify(trimmed.slice(lastIndex)));
        }

        const concatExpr = parts.join(' & ');
        const condition =
          segTokens.length === 1
            ? `ISBLANK(${segTokens[0]})`
            : `AND(${segTokens.map((t) => `ISBLANK(${t})`).join(', ')})`;

        segmentExprs.push(`IF(${condition}, "", ${concatExpr})`);
      }
    }

    const lambdaBody =
      segmentExprs.length === 1 && !primaryDelimiter
        ? segmentExprs[0]
        : `TEXTJOIN("${delimiter}", TRUE, ${segmentExprs.join(', ')})`;

    const ranges = tokens.map((t) => (columnMap && columnMap[t] ? columnMap[t] : t));
    const lambdaArgs = tokens.join(', ');

    return `=MAP(${ranges.join(', ')}, LAMBDA(${lambdaArgs}, ${lambdaBody}))`;
  }
}
