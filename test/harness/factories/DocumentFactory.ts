/**
 * @file DocumentFactory.ts
 * @description Strongly-typed document fixture generators for unit tests.
 *
 * Provides factory functions to instantiate default RawDocument and ValidatedDocument
 * payloads with type-safe Partial<T> overrides for submittals (Architecture, FF&E) and RFIs.
 */

/// <reference path="../../../src/types.ts" />

const DEFAULT_DATE = "2026-07-25";
const DEFAULT_CONTACT_ARCH = "John Doe";
const DEFAULT_CONTACT_FFE = "Jane Smith";
const DEFAULT_ACTION_RECEIVED = "Received";
const DEFAULT_ACTION_APPROVED = "Approved";

export type ValidatedArchitectureOverride = Partial<Omit<ValidatedDocument, "disciplineDetails">> & {
  disciplineDetails?: Partial<ArchitectureDetails>;
};

export type ValidatedFFEOverride = Partial<Omit<ValidatedDocument, "disciplineDetails">> & {
  disciplineDetails?: Partial<FFEDetails>;
};

export type ValidatedRfiOverride = Partial<Omit<ValidatedDocument, "disciplineDetails">> & {
  disciplineDetails?: Partial<ArchitectureDetails>;
};

/**
 * Builds default ListDocumentField metadata for fixture documents.
 */
function createDefaultListFields(contact: string, action: string) {
  return {
    contact: { fieldName: "contact", storedForm: "abbreviation" as const, storedValue: contact, abbreviation: contact, longForm: contact },
    action: { fieldName: "action", storedForm: "longForm" as const, storedValue: action, abbreviation: action, longForm: action }
  };
}

/**
 * Resolves contact, action, and listFields for validated document fixtures.
 */
function resolveFixtureFields(
  overrides: any,
  defaultContact: string,
  defaultAction: string
) {
  const contact = overrides.contact !== undefined ? overrides.contact : defaultContact;
  const action = overrides.action !== undefined ? overrides.action : defaultAction;
  const listFields = overrides.listFields || createDefaultListFields(contact, action);
  return { contact, action, listFields };
}

/**
 * Merges default discipline details with optional partial overrides.
 *
 * @param defaults - Baseline discipline details object.
 * @param overrides - Partial discipline details object.
 * @returns Fully populated merged discipline details object.
 */
function mergeDisciplineDetails<T>(defaults: T, overrides?: Partial<T>): T {
  return {
    ...defaults,
    ...(overrides || {})
  };
}

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
    date: DEFAULT_DATE,
    contact: DEFAULT_CONTACT_ARCH,
    action: DEFAULT_ACTION_RECEIVED,
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
 * @param overrides - Optional partial ValidatedDocument overrides allowing partial disciplineDetails.
 * @returns Fully populated ValidatedDocument for Architecture discipline.
 */
export function createValidatedArchitectureSubmittal(overrides: ValidatedArchitectureOverride = {}): ValidatedDocument {
  const defaultArchDetails: ArchitectureDetails = {
    discipline: "Architecture",
    section: "081100",
    number: "001",
    title: "Door Schedule",
    revision: "01"
  };

  const disciplineDetails = mergeDisciplineDetails(
    defaultArchDetails,
    overrides.disciplineDetails
  );

  const { contact, action, listFields } = resolveFixtureFields(
    overrides,
    DEFAULT_CONTACT_ARCH,
    DEFAULT_ACTION_RECEIVED
  );

  return {
    documentType: "Submittal",
    date: DEFAULT_DATE,
    contact,
    action,
    incomingRouting: "To Refer",
    notes: "Sample submittal notes",
    listFields,
    ...overrides,
    disciplineDetails
  };
}

/**
 * Creates a validated FF&E submittal document with defaults and optional partial overrides.
 *
 * @param overrides - Optional partial ValidatedDocument overrides allowing partial disciplineDetails.
 * @returns Fully populated ValidatedDocument for FF&E discipline.
 */
export function createValidatedFFESubmittal(overrides: ValidatedFFEOverride = {}): ValidatedDocument {
  const defaultFFEDetails: FFEDetails = {
    discipline: "FF&E",
    specTag: "CH-01",
    specTitle: "Dining Chair",
    vendor: "Herman Miller",
    revision: "01",
    relatedTag: "CH-02"
  };

  const disciplineDetails = mergeDisciplineDetails(
    defaultFFEDetails,
    overrides.disciplineDetails
  );

  const { contact, action, listFields } = resolveFixtureFields(
    overrides,
    DEFAULT_CONTACT_FFE,
    DEFAULT_ACTION_APPROVED
  );

  return {
    documentType: "Submittal",
    date: DEFAULT_DATE,
    contact,
    action,
    notes: "Sample FF&E notes",
    listFields,
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
    date: DEFAULT_DATE,
    contact: DEFAULT_CONTACT_ARCH,
    action: DEFAULT_ACTION_RECEIVED,
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
 * @param overrides - Optional partial ValidatedDocument overrides allowing partial disciplineDetails.
 * @returns Fully populated ValidatedDocument for RFI.
 */
export function createValidatedRfi(overrides: ValidatedRfiOverride = {}): ValidatedDocument {
  const defaultArchDetails: ArchitectureDetails = {
    discipline: "Architecture",
    section: "033000",
    number: "001",
    title: "Foundation Wall Detail",
    revision: "00"
  };

  const disciplineDetails = mergeDisciplineDetails(
    defaultArchDetails,
    overrides.disciplineDetails
  );

  const { contact, action, listFields } = resolveFixtureFields(
    overrides,
    DEFAULT_CONTACT_ARCH,
    DEFAULT_ACTION_RECEIVED
  );

  return {
    documentType: "RFI",
    date: DEFAULT_DATE,
    contact,
    action,
    incomingRouting: "To Architect",
    notes: "Sample RFI notes",
    listFields,
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
