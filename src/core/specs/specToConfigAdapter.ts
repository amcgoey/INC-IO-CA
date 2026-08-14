/// <reference path="../../types.ts" />
/**
 * @file specToConfigAdapter.ts
 * @description Pure Tier 1 projection adapter mapping DocumentTypeSpec to legacy DocumentTypeConfig.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

globalThis.__currentFileTier = 1;

import type { DocumentTypeSpec, DriveStorageSpec, DocumentFieldSpec as CoreDocumentFieldSpec } from './DocumentTypeSpec';
import {
  ValidationHookRegistry,
  defaultValidationHookRegistry,
} from './ValidationHookRegistry';

/**
 * Projects a Tier 1 DocumentTypeSpec instance into a legacy DocumentTypeConfig object.
 */
export function specToConfigAdapter(
  spec: DocumentTypeSpec,
  hookRegistry?: ValidationHookRegistry
): DocumentTypeConfig {
  const isFfe =
    spec.key.toUpperCase().includes('FFE') ||
    spec.label.toLowerCase().includes('ff&e') ||
    spec.name.toLowerCase().includes('furniture');

  // Storage extraction
  const driveStorage = (spec.storage || []).find(
    (s): s is DriveStorageSpec => s.type === 'drive'
  );

  const rootFolderSearchTerms = driveStorage?.rootFolderSearchTerms || [spec.label];
  const projectSearchTerms =
    driveStorage?.projectSearchTerms || driveStorage?.rootFolderSearchTerms || [spec.label];
  const closedRootFolderName = driveStorage?.closedRootFolderName || 'Closed';
  const closedSubfolderMap = driveStorage?.closedSubfolderMap;
  const filenamePrefix = driveStorage?.filenamePrefix || '_';
  const coverPageTemplateId = driveStorage?.coverPageTemplateId || '';
  const logParentFolderTerms = driveStorage?.rootFolderSearchTerms || [spec.name, spec.label].filter(Boolean);

  // Log criteria
  const logSearchTerms = isFfe
    ? ['document log', 'inc document log', 'submittal log', 'ffe log', 'ff&e log']
    : ['document log', 'inc document log', 'submittal log'];

  const targetTab = isFfe
    ? 'Submittal FFE'
    : (spec.key.toUpperCase().includes('ARCH') || spec.key.toUpperCase() === 'SUBMITTAL')
      ? 'Submittal Arch'
      : spec.label;

  const logSheetName = isFfe
    ? 'Submittal FFE'
    : (spec.key.toUpperCase().includes('ARCH') || spec.key.toUpperCase() === 'SUBMITTAL')
      ? 'Log'
      : spec.label;

  // Validation Hook binding
  let validateHook: ((rawDoc: RawDocument, context?: ValidationContext) => ValidationResult | void) | undefined;
  if (spec.validationHookKey) {
    const registry = hookRegistry || defaultValidationHookRegistry;
    const hook = registry.getHook(spec.validationHookKey);
    if (hook) {
      validateHook = hook;
    }
  }

  // Field mapping
  const fields: DocumentFieldSpec[] = (spec.fields || []).map((field: CoreDocumentFieldSpec) => {
    return {
      key: field.key,
      label: field.label,
      type: field.type as 'string' | 'multiline' | 'date' | 'list' | 'enum',
      ...(field.required !== undefined ? { required: field.required } : {}),
      ...(field.description ? { description: field.description } : {}),
      ...(field.defaultValue !== undefined ? { defaultValue: String(field.defaultValue) } : {}),
      ...(field.isCalculated !== undefined ? { isCalculated: field.isCalculated } : {}),
      ...(field.header ? { header: field.header } : {}),
      ...(field.numberFormat ? { numberFormat: field.numberFormat } : {}),
      ...(field.optionsRange ? { optionsRange: field.optionsRange } : {}),
      ...(field.options ? { options: field.options } : {}),
      ...(field.keyNormalizationRule ? { keyNormalizationRule: field.keyNormalizationRule } : {}),
      ...(field.formulaOrFunction ? { formulaOrFunction: field.formulaOrFunction } : (field.isCalculated ? { formulaOrFunction: '=CONCAT()' } : {})),
    };
  });

  const config: DocumentTypeConfig = {
    documentType: spec.key,
    displayName: spec.name || spec.label,
    targetTab,
    rootFolderSearchTerms,
    projectSearchTerms,
    closedRootFolderName,
    ...(closedSubfolderMap ? { closedSubfolderMap } : {}),
    filenamePrefix,
    ...(coverPageTemplateId ? { coverPageTemplateId } : {}),
    logSearchTerms,
    logSheetName,
    logParentFolderTerms,
    logAdapterKey: 'GoogleSheetsLogRepository',
    filingAdapterKey: 'GoogleDriveFilingRepository',
    pdfAdapterKey: 'PdfDocumentService',
    aiAdapterKey: 'GeminiAiAnalysisAdapter',
    fields,
    ...(validateHook ? { validateHook } : {}),
  };

  return config;
}
