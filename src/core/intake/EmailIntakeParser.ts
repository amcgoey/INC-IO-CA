/// <reference path="../../types.ts" />
/**
 * @file EmailIntakeParser.ts
 * @description Tier 1 2-Phase email parser dispatch engine & deterministic field merging logic.
 */

function padSubmittalNumberEmail_(numStr?: string, targetLen: number = 3): string {
  if (!numStr) return "";
  const trimmed = numStr.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.length < targetLen ? trimmed.padStart(targetLen, "0") : trimmed;
  }
  return trimmed;
}

function normalizeSpecSectionEmail_(secStr?: string): string {
  if (!secStr) return "";
  const codePart = secStr.trim().split(/\s+-\s+|\s+-(?=[A-Za-z])/)[0];
  return codePart.replace(/[\s.-]+/g, "").toUpperCase();
}

function splitNumberAndRevisionEmail_(numRevStr: string): { submittalNum: string; revNum: string } {
  if (!numRevStr) return { submittalNum: "", revNum: "0" };
  const trimmed = numRevStr.trim();
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    return {
      submittalNum: padSubmittalNumberEmail_(parts[0], 3),
      revNum: parts.slice(1).join(".")
    };
  }
  if (trimmed.includes("-")) {
    const parts = trimmed.split("-");
    return {
      submittalNum: padSubmittalNumberEmail_(parts[0], 3),
      revNum: parts.slice(1).join("-")
    };
  }
  return {
    submittalNum: padSubmittalNumberEmail_(trimmed, 3),
    revNum: "0"
  };
}

function cleanEmailTitle_(rawTitle: string): string {
  if (!rawTitle) return "";
  let title = rawTitle
    .replace(/^[,\-_|:]\s*/, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  title = title.replace(TRAILING_NOISE_RE_EMAIL, "").trim();
  if (title && !EXACT_NOISE_RE_EMAIL.test(title)) {
    return title;
  }
  return "";
}

function parseSubmittalNumberAndRevision_(numRevStr: string): { submittalNum: string; revNum: string } {
  if (!numRevStr) return { submittalNum: "", revNum: "0" };
  const trimmed = numRevStr.trim();
  if (trimmed.includes(".") || trimmed.includes("-")) {
    return splitNumberAndRevisionEmail_(trimmed);
  }
  return {
    submittalNum: padSubmittalNumberEmail_(trimmed, 3),
    revNum: "0"
  };
}

const STATUS_NOISE_WORDS_EMAIL = "was|is|was\\s+submitted|has\\s+been\\s+submitted|submitted|for\\s+review|for\\s+approval|for\\s+app|notification|distributed|distribute|provided\\s+for\\s+your\\s+information|for\\s+your\\s+information|fyi";
const TRAILING_NOISE_RE_EMAIL = new RegExp(`\\s+(?:${STATUS_NOISE_WORDS_EMAIL}).*`, "i");
const EXACT_NOISE_RE_EMAIL = new RegExp(`^(?:${STATUS_NOISE_WORDS_EMAIL})$`, "i");

function parseNumberedPrefixEmail_(prefix: string, subject: string = "", body: string = ""): ParsedData {
  const result: ParsedData = {
    action: "Received"
  };

  const projectMatch = subject.match(/\[([^\]]+)\]/);
  if (projectMatch) result.driveName = projectMatch[1].trim();

  const regex = new RegExp(prefix + "\\s*#?\\s*([\\w]+)(?:[.-]([\\w]+))?(?:\\s*[-|_|:]\\s*|\\s+)?(.*)?", "i");
  const match = subject.match(regex);
  if (match) {
    result.number = padSubmittalNumberEmail_(match[1]);
    result.submittalNum = result.number;
    if (match[2]) {
      result.revision = match[2];
      result.revNum = match[2];
    }
    if (match[3]) {
      const title = cleanEmailTitle_(match[3]);
      if (title) result.title = title;
    }
  }

  return result;
}

class SubmittalEmailParser {
  static parse(subject: string = "", body: string = "", sender: string = ""): ParsedData {
    const result: ParsedData = {
      action: "Received"
    };

    const combinedHeaders = (sender + " " + subject).toLowerCase();
    if (combinedHeaders.includes("forma") || combinedHeaders.includes("autodesk")) {
      return { ...result, ...EmailIntakeParser.parseFormaEmail_(subject, body) };
    }
    if (combinedHeaders.includes("cmic") || combinedHeaders.includes("stobg") || combinedHeaders.includes("trn")) {
      return { ...result, ...EmailIntakeParser.parseCmicEmail_(subject, body) };
    }
    if (combinedHeaders.includes("procore")) {
      return { ...result, ...EmailIntakeParser.parseProcoreEmail_(subject, body) };
    }

    const projectMatch = subject.match(/\[([^\]]+)\]/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    const subMatch = subject.match(/(?:Submittal|Subm)\s*#?\s*(\d{6}|\d{2}[\s.-]?\d{2}[\s.-]?\d{2}|[\w.]+)-([\w.]+)(?:[,\-_|:]\s*|\s+)?(.*)?/i);
    if (subMatch) {
      result.specSection = normalizeSpecSectionEmail_(subMatch[1]);
      result.section = result.specSection;
      const { submittalNum, revNum } = parseSubmittalNumberAndRevision_(subMatch[2]);
      result.submittalNum = submittalNum;
      result.number = submittalNum;
      result.revNum = revNum;
      result.revision = revNum;
      if (subMatch[3]) {
        const title = cleanEmailTitle_(subMatch[3]);
        if (title) result.title = title;
      }
    } else {
      const generic = GenericEmailParser.parse(subject, body, sender);
      if (generic.specSection || generic.submittalNum) {
        Object.assign(result, generic);
      }
    }

    return result;
  }
}

class RfiEmailParser {
  static parse(subject: string = "", body: string = "", sender: string = ""): ParsedData {
    return parseNumberedPrefixEmail_("RFI", subject, body);
  }
}

class AsiEmailParser {
  static parse(subject: string = "", body: string = "", sender: string = ""): ParsedData {
    return parseNumberedPrefixEmail_("ASI", subject, body);
  }
}
class GenericEmailParser {
  static parse(subject: string = "", body: string = "", sender: string = ""): ParsedData {
    const result: ParsedData = {
      action: "Received"
    };

    const projectMatch = subject.match(/\[([^\]]+)\]/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    const searchableEmailContent = (subject + "\n" + (body || "")).replace(/=\r?\n/g, "");

    const submittalSectionMatch = searchableEmailContent.match(/(?:Submittal\s*#?|Subm\s*#?|Spec\s*#?|Section\s*#?|Transmittal\s*(?:for)?\s*)\s*(\d{6}|\d{2}[\s.-]?\d{2}[\s.-]?\d{2})[\s._-]*#?\s*([\w.]+(?:-[\w.]+)*)/i) ||
                                searchableEmailContent.match(/(\d{6}|\d{2}[\s.-]?\d{2}[\s.-]?\d{2})[\s._-]+(\d{1,4})(?:[.-](\d{1,3}))?/);

    if (submittalSectionMatch) {
      result.specSection = normalizeSpecSectionEmail_(submittalSectionMatch[1]);
      result.section = result.specSection;
      const submittalNumberAndRevisionString = submittalSectionMatch[2] ? submittalSectionMatch[2].trim() : "";
      if (submittalNumberAndRevisionString) {
        const { submittalNum, revNum } = splitNumberAndRevisionEmail_(submittalNumberAndRevisionString);
        result.submittalNum = submittalNum;
        result.number = submittalNum;
        if (revNum) {
          result.revNum = revNum;
          result.revision = revNum;
        }
      }
      if (submittalSectionMatch[3] && !result.revNum) {
        result.revNum = submittalSectionMatch[3];
        result.revision = submittalSectionMatch[3];
      }

      const matchedFullText = submittalSectionMatch[0];
      const matchIndex = typeof submittalSectionMatch.index === "number" ? submittalSectionMatch.index : searchableEmailContent.indexOf(matchedFullText);
      if (matchIndex !== -1) {
        const remainingText = searchableEmailContent.substring(matchIndex + matchedFullText.length);
        const delimiterMatch = remainingText.match(/^\s*(?:[,_\-:|]\s*|\s+-\s+|\s+)(.+)/);
        if (delimiterMatch) {
          let extractedTitle = delimiterMatch[1].replace(/[\r\n].*/s, "").trim();

          extractedTitle = extractedTitle
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, "\"")
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");

          extractedTitle = extractedTitle.replace(TRAILING_NOISE_RE_EMAIL, "").trim();

          const isPureNoise = EXACT_NOISE_RE_EMAIL.test(extractedTitle);

          if (extractedTitle && !isPureNoise) {
            result.title = extractedTitle;
          }
        }
      }
    }

    return result;
  }
}
class EmailIntakeParser {
  static parseProcoreEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {
      discipline: "Architecture",
      action: "Received"
    };

    const projectMatch = subject.match(/\[([^\]]+)\]/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    const distMatch = subject.match(/Submittal\s+Distributed\s+([\w.]+)-([\w.]+)(?:,\s*(.*))?/i);
    if (distMatch) {
      result.specSection = normalizeSpecSectionEmail_(distMatch[1]);
      result.section = result.specSection;
      const { submittalNum, revNum } = splitNumberAndRevisionEmail_(distMatch[2]);
      result.submittalNum = submittalNum;
      result.number = submittalNum;
      result.revNum = distMatch[2].includes(".") ? revNum : distMatch[2].trim();
      result.revision = result.revNum;
      if (distMatch[3]) {
        const title = cleanEmailTitle_(distMatch[3]);
        if (title) result.title = title;
      }
      return result;
    }

    const updatedMatch = subject.match(/for\s+Submittal\s+([\w.]+)-([\w.]+)(?:,\s*(.*))?/i);
    if (updatedMatch) {
      result.specSection = normalizeSpecSectionEmail_(updatedMatch[1]);
      result.section = result.specSection;
      const { submittalNum, revNum } = splitNumberAndRevisionEmail_(updatedMatch[2]);
      result.submittalNum = submittalNum;
      result.number = submittalNum;
      result.revNum = updatedMatch[2].includes(".") ? revNum : updatedMatch[2].trim();
      result.revision = result.revNum;
      if (updatedMatch[3]) {
        const title = cleanEmailTitle_(updatedMatch[3]);
        if (title) result.title = title;
      }
      return result;
    }

    const submittalMatch = subject.match(/(?:Submittal|Subm)\s*#?\s*([\w.]+)-([\w.]+)/i);
    if (submittalMatch) {
      result.specSection = normalizeSpecSectionEmail_(submittalMatch[1]);
      result.section = result.specSection;
      const { submittalNum, revNum } = splitNumberAndRevisionEmail_(submittalMatch[2]);
      result.submittalNum = submittalNum;
      result.number = submittalNum;
      result.revNum = submittalMatch[2].includes(".") ? revNum : submittalMatch[2].trim();
      result.revision = result.revNum;
    }

    return result;
  }

  static parseFormaEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {
      discipline: "Architecture",
      action: "Received"
    };

    const projectMatch = subject.match(/^([^-]+)-/);
    if (projectMatch) result.driveName = projectMatch[1].trim();

    const subMatch = subject.match(/(?:Submittal\s*)?#\s*([\d\s]+)-([\w.]+(?:-[\w.]+)*)/i) ||
                     subject.match(/(?:Submittal\s*)?#\s*([\w\.\-]+)\s+was/i);
    if (subMatch) {
      const fullSectionStr = subMatch[1].trim();
      const numRevStr = subMatch[2] ? subMatch[2].trim() : "";
      result.specSection = normalizeSpecSectionEmail_(subMatch[1]);
      result.section = result.specSection;
      if (numRevStr) {
        const { submittalNum, revNum } = splitNumberAndRevisionEmail_(numRevStr);
        result.submittalNum = submittalNum;
        result.number = submittalNum;
        result.revNum = (revNum === "0" || !revNum) ? numRevStr : revNum;
        result.revision = result.revNum;
      }
    }

    if (body) {
      const cleanBody = body.replace(/=\r?\n/g, "").replace(/<[^>]+>/g, " ");
      const bodyTitleMatch = cleanBody.match(/item\s*#\s*[\d\s\-.]+\s+([^<>\r\n]+?)(?:\s+was|\s+provided|\s+submitted|\s+for|\r|\n|$)/i);
      if (bodyTitleMatch) {
        result.title = bodyTitleMatch[1].replace(/\s+/g, " ").trim();
      }
    }

    return result;
  }
  static parseCmicEmail_(subject: string, body: string): Partial<ParsedData> {
    const result: Partial<ParsedData> = {
      action: "Received"
    };

    const projectMatch = subject.match(/\[([^\]]+)\]/);
    if (projectMatch) {
      let rawProj = projectMatch[1].trim();
      if (rawProj.includes("-")) {
        const parts = rawProj.split("-");
        result.driveName = parts.slice(1).join("-").trim();
      } else {
        result.driveName = rawProj;
      }
    }

    const cmicSubjMatch = subject.match(/(?:P\d+_)?(\d{6})-(\d+)-(\d+)_([^_]+)/i);
    if (cmicSubjMatch) {
      result.specSection = normalizeSpecSectionEmail_(cmicSubjMatch[1]);
      result.section = result.specSection;
      result.submittalNum = padSubmittalNumberEmail_(cmicSubjMatch[2]);
      result.number = result.submittalNum;
      result.revNum = cmicSubjMatch[3];
      result.revision = cmicSubjMatch[3];
      result.title = cmicSubjMatch[4].trim();
      return result;
    }

    if (body) {
      const bodyMatch = body.match(/(?:Code\/Description|Transmittal):\s*(?:P\d+_)?(\d{6})-(\d+)(?:-(\d+))?\s*(?:-|_)\s*([^\r\n]+)/i);
      if (bodyMatch) {
        result.specSection = normalizeSpecSectionEmail_(bodyMatch[1]);
        result.section = result.specSection;
        result.submittalNum = padSubmittalNumberEmail_(bodyMatch[2]);
        result.number = result.submittalNum;
        if (bodyMatch[3]) {
          result.revNum = bodyMatch[3];
          result.revision = bodyMatch[3];
        }
        if (bodyMatch[4]) result.title = bodyMatch[4].replace(/_For App.*/i, "").trim();
      }
    }

    return result;
  }

  static dispatchParser(docType: string = "", subject: string = "", body: string = "", sender: string = ""): ParsedData {
    const normalizedDocType = (docType || "").trim().toUpperCase();

    if (normalizedDocType === "RFI") {
      return RfiEmailParser.parse(subject, body, sender);
    }
    if (normalizedDocType === "ASI") {
      return AsiEmailParser.parse(subject, body, sender);
    }

    const combinedHeaders = (sender + " " + subject).toLowerCase();
    if (combinedHeaders.includes("forma") || combinedHeaders.includes("autodesk") ||
        combinedHeaders.includes("procore") || combinedHeaders.includes("cmic") ||
        combinedHeaders.includes("stobg") || combinedHeaders.includes("trn")) {
      return SubmittalEmailParser.parse(subject, body, sender);
    }

    if (normalizedDocType === "SUBMITTAL") {
      return SubmittalEmailParser.parse(subject, body, sender);
    }

    let parsed = GenericEmailParser.parse(subject, body, sender);
    if (!parsed.specSection && !parsed.number && !parsed.submittalNum) {
      const fallback = SubmittalEmailParser.parse(subject, body, sender);
      parsed = { ...parsed, ...fallback };
    }

    return parsed;
  }

  static mergeAiTriageAndRegex(
    aiPrediction: AIPrediction | Record<string, string>,
    regexResult: ParsedData
  ): ParsedData {
    const merged: ParsedData = {
      action: regexResult.action || "Received"
    };

    const aiObj = (aiPrediction || {}) as Record<string, string>;

    if (aiObj.predictedProjectName) merged.driveName = aiObj.predictedProjectName;
    else if (aiObj.driveName) merged.driveName = aiObj.driveName;
    else if (regexResult.driveName) merged.driveName = regexResult.driveName;

    if (aiObj.predictedDiscipline) merged.discipline = aiObj.predictedDiscipline;
    else if (aiObj.discipline) merged.discipline = aiObj.discipline;
    else if (regexResult.discipline) merged.discipline = regexResult.discipline;

    if (aiObj.notes) merged.notes = aiObj.notes;
    if (aiObj.contact) merged.contact = aiObj.contact;

    if (aiObj.title && aiObj.title.trim() !== "") {
      merged.title = aiObj.title.trim();
    } else if (regexResult.title && regexResult.title.trim() !== "") {
      merged.title = regexResult.title.trim();
    }

    const regexSec = regexResult.specSection || regexResult.section;
    const aiSec = aiObj.specSection || aiObj.section;
    if (regexSec && regexSec.trim() !== "") {
      merged.specSection = regexSec.trim();
      merged.section = regexSec.trim();
    } else if (aiSec && aiSec.trim() !== "") {
      merged.specSection = aiSec.trim();
      merged.section = aiSec.trim();
    }

    const regexNum = regexResult.submittalNum || regexResult.number;
    const aiNum = aiObj.submittalNum || aiObj.number;
    if (regexNum && regexNum.trim() !== "") {
      merged.submittalNum = regexNum.trim();
      merged.number = regexNum.trim();
    } else if (aiNum && aiNum.trim() !== "") {
      merged.submittalNum = aiNum.trim();
      merged.number = aiNum.trim();
    }

    const regexRev = regexResult.revNum !== undefined && regexResult.revNum !== null ? regexResult.revNum : regexResult.revision;
    const aiRev = aiObj.revNum !== undefined && aiObj.revNum !== null ? aiObj.revNum : aiObj.revision;
    if (regexRev !== undefined && regexRev !== null && String(regexRev).trim() !== "") {
      merged.revNum = String(regexRev).trim();
      merged.revision = String(regexRev).trim();
    } else if (aiRev !== undefined && aiRev !== null && String(aiRev).trim() !== "") {
      merged.revNum = String(aiRev).trim();
      merged.revision = String(aiRev).trim();
    }

    return merged;
  }

  static parseEmail2Phase(
    emailData: EmailData,
    aiPrediction?: AIPrediction | Record<string, string>
  ): ParsedData {
    const aiObj = (aiPrediction || {}) as Record<string, string>;
    const predictedDocType = aiObj.predictedDocType || aiObj.documentType || "Submittal";

    const regexParsed = EmailIntakeParser.dispatchParser(
      predictedDocType,
      emailData.subject,
      emailData.body,
      emailData.sender
    );

    return EmailIntakeParser.mergeAiTriageAndRegex(aiObj, regexParsed);
  }

  static parseEmail(emailData?: any): ParsedData {
    const defaultResult: ParsedData = {
      discipline: "Architecture",
      driveName: "",
      action: "Received"
    };

    if (!emailData) return defaultResult;

    const subject = typeof (emailData as any).getSubject === "function" ? (emailData as any).getSubject() : (emailData.subject || "");
    const body = typeof (emailData as any).getPlainBody === "function" ? (emailData as any).getPlainBody() : (emailData.body || "");
    const sender = typeof (emailData as any).getFrom === "function" ? (emailData as any).getFrom() : (emailData.sender || "");

    const regexParsed = EmailIntakeParser.dispatchParser("Submittal", subject, body, sender);
    const res: ParsedData = { ...defaultResult, ...regexParsed };

    if (res.specSection && !res.section) res.section = res.specSection;
    if (res.section && !res.specSection) res.specSection = res.section;
    if (res.submittalNum && !res.number) res.number = res.submittalNum;
    if (res.number && !res.submittalNum) res.submittalNum = res.number;
    if (res.revNum && !res.revision) res.revision = res.revNum;
    if (res.revision && !res.revNum) res.revNum = res.revision;

    return res;
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SubmittalEmailParser,
    RfiEmailParser,
    AsiEmailParser,
    GenericEmailParser,
    EmailIntakeParser
  };
}

(globalThis as Record<string, unknown>).SubmittalEmailParser = SubmittalEmailParser;
(globalThis as Record<string, unknown>).RfiEmailParser = RfiEmailParser;
(globalThis as Record<string, unknown>).AsiEmailParser = AsiEmailParser;
(globalThis as Record<string, unknown>).GenericEmailParser = GenericEmailParser;
(globalThis as Record<string, unknown>).EmailIntakeParser = EmailIntakeParser;
