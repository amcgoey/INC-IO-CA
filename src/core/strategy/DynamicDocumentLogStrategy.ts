/// <reference path="../../types.ts" />
import type { DocumentTypeSpec, DriveStorageSpec } from '../specs/DocumentTypeSpec';
import { TemplateFormatCompiler } from '../specs/TemplateFormatCompiler';

export class DynamicDocumentLogStrategy implements DocumentLogStrategy<ValidatedDocument> {
  constructor(
    public readonly spec: DocumentTypeSpec,
    private readonly compiler: typeof TemplateFormatCompiler
  ) {}

  private extractRecord(doc: ValidatedDocument): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    if (!doc) {
      return record;
    }

    record.documentType = doc.documentType;
    record.date = doc.date;
    record.contact = doc.contact;
    record.action = doc.action;
    if (doc.notes !== undefined) record.notes = doc.notes;
    if (doc.incomingRouting !== undefined) record.incomingRouting = doc.incomingRouting;

    if (doc.disciplineDetails) {
      const details = doc.disciplineDetails as Record<string, unknown>;
      for (const [k, v] of Object.entries(details)) {
        if (v !== undefined) {
          record[k] = v;
        }
      }
    }

    if (doc.listFields) {
      for (const [key, field] of Object.entries(doc.listFields)) {
        record[key] = field.storedValue;
      }
    }

    const docObj = doc as unknown as Record<string, unknown>;
    for (const key of Object.keys(docObj)) {
      if (key !== 'disciplineDetails' && key !== 'listFields' && !(key in record)) {
        record[key] = docObj[key];
      }
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
    const record = this.extractRecord(doc);
    return {
      identityGroup: this.compiler.evaluate(this.spec.identity.groupFormat, record),
      identityRevisionGroup: this.compiler.evaluate(this.spec.identity.revisionGroupFormat, record),
      identity: this.compiler.evaluate(this.spec.identity.format, record),
    };
  }

  public formatRowPayload(
    doc: ValidatedDocument,
    options: { link: string; contactHistory: string; status: string }
  ): Record<string, string> {
    const record = this.extractRecord(doc);
    const payload: Record<string, string> = {};

    for (const field of this.spec.fields) {
      const header = field.header || field.label;
      if (field.isCalculated) {
        if (field.calcFormat) {
          payload[header] = this.compiler.evaluate(field.calcFormat, record);
        }
        continue;
      }

      const val = record[field.key];
      if (val !== undefined && val !== null) {
        payload[header] = String(val);
      } else if (typeof field.defaultValue === 'string' && field.defaultValue.includes('${')) {
        payload[header] = this.compiler.evaluate(field.defaultValue, record);
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
      payload['Notes'] = String(record.notes || '');
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
    const targetKey = this.compiler.evaluate(this.spec.identity.format, record);
    const descriptor = String(record.title || (record.vendor ? record.vendor : (record.specTitle || '')));
    const suffix = actionAbbr ? actionAbbr : '';
    const dateStr = String(record.date || '');
    return `${targetKey} ${descriptor} - ${dateStr} ${contactHistory}${suffix}`;
  }

  private extractRowRecord(row: unknown[], headers: string[]): Record<string, unknown> {
    const rowRecord: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const field = this.spec.fields.find((f) => f.header === h || f.label === h);
      if (field) {
        rowRecord[field.key] = String(row[i] || '').trim();
      }
      rowRecord[h] = String(row[i] || '').trim();
    }
    return rowRecord;
  }

  public getGroupKeyFromRow(row: unknown[], headers: string[]): string {
    return this.compiler.evaluate(this.spec.identity.groupFormat, this.extractRowRecord(row, headers));
  }

  public getSortKeyFromRow(row: unknown[], headers: string[]): string {
    return this.compiler.evaluate(this.spec.identity.revisionGroupFormat, this.extractRowRecord(row, headers));
  }

  public getTargetKeyFromRow(row: unknown[], headers: string[]): string {
    return this.compiler.evaluate(this.spec.identity.format, this.extractRowRecord(row, headers));
  }
}
