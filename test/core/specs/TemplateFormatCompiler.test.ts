import { describe, it, expect } from 'vitest';
import { TemplateFormatCompiler } from '../../../src/core/specs/TemplateFormatCompiler';

describe('TemplateFormatCompiler', () => {
  describe('extractVariableTokens', () => {
    it('should extract all unique token names from a format string', () => {
      const tokens = TemplateFormatCompiler.extractVariableTokens(
        '${section}-${number}-${revision}-${section}'
      );
      expect(tokens).toEqual(['section', 'number', 'revision']);
    });

    it('should return an empty array if no tokens are present', () => {
      const tokens = TemplateFormatCompiler.extractVariableTokens('static-string');
      expect(tokens).toEqual([]);
    });
  });

  describe('evaluate', () => {
    it('should evaluate all variables when fully populated', () => {
      const result = TemplateFormatCompiler.evaluate(
        '${section}-${number}-${revision}',
        { section: '061000', number: '001', revision: '0' }
      );
      expect(result).toBe('061000-001-0');
    });

    it('should clean up dangling delimiters when a middle field is empty', () => {
      const result = TemplateFormatCompiler.evaluate(
        '${section}-${number}-${revision}',
        { section: '061000', number: '', revision: '0' }
      );
      expect(result).toBe('061000-0');
    });

    it('should clean up trailing delimiters when a tail field is undefined', () => {
      const result = TemplateFormatCompiler.evaluate(
        '${section}-${number}-${revision}',
        { section: '061000', number: '001', revision: undefined }
      );
      expect(result).toBe('061000-001');
    });

    it('should clean up leading delimiters when first field is null', () => {
      const result = TemplateFormatCompiler.evaluate(
        '${section}-${number}',
        { section: null, number: '001' }
      );
      expect(result).toBe('001');
    });

    it('should handle path delimiters in closed subfolder formats', () => {
      const result = TemplateFormatCompiler.evaluate(
        'Closed/${specCategory}/${specTag}',
        { specCategory: 'FBE', specTag: 'FB101' }
      );
      expect(result).toBe('Closed/FBE/FB101');
    });

    it('should handle partial path delimiters without double slashes', () => {
      const result = TemplateFormatCompiler.evaluate(
        'Closed/${specCategory}/${specTag}',
        { specCategory: '', specTag: 'FB101' }
      );
      expect(result).toBe('Closed/FB101');
    });
  });

  describe('compileToSheetsFormula', () => {
    it('should compile simple hyphen-delimited format to TEXTJOIN formula', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        '${section}-${number}-${revision}',
        { section: 'B2', number: 'C2', revision: 'D2' }
      );
      expect(formula).toBe('=TEXTJOIN("-", TRUE, B2, C2, D2)');
    });

    it('should compile prefixed path format to TEXTJOIN formula', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        'Closed/${section}',
        { section: 'B2' }
      );
      expect(formula).toBe('=TEXTJOIN("/", TRUE, "Closed", B2)');
    });

    it('should fall back to field names if no columnMap is provided', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        '${section}-${number}'
      );
      expect(formula).toBe('=TEXTJOIN("-", TRUE, section, number)');
    });

    it('should compile composite multi-token format strings with mixed delimiters into CONCATENATE formula', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        'Closed/${section}-${revision}',
        { section: 'B2', revision: 'D2' }
      );
      expect(formula).toBe('=CONCATENATE("Closed/", B2, "-", D2)');
    });

    it('should compile multi-token formats with path and hyphen delimiters into CONCATENATE formula', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        '${section}/${number}-${revision}',
        { section: 'B2', number: 'C2', revision: 'D2' }
      );
      expect(formula).toBe('=CONCATENATE(B2, "/", C2, "-", D2)');
    });

    it('should compile multi-token path formats with uniform slash delimiter into TEXTJOIN formula', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        'Closed/${specCategory}/${specTag}',
        { specCategory: 'B2', specTag: 'C2' }
      );
      expect(formula).toBe('=TEXTJOIN("/", TRUE, "Closed", B2, C2)');
    });

    it('should compile underscore-delimited format with literals into TEXTJOIN formula', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        'PREFIX_${tag}_SUFFIX',
        { tag: 'A1' }
      );
      expect(formula).toBe('=TEXTJOIN("_", TRUE, "PREFIX", A1, "SUFFIX")');
    });

    it('should handle empty format string gracefully', () => {
      expect(TemplateFormatCompiler.compileToSheetsFormula('')).toBe('=TEXTJOIN("-", TRUE, "")');
    });

    it('should compile static literal format strings without tokens into CONCATENATE formula', () => {
      expect(TemplateFormatCompiler.compileToSheetsFormula('StaticLiteralOnly')).toBe(
        '=CONCATENATE("StaticLiteralOnly")'
      );
    });
  });
});
