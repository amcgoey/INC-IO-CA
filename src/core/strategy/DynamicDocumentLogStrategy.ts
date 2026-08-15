/// <reference path="../../types.ts" />
import type { DocumentTypeSpec, DriveStorageSpec } from '../specs/DocumentTypeSpec';
import { TemplateFormatCompiler } from '../specs/TemplateFormatCompiler';
import { getRowGroupKey, getRowSortKey } from '../../RowPositionCalculator';

/**
 * Formats a Date object or raw date string into a standard 6-to-8 digit string.
 */
export function formatDateStr(rawDate: unknown): string {
  if (rawDate instanceof Date) {
    if (isNaN(rawDate.getTime())) return '';
    const yyyy = String(rawDate.getFullYear());
    const mm = String(rawDate.getMonth() + 1).padStart(2, '0');
    const dd = String(rawDate.getDate()).padStart(2, '0');
    return yyyy + mm + dd;
  }
  return String(rawDate || '').replace(/\D/g, '').padStart(6, '0');
}

/**
 * Safely pads a numeric or string value with leading zeros to the specified target length.
 */
function safePadNum(val: unknown, len: number): string {
  if (typeof (globalThis as Record<string, unknown>).padNum === 'function') {
    return ((globalThis as Record<string, unknown>).padNum as (v: unknown, l: number) => string)(val, len);
  }
  return String(val || '').trim().padStart(len, '0');
}

export class DynamicDocumentLogStrategy implements DocumentLogStrategy<ValidatedDocument> {
  constructor(
    public readonly spec: DocumentTypeSpec,
    private readonly compiler: typeof TemplateFormatCompiler = TemplateFormatCompiler
  ) {}

  private extractRecord(doc: ValidatedDocument): Record<string, any> {
    const details = (doc && typeof doc === 'object' && doc.disciplineDetails) || {};
    const record: Record<string, any> = {
      ...details,
      ...doc,
    };

    if (doc) {
      if (doc.documentType !== undefined) record.documentType = doc.documentType;
      if (doc.date !== undefined) record.date = doc.date;
      if (doc.contact !== undefined) record.contact = doc.contact;
      if (doc.action !== undefined) record.action = doc.action;
      if (doc.notes !== undefined) record.notes = doc.notes;
      if (doc.incomingRouting !== undefined) record.incomingRouting = doc.incomingRouting;
      if (doc.listFields) {
        for (const [key, field] of Object.entries(doc.listFields)) {
          record[key] = field.storedValue;
        }
      }
    }

    if (record.section !== undefined && record.section !== null && String(record.section).trim() !== '') {
      const secStr = String(record.section).trim();
      record.section = /^\d+$/.test(secStr) ? safePadNum(secStr, 6) : secStr;
    }
    if (record.number !== undefined && record.number !== null && String(record.number).trim() !== '') {
      const numStr = String(record.number).trim();
      record.number = /^\d+$/.test(numStr) ? safePadNum(numStr, 3) : numStr;
    }

    return record;
  }

  public getGroupKey(doc: ValidatedDocument): string {
    const record = this.extractRecord(doc);
    const groupKey = this.compiler.evaluate(this.spec.identity.groupFormat, record);
    return groupKey.toLowerCase();
  }

  public getSortKey(doc: ValidatedDocument): string {
    const groupKey = this.getGroupKey(doc);
    const record = this.extractRecord(doc);
    const revStr = record.revision !== undefined && record.revision !== null ? String(record.revision).trim() : '0';
    const rev = /^\d+$/.test(revStr) ? safePadNum(revStr, 3) : revStr;
    const dateStr = formatDateStr(record.date);
    return `${groupKey}-${rev}-${dateStr}`;
  }

  public getTargetKey(doc: ValidatedDocument): string {
    const record = this.extractRecord(doc);
    const targetFormat = this.spec.identity.revisionGroupFormat || this.spec.identity.format;
    return this.compiler.evaluate(targetFormat, record);
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
      if (field.isCalculated) {
        if (field.calcFormat) {
          payload[field.header || field.label] = this.compiler.evaluate(field.calcFormat, record);
        }
        continue;
      }
      const header = field.header || field.label;
      const val = record[field.key];
      if (val !== undefined && val !== null) {
        payload[header] = String(val);
      } else if (field.defaultValue !== undefined) {
        if (typeof field.defaultValue === 'string' && field.defaultValue.includes('${')) {
          payload[header] = this.compiler.evaluate(field.defaultValue, record);
        } else {
          payload[header] = String(field.defaultValue);
        }
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
    const descriptor = String(record.title || (record.vendor ? record.vendor : (record.specTitle || '')));
    const suffix = actionAbbr ? actionAbbr : '';
    const dateStr = String(doc.date || record.date || '');
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
    return getRowGroupKey(row, '', headers, this.spec.fields as any);
  }

  public getSortKeyFromRow(row: unknown[], headers: string[]): string {
    return getRowSortKey(row, '', headers, this.spec.fields as any);
  }

  public getTargetKeyFromRow(row: unknown[], headers: string[]): string {
    const rowRecord = this.extractRowRecord(row, headers);
    const targetFormat = this.spec.identity.revisionGroupFormat || this.spec.identity.format;
    return this.compiler.evaluate(targetFormat, rowRecord);
  }

  public getRevisionGroupKeyFromRow(row: unknown[], headers: string[]): string {
    return this.getTargetKeyFromRow(row, headers);
  }
}
