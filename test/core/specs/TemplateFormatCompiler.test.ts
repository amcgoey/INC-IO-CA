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
    it('should compile simple hyphen-delimited format to MAP LAMBDA TEXTJOIN spill formula with empty/buffer-row guard', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        '${section}-${number}-${revision}',
        { section: 'B5:B', number: 'C5:C', revision: 'D5:D' }
      );
      expect(formula).toBe(
        '=MAP(B5:B, C5:C, D5:D, LAMBDA(section, number, revision, IF(OR(ISBLANK(section), section=""), "", TEXTJOIN("-", TRUE, IF(ISBLANK(section), "", section), IF(ISBLANK(number), "", number), IF(ISBLANK(revision), "", revision)))))'
      );
    });

    it('should compile prefixed path format with empty/buffer-row guard preventing static literal spill on empty row', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        'Closed/${section}',
        { section: 'B5:B' }
      );
      expect(formula).toBe(
        '=MAP(B5:B, LAMBDA(section, IF(OR(ISBLANK(section), section=""), "", TEXTJOIN("/", TRUE, "Closed", IF(ISBLANK(section), "", section)))))'
      );
    });

    it('should fall back to field names if no columnMap is provided with empty/buffer-row guard', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        '${section}-${number}'
      );
      expect(formula).toBe(
        '=MAP(section, number, LAMBDA(section, number, IF(OR(ISBLANK(section), section=""), "", TEXTJOIN("-", TRUE, IF(ISBLANK(section), "", section), IF(ISBLANK(number), "", number)))))'
      );
    });

    it('should compile composite multi-token format strings with mixed delimiters into MAP LAMBDA spill formula with guard', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        'Closed/${section}-${revision}',
        { section: 'B5:B', revision: 'D5:D' }
      );
      expect(formula).toBe(
        '=MAP(B5:B, D5:D, LAMBDA(section, revision, IF(OR(ISBLANK(section), section=""), "", TEXTJOIN("-", TRUE, IF(ISBLANK(section), "", "Closed/" & section), IF(ISBLANK(revision), "", revision)))))'
      );
    });

    it('should compile multi-token path formats with uniform slash delimiter into MAP LAMBDA formula with guard', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        'Closed/${specCategory}/${specTag}',
        { specCategory: 'B5:B', specTag: 'C5:C' }
      );
      expect(formula).toBe(
        '=MAP(B5:B, C5:C, LAMBDA(specCategory, specTag, IF(OR(ISBLANK(specCategory), specCategory=""), "", TEXTJOIN("/", TRUE, "Closed", IF(ISBLANK(specCategory), "", specCategory), IF(ISBLANK(specTag), "", specTag)))))'
      );
    });

    it('should compile underscore-delimited format with literals into MAP LAMBDA formula with guard', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        'PREFIX_${tag}_SUFFIX',
        { tag: 'A5:A' }
      );
      expect(formula).toBe(
        '=MAP(A5:A, LAMBDA(tag, IF(OR(ISBLANK(tag), tag=""), "", TEXTJOIN("_", TRUE, "PREFIX", IF(ISBLANK(tag), "", tag), "SUFFIX"))))'
      );
    });

    it('should compile single variable without delimiter into MAP LAMBDA formula with guard', () => {
      const formula = TemplateFormatCompiler.compileToSheetsFormula(
        '${title}',
        { title: 'E5:E' }
      );
      expect(formula).toBe(
        '=MAP(E5:E, LAMBDA(title, IF(OR(ISBLANK(title), title=""), "", title)))'
      );
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
