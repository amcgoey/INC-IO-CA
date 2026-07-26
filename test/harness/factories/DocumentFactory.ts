/**
 * @file DocumentFactory.ts
 * @description Strongly-typed document fixture generators for unit tests.
 *
 * Provides factory functions to instantiate default RawDocument and ValidatedDocument
 * payloads with type-safe Partial<T> overrides for submittals (Architecture, FF&E) and RFIs.
 */

/// <reference path="../../../src/types.ts" />

/**
 * Creates a raw submittal data dictionary with defaults and optional partial overrides.
 *
 * @param overrides - Optional partial raw document field overrides.
 * @returns Fully populated RawDocument dictionary.
 */
export function createRawSubmittal(overrides: Partial<RawDocument> = {}): RawDocument {
  return {
    documentType: "Submittal",
    discipline: "Architecture",
    date: "2026-07-25",
    contact: "John Doe",
    action: "Received",
    incomingRouting: "To Refer",
    title: "Door Schedule",
    section: "081100",
    number: "001",
    revision: "01",
    notes: "Sample submittal notes",
    ...overrides
  };
}

/**
 * Creates a validated Architecture submittal document with defaults and optional partial overrides.
 *
 * @param overrides - Optional partial ValidatedDocument overrides.
 * @returns Fully populated ValidatedDocument for Architecture discipline.
 */
export function createValidatedArchitectureSubmittal(overrides: Partial<ValidatedDocument> = {}): ValidatedDocument {
  const defaultArchDetails: ArchitectureDetails = {
    discipline: "Architecture",
    section: "081100",
    number: "001",
    title: "Door Schedule",
    revision: "01"
  };

  const disciplineDetails: ArchitectureDetails = {
    ...defaultArchDetails,
    ...(overrides.disciplineDetails ? (overrides.disciplineDetails as Partial<ArchitectureDetails>) : {})
  };

  return {
    documentType: "Submittal",
    date: "2026-07-25",
    contact: "John Doe",
    action: "Received",
    incomingRouting: "To Refer",
    notes: "Sample submittal notes",
    ...overrides,
    disciplineDetails
  };
}

/**
 * Creates a validated FF&E submittal document with defaults and optional partial overrides.
 *
 * @param overrides - Optional partial ValidatedDocument overrides.
 * @returns Fully populated ValidatedDocument for FF&E discipline.
 */
export function createValidatedFFESubmittal(overrides: Partial<ValidatedDocument> = {}): ValidatedDocument {
  const defaultFFEDetails: FFEDetails = {
    discipline: "FF&E",
    specTag: "CH-01",
    specTitle: "Dining Chair",
    vendor: "Herman Miller",
    revision: "01",
    relatedTag: "CH-02"
  };

  const disciplineDetails: FFEDetails = {
    ...defaultFFEDetails,
    ...(overrides.disciplineDetails ? (overrides.disciplineDetails as Partial<FFEDetails>) : {})
  };

  return {
    documentType: "Submittal",
    date: "2026-07-25",
    contact: "Jane Smith",
    action: "Approved",
    notes: "Sample FF&E notes",
    ...overrides,
    disciplineDetails
  };
}

/**
 * Creates a raw RFI data dictionary with defaults and optional partial overrides.
 *
 * @param overrides - Optional partial raw document field overrides.
 * @returns Fully populated RawDocument dictionary for RFI.
 */
export function createRawRfi(overrides: Partial<RawDocument> = {}): RawDocument {
  return {
    documentType: "RFI",
    discipline: "Architecture",
    date: "2026-07-25",
    contact: "John Doe",
    action: "Received",
    incomingRouting: "To Architect",
    title: "Foundation Wall Detail",
    number: "001",
    revision: "00",
    notes: "Sample RFI notes",
    ...overrides
  };
}

/**
 * Creates a validated RFI document with defaults and optional partial overrides.
 *
 * @param overrides - Optional partial ValidatedDocument overrides.
 * @returns Fully populated ValidatedDocument for RFI.
 */
export function createValidatedRfi(overrides: Partial<ValidatedDocument> = {}): ValidatedDocument {
  const defaultArchDetails: ArchitectureDetails = {
    discipline: "Architecture",
    section: "033000",
    number: "001",
    title: "Foundation Wall Detail",
    revision: "00"
  };

  const disciplineDetails: ArchitectureDetails = {
    ...defaultArchDetails,
    ...(overrides.disciplineDetails ? (overrides.disciplineDetails as Partial<ArchitectureDetails>) : {})
  };

  return {
    documentType: "RFI",
    date: "2026-07-25",
    contact: "John Doe",
    action: "Received",
    incomingRouting: "To Architect",
    notes: "Sample RFI notes",
    ...overrides,
    disciplineDetails
  };
}

/**
 * Namespace object gathering all DocumentFactory generator functions.
 */
export const DocumentFactory = {
  createRawSubmittal,
  createValidatedArchitectureSubmittal,
  createValidatedFFESubmittal,
  createRawRfi,
  createValidatedRfi
};
