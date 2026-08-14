/**
 * @file DocumentTypeSpec.ts
 * @description Comprehensive Tier 1 declarative specification interfaces for document types.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

export interface PicklistSourceSpec {
  supportDataKey: string;
  valueColumnKey: string;
  displayColumnKey: string;
}

export interface SupportDataColumnSpec {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  isPrimaryKey?: boolean;
  isDisplayLabel?: boolean;
}

export interface SupportDataSpec {
  key: string;
  columns: SupportDataColumnSpec[];
  isShared?: boolean;
  allowDynamicAddition?: boolean;
  dynamicPrompts?: string[];
  items?: Array<Record<string, any>>;
}

export interface DocumentFieldSpec {
  key: string;
  label: string;
  type: 'string' | 'multiline' | 'date' | 'list' | 'enum' | 'number' | 'boolean';
  required?: boolean;
  description?: string;
  defaultValue?: string | number | boolean;
  isCalculated?: boolean;
  calcFormat?: string;
  formulaOrFunction?: string;
  header?: string;
  numberFormat?: string;
  optionsRange?: string;
  options?: Array<{ value: string; label: string; [key: string]: any }>;
  picklistSource?: PicklistSourceSpec;
  keyNormalizationRule?: 'picklist' | 'code' | 'exact';
}

export interface DocumentIdentitySpec {
  format: string;
  groupFormat: string;
  revisionGroupFormat: string;
}

export interface DriveStorageSpec {
  type: 'drive';
  rootFolderSearchTerms: string[];
  projectSearchTerms?: string[];
  closedRootFolderName: string;
  closedSubfolderFormat?: string;
  closedSubfolderMap?: Record<string, string>;
  filenamePrefix?: string;
  filenameFormat?: string;
  coverPageTemplateId?: string;
}

export interface SqlStorageSpec {
  type: 'sql';
  tableName: string;
  connectionStringKey?: string;
  [key: string]: any;
}

export interface GenericStorageSpec {
  type: string;
  [key: string]: any;
}

export type PolymorphicStorageSpec = DriveStorageSpec | SqlStorageSpec | GenericStorageSpec;

export interface WorkflowTriggerSpec {
  context: string;
  fieldMatches?: Record<string, any>;
  sequence: string[];
}

export interface DocumentUiSectionSpec {
  title: string;
  fields: string[];
}

export interface DocumentUiSpec {
  confidenceThreshold?: number;
  sections?: DocumentUiSectionSpec[];
}

export interface DocumentTypeSpec {
  key: string;
  label: string;
  name: string;
  identity: DocumentIdentitySpec;
  fields: DocumentFieldSpec[];
  storage: PolymorphicStorageSpec[];
  workflows: WorkflowTriggerSpec[];
  supportData?: Record<string, SupportDataSpec>;
  ui?: DocumentUiSpec;
  validationHookKey?: string;
}
