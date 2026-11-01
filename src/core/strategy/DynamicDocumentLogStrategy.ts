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
    const yy = String(rawDate.getFullYear()).slice(-2);
    const mm = String(rawDate.getMonth() + 1).padStart(2, '0');
    const dd = String(rawDate.getDate()).padStart(2, '0');
    return yy + mm + dd;
  }
  const str = String(rawDate || '').trim();
  if (!str) return '';
  const digits = str.replace(/\D/g, '');
  if (digits.length === 8) {
    return digits.slice(-6);
  }
  if (digits.length === 6) {
    return digits;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const yy = String(parsed.getFullYear()).slice(-2);
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return yy + mm + dd;
  }
  return digits.padStart(6, '0');
}

/**
 * Safely pads a numeric or string value with leading zeros to the specified target length.
 */
function safePadNum(val: unknown, len: number): string {
  return String(val ?? '').trim().padStart(len, '0');
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
    if (record.specTag !== undefined && record.specTag !== null) {
      record.specTag = String(record.specTag).trim().toUpperCase();
    }
    if (record.tag !== undefined && record.tag !== null) {
      record.tag = String(record.tag).trim().toUpperCase();
    }
    if (record.revision !== undefined && record.revision !== null) {
      record.revision = String(record.revision).trim();
    }

    return record;
  }

  public getGroupKey(doc: ValidatedDocument): string {
    const record = this.extractRecord(doc);
    const groupKey = this.compiler.evaluate(this.spec.identity.groupFormat, record);
    return groupKey.trim().toUpperCase();
  }

  public getTargetKey(doc: ValidatedDocument): string {
    const record = this.extractRecord(doc);
    const targetFormat = this.spec.identity.revisionGroupFormat || this.spec.identity.format;
    return this.compiler.evaluate(targetFormat, record).trim().toUpperCase();
  }

  public getSortKey(doc: ValidatedDocument): string {
    const revGroupKey = this.getTargetKey(doc);
    const record = this.extractRecord(doc);
    const dateStr = formatDateStr(record.date);
    return `${revGroupKey}-${dateStr}`.trim().toUpperCase();
  }

  public getIdentityData(doc: ValidatedDocument): IdentityData {
    return {
      identityGroup: this.getGroupKey(doc),
      identityRevisionGroup: this.getTargetKey(doc),
      identity: this.getSortKey(doc),
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
    const descriptor = String(record.title || (record.vendor ? record.vendor : (record.specTitle || ''))).trim();
    const suffix = (actionAbbr || '').trim();
    const dateStr = formatDateStr(doc.date || record.date);
    const contact = (contactHistory || '').trim();
    const tailParts = [contact, suffix].filter(Boolean).join(' ');
    const tail = tailParts ? ` ${tailParts}` : '';
    const descPart = descriptor ? ` ${descriptor}` : '';
    return `${targetKey}${descPart} - ${dateStr}${tail}`.trim();
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
    if (rowRecord.specTag !== undefined && rowRecord.specTag !== null) {
      rowRecord.specTag = String(rowRecord.specTag).trim().toUpperCase();
    }
    if (rowRecord.tag !== undefined && rowRecord.tag !== null) {
      rowRecord.tag = String(rowRecord.tag).trim().toUpperCase();
    }
    if (rowRecord.revision !== undefined && rowRecord.revision !== null) {
      rowRecord.revision = String(rowRecord.revision).trim();
    }
    return rowRecord;
  }

  public getGroupKeyFromRow(row: unknown[], headers: string[]): string {
    return getRowGroupKey(row, '', headers, this.spec.fields as any).trim().toUpperCase();
  }

  public getSortKeyFromRow(row: unknown[], headers: string[]): string {
    const revGroupKey = this.getTargetKeyFromRow(row, headers);
    const dateIdx = headers.indexOf('Date');
    const rawDate = dateIdx !== -1 ? row[dateIdx] : '';
    const dateStr = formatDateStr(rawDate);
    return (dateStr ? `${revGroupKey}-${dateStr}` : revGroupKey).trim().toUpperCase();
  }

  public getTargetKeyFromRow(row: unknown[], headers: string[]): string {
    const rowRecord = this.extractRowRecord(row, headers);
    const targetFormat = this.spec.identity.revisionGroupFormat || this.spec.identity.format;
    return this.compiler.evaluate(targetFormat, rowRecord).trim().toUpperCase();
  }

  public getRevisionGroupKeyFromRow(row: unknown[], headers: string[]): string {
    return this.getTargetKeyFromRow(row, headers);
  }
}
