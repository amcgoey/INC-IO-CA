// src/DocumentLogStrategy.ts

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

function safePadNum(val: any, len: number): string {
  if (typeof padNum !== "undefined") return padNum(val, len);
  if ((globalThis as any).padNum) return (globalThis as any).padNum(val, len);
  return String(val || "").trim().padStart(len, '0');
}

export interface DocumentLogStrategy<T = ValidatedDocument> {
  getGroupKey(doc: T): string;
  getSortKey(doc: T): string;
  getTargetKey(doc: T): string;
  getGroupKeyFromRow(row: any[], headers: string[]): string;
  getSortKeyFromRow(row: any[], headers: string[]): string;
  getTargetKeyFromRow(row: any[], headers: string[]): string;
  formatRowPayload(doc: T, options: { link: string; contactHistory: string; status: string }): Record<string, string>;
  getFileName(doc: T, contactHistory: string, actionAbbr: string): string;
  getFilingSubfolders?(doc: T): string[];
}

class ArchitectureSubmittalStrategy implements DocumentLogStrategy<ValidatedDocument> {
  getGroupKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as ArchitectureDetails;
    const sec = safePadNum(details.section, 6);
    const num = safePadNum(details.number, 3);
    return `${sec}-${num}`.toLowerCase();
  }

  getSortKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as ArchitectureDetails;
    const groupKey = this.getGroupKey(doc);
    const rev = safePadNum(details.revision, 3);
    const dateStr = formatDateStr(doc.date);
    return `${groupKey}-${rev}-${dateStr}`;
  }

  getTargetKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as ArchitectureDetails;
    return `${details.section}-${details.number}-${details.revision}`;
  }

  getGroupKeyFromRow(row: any[], headers: string[]): string {
    return getRowGroupKey(row, "Architecture", headers);
  }

  getSortKeyFromRow(row: any[], headers: string[]): string {
    return getRowSortKey(row, "Architecture", headers);
  }

  getTargetKeyFromRow(row: any[], headers: string[]): string {
    const secIdx = headers.indexOf("Section");
    const numIdx = headers.indexOf("Number");
    const revIdx = headers.indexOf("Revision");
    const sec = String(secIdx !== -1 ? row[secIdx] || "" : "").trim();
    const num = String(numIdx !== -1 ? row[numIdx] || "" : "").trim();
    const rev = String(revIdx !== -1 ? row[revIdx] || "" : "").trim();
    return `${sec}-${num}-${rev}`;
  }

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

  getFileName(doc: ValidatedDocument, contactHistory: string, actionAbbr: string): string {
    const details = doc.disciplineDetails as ArchitectureDetails;
    const targetKey = this.getTargetKey(doc);
    const suffix = actionAbbr ? actionAbbr : "";
    return `${targetKey} ${details.title} - ${doc.date} ${contactHistory}${suffix}`;
  }

  getFilingSubfolders(doc: ValidatedDocument): string[] {
    const details = doc.disciplineDetails as ArchitectureDetails;
    const secPrefix = String(details && details.section ? details.section : "").trim().substring(0, 2);
    const divName = (typeof CSI_DIVISIONS !== "undefined" && CSI_DIVISIONS[secPrefix]) ? CSI_DIVISIONS[secPrefix] : null;
    const closedFolder = (typeof CONFIG !== "undefined" && CONFIG.CLOSED_FOLDER_NAME) ? CONFIG.CLOSED_FOLDER_NAME : "Closed";
    if (divName) {
      return [closedFolder, divName];
    }
    return [closedFolder];
  }
}

class FFESubmittalStrategy implements DocumentLogStrategy<ValidatedDocument> {
  getGroupKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as FFEDetails;
    return String(details.specTag || "").trim().toLowerCase();
  }

  getSortKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as FFEDetails;
    const groupKey = this.getGroupKey(doc);
    const rev = safePadNum(details.revision, 3);
    const dateStr = formatDateStr(doc.date);
    return `${groupKey}-${rev}-${dateStr}`;
  }

  getTargetKey(doc: ValidatedDocument): string {
    const details = doc.disciplineDetails as FFEDetails;
    return `${details.specTag}-${details.revision}`;
  }

  getGroupKeyFromRow(row: any[], headers: string[]): string {
    return getRowGroupKey(row, "FF&E", headers);
  }

  getSortKeyFromRow(row: any[], headers: string[]): string {
    return getRowSortKey(row, "FF&E", headers);
  }

  getTargetKeyFromRow(row: any[], headers: string[]): string {
    const tagIdx = headers.indexOf("Spec Tag");
    const revIdx = headers.indexOf("Revision");
    const tag = String(tagIdx !== -1 ? row[tagIdx] || "" : "").trim();
    const rev = String(revIdx !== -1 ? row[revIdx] || "" : "").trim();
    return `${tag}-${rev}`;
  }

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

  getFileName(doc: ValidatedDocument, contactHistory: string, actionAbbr: string): string {
    const details = doc.disciplineDetails as FFEDetails;
    const targetKey = this.getTargetKey(doc);
    const suffix = actionAbbr ? actionAbbr : "";
    return `${targetKey} ${details.vendor} - ${doc.date} ${contactHistory}${suffix}`;
  }

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
