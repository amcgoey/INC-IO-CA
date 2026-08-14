/**
 * @file TemplateFormatCompiler.ts
 * @description Tier 1 stateless format string parser, evaluator, and Sheets formula compiler.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

export class TemplateFormatCompiler {
  /**
   * Extracts all unique variable token names from a ${variable} format string.
   */
  public static extractVariableTokens(formatStr: string): string[] {
    if (!formatStr) return [];
    const regex = /\${([^}]+)\}/g;
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

    let result = formatStr.replace(/\${([^}]+)\}/g, (_, varName) => {
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
   * Compiles a format string into a Google Sheets TEXTJOIN formula.
   */
  public static compileToSheetsFormula(
    formatStr: string,
    columnMap?: Record<string, string>
  ): string {
    if (!formatStr) return '=TEXTJOIN("-", TRUE, "")';

    // Detect primary delimiter in the template
    let delimiter = '-';
    if (formatStr.includes('/')) {
      delimiter = '/';
    } else if (formatStr.includes('-')) {
      delimiter = '-';
    } else if (formatStr.includes('_')) {
      delimiter = '_';
    }

    // Split formatStr by delimiter
    const segments = formatStr.split(delimiter);
    const formulaArgs: string[] = [];

    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;

      const varMatch = trimmed.match(/^\${([^}]+)\}$/);
      if (varMatch) {
        const varName = varMatch[1];
        const cellRef = columnMap ? columnMap[varName] || varName : varName;
        formulaArgs.push(cellRef);
      } else {
        // Static literal segment
        formulaArgs.push(JSON.stringify(trimmed));
      }
    }

    return `=TEXTJOIN("${delimiter}", TRUE, ${formulaArgs.join(', ')})`;
  }
}
