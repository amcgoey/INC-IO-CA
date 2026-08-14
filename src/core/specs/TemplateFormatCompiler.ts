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
   * Compiles a format string into a Google Sheets formula (TEXTJOIN or CONCATENATE).
   */
  public static compileToSheetsFormula(
    formatStr: string,
    columnMap?: Record<string, string>
  ): string {
    if (!formatStr) return '=TEXTJOIN("-", TRUE, "")';

    // Check if the format string can be cleanly partitioned by a single primary delimiter
    const delimiters = ['/', '-', '_'];
    for (const delimiter of delimiters) {
      if (formatStr.includes(delimiter)) {
        // Ensure no other delimiters exist in the format string
        const otherDelimiters = delimiters.filter((d) => d !== delimiter);
        const hasOtherDelimiters = otherDelimiters.some((d) => formatStr.includes(d));

        if (!hasOtherDelimiters) {
          const segments = formatStr.split(delimiter);
          const formulaArgs: string[] = [];
          let isClean = true;

          for (const seg of segments) {
            const trimmed = seg.trim();
            if (!trimmed) continue;

            const varMatch = trimmed.match(/^\${([^}]+)\}$/);
            if (varMatch) {
              const varName = varMatch[1];
              const cellRef = columnMap ? columnMap[varName] || varName : varName;
              formulaArgs.push(cellRef);
            } else if (!seg.includes('${')) {
              // Static literal segment without any embedded variables
              formulaArgs.push(JSON.stringify(trimmed));
            } else {
              // Contains partial or mixed token syntax
              isClean = false;
              break;
            }
          }

          if (isClean && formulaArgs.length > 0) {
            return `=TEXTJOIN("${delimiter}", TRUE, ${formulaArgs.join(', ')})`;
          }
        }
      }
    }

    // Composite, multi-delimiter, or mixed token format: compile via tokenization into CONCATENATE
    const regex = /\${([^}]+)\}/g;
    const formulaArgs: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(formatStr)) !== null) {
      if (match.index > lastIndex) {
        const literal = formatStr.slice(lastIndex, match.index);
        formulaArgs.push(JSON.stringify(literal));
      }
      const varName = match[1];
      const cellRef = columnMap ? columnMap[varName] || varName : varName;
      formulaArgs.push(cellRef);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < formatStr.length) {
      const literal = formatStr.slice(lastIndex);
      formulaArgs.push(JSON.stringify(literal));
    }

    if (formulaArgs.length === 0) {
      return '=TEXTJOIN("-", TRUE, "")';
    }

    return `=CONCATENATE(${formulaArgs.join(', ')})`;
  }
}
