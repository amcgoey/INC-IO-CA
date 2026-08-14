/// <reference path="../../types.ts" />
/**
 * @file DeclarativeDocumentLogStrategy.ts
 * @description Tier 1 pure declarative strategy implementation consuming DocumentTypeSpec
 * and dynamic TemplateFormatCompiler evaluations for grouping, sorting, filing, and row formatting.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

globalThis.__currentFileTier = 1;

import type { DocumentTypeSpec, DriveStorageSpec } from '../specs/DocumentTypeSpec';
import { TemplateFormatCompiler } from '../specs/TemplateFormatCompiler';
import { getRowGroupKey, getRowSortKey } from '../../RowPositionCalculator';
import { CSI_DIVISIONS, CONFIG } from '../../Config';

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

/**
 * Extracts a flattened field record from a ValidatedDocument and its disciplineDetails.
 */
function extractRecord(doc: ValidatedDocument): Record<string, any> {
  const details = (doc && typeof doc === 'object' && doc.disciplineDetails) || {};
  const record: Record<string, any> = {
    ...details,
    ...doc,
  };
  if (doc) {
    if (doc.date !== undefined) record.date = doc.date;
    if (doc.contact !== undefined) record.contact = doc.contact;
    if (doc.action !== undefined) record.action = doc.action;
    if (doc.notes !== undefined) record.notes = doc.notes;
  }
  return record;
}

/**
 * Pure Tier 1 DeclarativeDocumentLogStrategy driven by DocumentTypeSpec.
 */
export class DeclarativeDocumentLogStrategy implements DocumentLogStrategy<ValidatedDocument> {
  public readonly logSheetName: string;

  constructor(public readonly spec: DocumentTypeSpec) {
    const isFfe =
      spec.key.toUpperCase().includes('FFE') ||
      spec.label.toLowerCase().includes('ff&e') ||
      spec.name.toLowerCase().includes('furniture');
    const isArch =
      spec.key.toUpperCase().includes('ARCH') ||
      spec.key.toUpperCase() === 'SUBMITTAL';

    this.logSheetName = isFfe
      ? 'Submittal FFE'
      : isArch
        ? 'Submittal Arch'
        : spec.label;
  }

  /** Generates the group key used to cluster related submittals in the log sheet. */
  public getGroupKey(doc: ValidatedDocument): string {
    const record = extractRecord(doc);
    const evalRecord: Record<string, any> = { ...record };
    if (evalRecord.section !== undefined && evalRecord.section !== null && String(evalRecord.section).trim() !== '') {
      const secStr = String(evalRecord.section).trim();
      evalRecord.section = /^\d+$/.test(secStr) ? safePadNum(secStr, 6) : secStr;
    }
    if (evalRecord.number !== undefined && evalRecord.number !== null && String(evalRecord.number).trim() !== '') {
      const numStr = String(evalRecord.number).trim();
      evalRecord.number = /^\d+$/.test(numStr) ? safePadNum(numStr, 3) : numStr;
    }
    const groupKey = TemplateFormatCompiler.evaluate(this.spec.identity.groupFormat, evalRecord);
    return groupKey.toLowerCase();
  }

  /** Generates the sort key used to order submittal revisions within a group. */
  public getSortKey(doc: ValidatedDocument): string {
    const groupKey = this.getGroupKey(doc);
    const record = extractRecord(doc);
    const revStr = record.revision !== undefined && record.revision !== null ? String(record.revision).trim() : '0';
    const rev = /^\d+$/.test(revStr) ? safePadNum(revStr, 3) : revStr;
    const dateStr = formatDateStr(record.date);
    return `${groupKey}-${rev}-${dateStr}`;
  }

  /** Generates the primary user-facing target key. */
  public getTargetKey(doc: ValidatedDocument): string {
    const record = extractRecord(doc);
    return TemplateFormatCompiler.evaluate(this.spec.identity.revisionGroupFormat, record);
  }

  /** Resolves complete IdentityData tuple for log indexing and lookup. */
  public getIdentityData(doc: ValidatedDocument): IdentityData {
    return {
      identityGroup: this.getGroupKey(doc),
      identityRevisionGroup: this.getSortKey(doc),
      identity: this.getTargetKey(doc),
    };
  }

  /** Extracts the group key from an existing raw spreadsheet row array. */
  public getGroupKeyFromRow(row: unknown[], headers: string[]): string {
    return getRowGroupKey(row, '', headers, this.spec.fields as any);
  }

  /** Extracts the sort key from an existing raw spreadsheet row array. */
  public getSortKeyFromRow(row: unknown[], headers: string[]): string {
    return getRowSortKey(row, '', headers, this.spec.fields as any);
  }

  /** Extracts the target key from an existing raw spreadsheet row array. */
  public getTargetKeyFromRow(row: unknown[], headers: string[]): string {
    const rowRecord: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const field = this.spec.fields.find((f) => f.header === h || f.label === h);
      if (field) {
        rowRecord[field.key] = String(row[i] || '').trim();
      }
      rowRecord[h] = String(row[i] || '').trim();
    }
    return TemplateFormatCompiler.evaluate(this.spec.identity.revisionGroupFormat, rowRecord);
  }

  /** Extracts the revision group key from an existing raw spreadsheet row array. */
  public getRevisionGroupKeyFromRow(row: unknown[], headers: string[]): string {
    return this.getTargetKeyFromRow(row, headers);
  }

  /** Maps validated document fields into a tabular key-value map matching log sheet headers. */
  public formatRowPayload(
    doc: ValidatedDocument,
    options: { link: string; contactHistory: string; status: string }
  ): Record<string, string> {
    const record = extractRecord(doc);
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

  /** Formats the target destination filename for Drive filing and local G:\ drive export. */
  public getFileName(doc: ValidatedDocument, contactHistory: string, actionAbbr: string): string {
    const record = extractRecord(doc);
    const targetKey = this.getTargetKey(doc);
    const descriptor = record.title || (record.vendor ? record.vendor : (record.specTitle || ''));
    const suffix = actionAbbr ? actionAbbr : '';
    return `${targetKey} ${descriptor} - ${doc.date} ${contactHistory}${suffix}`;
  }

  /** Resolves relative subfolder path segments for Drive storage filing. */
  public getFilingSubfolders(doc: ValidatedDocument): string[] {
    const record = extractRecord(doc);
    const driveStorage = (this.spec.storage || []).find((s): s is DriveStorageSpec => s.type === 'drive');
    const closedFolder =
      driveStorage?.closedRootFolderName ||
      (typeof CONFIG !== 'undefined' && (CONFIG as any).LOG_CLOSED_FOLDER_NAME) ||
      (typeof CONFIG !== 'undefined' && (CONFIG as any).CLOSED_FOLDER_NAME) ||
      'Closed';

    const secStr = String(record.section || '').trim();
    if (secStr) {
      const secPrefix = secStr.substring(0, 2);
      const csiDivs = (globalThis as any).CSI_DIVISIONS || CSI_DIVISIONS;
      const divName = csiDivs && csiDivs[secPrefix] ? csiDivs[secPrefix] : null;
      if (divName) {
        return [closedFolder, divName];
      }
      return [closedFolder];
    }

    const specTag = String(record.specTag || '').trim();
    if (specTag) {
      const prefix = specTag.substring(0, 2);
      if (prefix) {
        return [closedFolder, prefix];
      }
    }

    return [closedFolder];
  }
}
