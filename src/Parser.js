/**
 * Modular configuration for email subject parsing patterns.
 * Add new patterns to this array as different project software formats arise.
 */
const EMAIL_SUBJECT_PATTERNS = [
  {
    id: 'ProcoreSubmittal', // Handles Procore submittals including section numbers with decimals (e.g., 238239.19-63.0)
    regex: /Submittal\s+([a-zA-Z0-9\.]+)-(\d+)[\.-](\d+)?(?:,\s*(.*))?/i,
    extract: (match) => ({
      section: match[1] || "",
      number: match[2] || "",
      revision: match[3] || "",
      title: match[4] ? match[4].trim() : ""
    })
  },
  {
    id: 'LegacyStandard',
    regex: /Submittal\s+([a-zA-Z0-9]+)-(\d+)[\.-](\d+)?(?:,\s*(.*))?/i,
    extract: (match) => ({
      section: match[1] || "",
      number: match[2] || "",
      revision: match[3] || "",
      title: match[4] ? match[4].trim() : ""
    })
  }
];

/**
 * Modular configuration for Drive filename parsing patterns.
 */
const DRIVE_FILENAME_PATTERNS = [
  {
    id: 'ArchitectureStandard',
    regex: /^[^A-Za-z0-9]*([A-Za-z0-9]+)-([A-Za-z0-9\.]+)-([A-Za-z0-9]+)\s+(.*?)\s+-\s+(\d{6})/i,
    extract: (match) => ({
      discipline: "Architecture",
      section: match[1],
      number: match[2],
      revision: match[3],
      title: match[4].trim(),
      date: match[5]
    })
  },
  {
    id: 'FFEStandard',
    regex: /^[^A-Za-z0-9]*([A-Za-z0-9]+)-([A-Za-z0-9]+)\s+(.*?)\s+-\s+(\d{6})/i,
    extract: (match) => ({
      discipline: "FF&E",
      specTag: match[1],
      revision: match[2],
      vendor: match[3].trim(),
      date: match[4]
    })
  }
];



function parseDriveFilename(filename) {
  let data = { discipline: "Architecture", section: null, number: null, revision: null, title: null, specTag: null, vendor: null, date: null };

  // Evaluate Drive filename against modular patterns
  for (const pattern of DRIVE_FILENAME_PATTERNS) {
    const match = filename.match(pattern.regex);
    if (match) {
      Object.assign(data, pattern.extract(match));
      break;
    }
  }

  return data;
}

async function extractActionFromPdfForm(fileId) {
  try {
    const setTimeout = (fn) => { fn(); return 0; };
    eval(UrlFetchApp.fetch(CONFIG.PDF_LIB_URL).getContentText());
    const { PDFDocument } = PDFLib;

    const bytes = DriveApp.getFileById(fileId).getBlob().getBytes();
    const unsigned = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) unsigned[i] = bytes[i] & 0xFF;

    const pdfDoc = await PDFDocument.load(unsigned);
    const form = pdfDoc.getForm();
    const reverseMap = {};

    for (const [uiAction, cbName] of Object.entries(PDF_CHECKBOX_MAP)) reverseMap[cbName] = uiAction;

    for (const cbName of Object.values(PDF_CHECKBOX_MAP)) {
      try {
        if (form.getCheckBox(cbName).isChecked()) return reverseMap[cbName];
      } catch (e) { }
    }

    try {
      const selected = form.getRadioGroup('Submittal Response').getSelected();
      if (selected) return reverseMap[selected.trim().toUpperCase()] || selected;
    } catch (e) { }

    return null;
  } catch (err) {
    return null;
  }
}

function parseEmailData(message) {
  const defaultResult = {
    driveName: "",
    discipline: CONFIG.DEFAULT_DISCIPLINE,
    action: CONFIG.DEFAULT_ACTION
  };

  if (!message) return defaultResult;

  const sender = message.getFrom() || "";
  const subject = message.getSubject() || "";
  const body = message.getPlainBody() || "";

  if (sender.toLowerCase().includes("@mail.forma.autodesk.com")) {
    return { ...defaultResult, ...parseFormaEmail_(subject, body) };
  }

  if (sender.toLowerCase().includes("procore.com") || sender.toLowerCase().includes("procoretech.com") || /procore/i.test(sender)) {
    return { ...defaultResult, ...parseProcoreEmail_(subject, body) };
  }

  return defaultResult;
}

function parseFormaEmail_(subject, body) {
  const result = {};
  const projectMatch = subject.match(/^([^-]+)-/);
  if (projectMatch) result.driveName = projectMatch[1].trim();

  const subMatch = subject.match(/#\s*(.*?)\s+was/i);
  if (subMatch) {
    const parts = subMatch[1].split('-');
    result.section = parts[0].trim();
    if (parts.length > 1) result.revision = parts.slice(1).join('-').trim();
    if (/^\d/.test(result.section)) result.discipline = "Architecture";
  }

  const actionMatch = subject.match(/was\s+(.+)$/i);
  if (actionMatch) {
    const intent = actionMatch[1].toLowerCase().trim();
    if (intent.includes("provided for your information") || intent.includes("submitted") || intent.includes("forwarded")) {
      result.action = CONFIG.DEFAULT_ACTION;
    } else {
      result.action = actionMatch[1].trim();
    }
  }
  return result;
}

function parseProcoreEmail_(subject, body) {
  const result = {};
  const projectMatch = subject.match(/\[([^\]]+)\]/);
  if (projectMatch) result.driveName = projectMatch[1].trim();

  const submittalMatch = subject.match(/(?:Submittal|Subm)\s*#?\s*([\w]+)-([\w.]+)/i);
  if (submittalMatch) {
    result.section = submittalMatch[1];
    result.revision = submittalMatch[2];
    if (/^\d/.test(result.section)) result.discipline = "Architecture";
  }

  if (/returned/i.test(subject) || /reviewed/i.test(subject)) {
    result.action = "Reviewed";
  } else if (/submitted/i.test(subject)) {
    result.action = CONFIG.DEFAULT_ACTION;
  }
  return result;
}