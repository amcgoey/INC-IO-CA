/**
 * @file DocumentLogStrategy.ts
 * @description Strategy design pattern implementations for discipline-specific submittal identity, sorting, tabular row formatting, and filing rules.
 *
 * Provides `ArchitectureSubmittalStrategy` for CSI-based architectural submittals and
 * `FFESubmittalStrategy` for Furniture, Fixtures & Equipment (FF&E) submittals.
 */

declare var require: any;

if (typeof require !== "undefined") {
  try {
    const _rpc = eval('require("./RowPositionCalculator")');
    if (_rpc) {
      if (typeof getRowGroupKey === "undefined" && _rpc.getRowGroupKey) (globalThis as any).getRowGroupKey = _rpc.getRowGroupKey;
      if (typeof getRowSortKey === "undefined" && _rpc.getRowSortKey) (globalThis as any).getRowSortKey = _rpc.getRowSortKey;
      if (_rpc.padNum) (globalThis as any).padNum = _rpc.padNum;
    }
  } catch (e) {}
}

/**
 * Helper to safely extract and trim section string from ArchitectureDetails, handling null/undefined correctly.
 */
function getSectionVal(section: any): string {
  return section != null ? String(section).trim() : "";
}

/**
 * Formats a Date object or raw date string into a standard 6-digit `YYMMDD` string.
 *
 * @param rawDate - The input date instance, date string, or number.
 * @returns 6-character formatted date string (`YYMMDD`).
 */
function formatDateStr(rawDate: any): string {
  if (rawDate instanceof Date) {
    if (typeof Utilities !== "undefined" && Utilities.formatDate && typeof Session !== "undefined") {
      return Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyMMdd");
    } else {
      const yy = String(rawDate.getFullYear()).slice(-2);
      const mm = String(rawDate.getMonth() + 1).padStart(2, '0');
      const dd = String(rawDate.getDate()).padStart(2, '0');
      return `${yy}${mm}${dd}`;
    }
  }
  return String(rawDate || "").replace(/\D/g, '').padStart(6, '0');
}

/**
 * Safely pads a numeric or string value with leading zeros to the specified target length.
 *
 * @param val - The raw value to pad.
 * @param len - Desired minimum length.
 * @returns Zero-padded string representation of the value.
 */
function safePadNum(val: any, len: number): string {
  if (typeof padNum !== "undefined") return padNum(val, len);
  if ((globalThis as any).padNum) return (globalThis as any).padNum(val, len);
  return String(val || "").trim().padStart(len, '0');
}

/**
 * Strategy interface encapsulating discipline-specific rules for grouping, sorting,
 * target key identification, tabular row payload formatting, destination file naming, and subfolder placement.
 */
export interface DocumentLogStrategy<T = ValidatedDocument> {
  /** Generates the group key used to cluster related submittals in the log sheet (e.g. section-number or specTag). */
  getGroupKey(doc: T): string;
  /** Generates the sort key used to order submittal revisions within a group. */
  getSortKey(doc: T): string;
  /** Generates the primary user-facing target key (e.g. "081100-001-0" or "CH-01-0"). */
  getTargetKey(doc: T): string;
  getIdentityData?(doc: T): IdentityData;
  /** Extracts the group key from an existing raw spreadsheet row array. */
  getGroupKeyFromRow(row: any[], headers: string[]): string;
  /** Extracts the sort key from an existing raw spreadsheet row array. */
  getSortKeyFromRow(row: any[], headers: string[]): string;
  /** Extracts the target key from an existing raw spreadsheet row array. */
  getTargetKeyFromRow(row: any[], headers: string[]): string;
  /** Maps validated document fields into a tabular key-value map matching log sheet headers. */
  formatRowPayload(doc: T, options: { link: string; contactHistory: string; status: string }): Record<string, string>;
  /** Formats the target destination filename for Drive filing and local G:\ drive export. */
  getFileName(doc: T, contactHistory: string, actionAbbr: string): string;
  /** Resolves relative subfolder path segments for Drive storage filing (e.g. `["Closed", "08 OPENINGS"]`). */
  getFilingSubfolders?(doc: T): string[];
}

/**
 * Strategy implementation for Architecture discipline submittals.
 * Groups by CSI section and submittal number, orders by revision and date, and resolves CSI division subfolders.
 */
class ArchitectureSubmittalStrategy implements DocumentLogStrategy<ValidatedDocument> {
  /** @override */
  getGroupKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as ArchitectureDetails;
    const secVal = getSectionVal(details?.section);
    const num = safePadNum(details.number, 3);
    return secVal ? `${safePadNum(secVal, 6)}-${num}`.toLowerCase() : num.toLowerCase();
  }

  /** @override */
  getSortKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as ArchitectureDetails;
    const groupKey = this.getGroupKey(doc);
    const rev = safePadNum(details.revision, 3);
    const dateStr = formatDateStr(doc.date);
    return `${groupKey}-${rev}-${dateStr}`;
  }

  /** @override */
  getIdentityData(doc: ValidatedDocument): IdentityData {
    return {
      identityGroup: this.getGroupKey(doc),
      identityRevisionGroup: this.getSortKey(doc),
      identity: this.getTargetKey(doc)
    };
  }

  /** @override */
  getTargetKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as ArchitectureDetails;
    const secVal = getSectionVal(details?.section);
    return secVal ? `${secVal}-${details.number}-${details.revision}` : `${details.number}-${details.revision}`;
  }

  /** @override */
  getGroupKeyFromRow(row: any[], headers: string[]): string {
    return getRowGroupKey(row, "Architecture", headers);
  }

  /** @override */
  getSortKeyFromRow(row: any[], headers: string[]): string {
    return getRowSortKey(row, "Architecture", headers);
  }

  /** @override */
  getTargetKeyFromRow(row: any[], headers: string[]): string {
    const secIdx = headers.indexOf("Section");
    const numIdx = headers.indexOf("Number");
    const revIdx = headers.indexOf("Revision");
    const sec = String(secIdx !== -1 ? row[secIdx] || "" : "").trim();
    const num = String(numIdx !== -1 ? row[numIdx] || "" : "").trim();
    const rev = String(revIdx !== -1 ? row[revIdx] || "" : "").trim();
    return sec ? `${sec}-${num}-${rev}` : `${num}-${rev}`;
  }

  /** @override */
  formatRowPayload(doc: ValidatedDocument, options: { link: string; contactHistory: string; status: string }): Record<string, string> {
    const details = doc.disciplineDetails as ArchitectureDetails;
    return {
      "Section": details.section,
      "Number": details.number,
      "Title": details.title,
      "Revision": details.revision,
      "Date": doc.date,
      "Contact": doc.contact,
      "Action": doc.action,
      "Status": options.status,
      "Notes": doc.notes || "",
      "Link": options.link,
      "Contact History": options.contactHistory
    };
  }

  /** @override */
  getFileName(doc: ValidatedDocument, contactHistory: string, actionAbbr: string): string {
    const details = doc.disciplineDetails as ArchitectureDetails;
    const targetKey = this.getTargetKey(doc);
    const suffix = actionAbbr ? actionAbbr : "";
    return `${targetKey} ${details.title} - ${doc.date} ${contactHistory}${suffix}`;
  }

  /** @override */
  getFilingSubfolders(doc: ValidatedDocument): string[] {
    const details = doc.disciplineDetails as ArchitectureDetails;
    const closedFolder = (typeof CONFIG !== "undefined" && CONFIG.CLOSED_FOLDER_NAME) ? CONFIG.CLOSED_FOLDER_NAME : "Closed";
    const secStr = String(details && details.section ? details.section : "").trim();
    if (!secStr) {
      return [closedFolder];
    }
    const secPrefix = secStr.substring(0, 2);
    const divName = (typeof CSI_DIVISIONS !== "undefined" && CSI_DIVISIONS[secPrefix]) ? CSI_DIVISIONS[secPrefix] : null;
    if (divName) {
      return [closedFolder, divName];
    }
    return [closedFolder];
  }
}

/**
 * Strategy implementation for Furniture, Fixtures & Equipment (FF&E) discipline submittals.
 * Groups by Spec Tag, orders by revision and date, and formats FF&E specific spreadsheet columns.
 */
class FFESubmittalStrategy implements DocumentLogStrategy<ValidatedDocument> {
  /** @override */
  getGroupKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as FFEDetails;
    return String(details.specTag || "").trim().toLowerCase();
  }

  /** @override */
  getSortKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as FFEDetails;
    const groupKey = this.getGroupKey(doc);
    const rev = safePadNum(details.revision, 3);
    const dateStr = formatDateStr(doc.date);
    return `${groupKey}-${rev}-${dateStr}`;
  }

  /** @override */
  getTargetKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as FFEDetails;
    return `${details.specTag}-${details.revision}`;
  }

  /** @override */
  getGroupKeyFromRow(row: any[], headers: string[]): string {
    return getRowGroupKey(row, "FF&E", headers);
  }

  /** @override */
  getSortKeyFromRow(row: any[], headers: string[]): string {
    return getRowSortKey(row, "FF&E", headers);
  }

  /** @override */
  getTargetKeyFromRow(row: any[], headers: string[]): string {
    const tagIdx = headers.indexOf("Spec Tag");
    const revIdx = headers.indexOf("Revision");
    const tag = String(tagIdx !== -1 ? row[tagIdx] || "" : "").trim();
    const rev = String(revIdx !== -1 ? row[revIdx] || "" : "").trim();
    return `${tag}-${rev}`;
  }

  /** @override */
  formatRowPayload(doc: ValidatedDocument, options: { link: string; contactHistory: string; status: string }): Record<string, string> {
    const details = doc.disciplineDetails as FFEDetails;
    return {
      "Spec Tag": details.specTag,
      "Related Tag": details.relatedTag || "",
      "Spec Title": details.specTitle,
      "Vendor": details.vendor,
      "Revision": details.revision,
      "Date": doc.date,
      "Contact": doc.contact,
      "Action": doc.action,
      "Status": options.status,
      "Notes": doc.notes || "",
      "Link": options.link,
      "Contact History": options.contactHistory
    };
  }

  /** @override */
  getFileName(doc: ValidatedDocument, contactHistory: string, actionAbbr: string): string {
    const details = doc.disciplineDetails as FFEDetails;
    const targetKey = this.getTargetKey(doc);
    const suffix = actionAbbr ? actionAbbr : "";
    return `${targetKey} ${details.vendor} - ${doc.date} ${contactHistory}${suffix}`;
  }

  /** @override */
  getFilingSubfolders(doc: ValidatedDocument): string[] {
    const details = doc.disciplineDetails as FFEDetails;
    const specTag = String(details && details.specTag ? details.specTag : "").trim();
    const closedFolder = (typeof CONFIG !== "undefined" && CONFIG.CLOSED_FOLDER_NAME) ? CONFIG.CLOSED_FOLDER_NAME : "Closed";
    if (specTag) {
      const prefix = specTag.substring(0, 2);
      if (prefix) {
        return [closedFolder, prefix];
      }
    }
    return [closedFolder];
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ArchitectureSubmittalStrategy,
    FFESubmittalStrategy,
    formatDateStr
  };
}
