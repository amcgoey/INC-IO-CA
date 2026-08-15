/// <reference path="../../types.ts" />
import type { DocumentTypeSpec, DriveStorageSpec } from '../specs/DocumentTypeSpec';

export interface IFormatCompiler {
  evaluate(formatStr: string, record: Record<string, any>): string;
}

export class DynamicDocumentLogStrategy implements DocumentLogStrategy<ValidatedDocument> {
  constructor(
    public readonly spec: DocumentTypeSpec,
    private readonly compiler: IFormatCompiler
  ) {}

  private extractRecord(doc: ValidatedDocument): Record<string, any> {
    const details = (doc && typeof doc === 'object' && doc.disciplineDetails) || {};
    const listFields = (doc && typeof doc === 'object' && doc.listFields) || {};
    
    const record: Record<string, any> = { ...details, ...doc };
    
    // Flatten listFields by extracting storedValue
    for (const [key, listField] of Object.entries(listFields)) {
      if (listField && (listField as any).storedValue !== undefined) {
        record[key] = (listField as any).storedValue;
      }
    }
    
    if (doc) {
      if (doc.date !== undefined) record.date = doc.date;
      if (doc.contact !== undefined) record.contact = doc.contact;
      if (doc.action !== undefined) record.action = doc.action;
      if (doc.notes !== undefined) record.notes = doc.notes;
    }
    return record;
  }

  public getGroupKey(doc: ValidatedDocument): string {
    const record = this.extractRecord(doc);
    return this.compiler.evaluate(this.spec.identity.groupFormat, record);
  }

  public getSortKey(doc: ValidatedDocument): string {
    const record = this.extractRecord(doc);
    return this.compiler.evaluate(this.spec.identity.revisionGroupFormat, record);
  }

  public getTargetKey(doc: ValidatedDocument): string {
    const record = this.extractRecord(doc);
    return this.compiler.evaluate(this.spec.identity.format, record);
  }

  public getIdentityData(doc: ValidatedDocument): IdentityData {
    return {
      identityGroup: this.getGroupKey(doc),
      identityRevisionGroup: this.getSortKey(doc),
      identity: this.getTargetKey(doc),
    };
  }

  public formatRowPayload(
    doc: ValidatedDocument,
    options: { link: string; contactHistory: string; status: string }
  ): Record<string, string> {
    const record = this.extractRecord(doc);
    const payload: Record<string, string> = {};

    for (const field of this.spec.fields) {
      if (field.isCalculated) continue;
      const header = field.header || field.label;
      const val = record[field.key];
      if (val !== undefined && val !== null) {
        payload[header] = String(val);
      } else if (field.defaultValue !== undefined) {
        payload[header] = String(field.defaultValue);
      } else {
        payload[header] = '';
      }
    }

    payload['Status'] = options.status;
    payload['Link'] = options.link;
    payload['Contact History'] = options.contactHistory;
    if (record.notes !== undefined) {
      payload['Notes'] = record.notes || '';
    }

    return payload;
  }

  public getFilingSubfolders(doc: ValidatedDocument): string[] {
    const record = this.extractRecord(doc);
    const driveStorage = (this.spec.storage || []).find((s): s is DriveStorageSpec => s.type === 'drive');
    const closedFolder = driveStorage?.closedRootFolderName || 'Closed';

    if (driveStorage?.closedSubfolderFormat) {
      const evaluated = this.compiler.evaluate(driveStorage.closedSubfolderFormat, record);
      const segments = evaluated
        .split('/')
        .map((seg) => seg.trim())
        .filter(Boolean);
      if (segments.length > 0) {
        return segments;
      }
    }

    return [closedFolder];
  }

  public getFileName(doc: ValidatedDocument, contactHistory: string, actionAbbr: string): string {
    const record = this.extractRecord(doc);
    const targetKey = this.getTargetKey(doc);
    const descriptor = record.title || (record.vendor ? record.vendor : (record.specTitle || ''));
    const suffix = actionAbbr ? actionAbbr : '';
    return `${targetKey} ${descriptor} - ${doc.date} ${contactHistory}${suffix}`;
  }

  public getGroupKeyFromRow(row: unknown[], headers: string[]): string {
    return '';
  }

  public getSortKeyFromRow(row: unknown[], headers: string[]): string {
    return '';
  }

  public getTargetKeyFromRow(row: unknown[], headers: string[]): string {
    return '';
  }
}
