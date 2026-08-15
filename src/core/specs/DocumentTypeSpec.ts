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

export interface DynamicPromptConfig {
  columnKey: string;
  uiLabel: string;
  required: boolean;
}

export interface DynamicPromptPayload {
  supportDataKey: string;
  fieldKey: string;
  userValue: string;
  dynamicPrompts: DynamicPromptConfig[];
  message?: string;
  interactionType?: string;
}

export interface SupportDataColumnSpec {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  isPrimaryKey?: boolean;
  isDisplayLabel?: boolean;
  label?: string;
  required?: boolean;
}

export interface SupportDataSpec {
  key: string;
  columns: SupportDataColumnSpec[];
  isShared?: boolean;
  allowDynamicAddition?: boolean;
  dynamicPrompts?: Array<string | DynamicPromptConfig>;
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

export interface FieldMatchRule {
  field: string;
  value: any;
}

export interface WorkflowPolicySpec {
  direction?: 'incoming' | 'outgoing' | string;
  stampPdf?: boolean;
  updatePreviousStatus?: boolean;
  previousRowStatus?: string;
  targetSubfolderTemplate?: string;
  coverPageTemplateId?: string;
  stampedFilePrefix?: string;
  timeoutMs?: number;
  [key: string]: any;
}

export interface WorkflowSpec {
  context: string;
  fieldMatches?: FieldMatchRule[];
  isDefault?: boolean;
  sequence: string[];
  policy?: WorkflowPolicySpec;
}

export type WorkflowTriggerSpec = WorkflowSpec;

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
  workflows: WorkflowSpec[];
  supportData?: Record<string, SupportDataSpec>;
  ui?: DocumentUiSpec;
  validationHookKey?: string;
}
