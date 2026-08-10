import test from "node:test";
import assert from "node:assert";
import { DocumentPipeline } from "../src/core/intake/DocumentPipeline";
import { processSubmission } from "../src/Process";
import { GasMockHarness } from "./harness/GasMockHarness";

test.beforeEach(() => {
  GasMockHarness.install();
});

(globalThis as any).CONFIG = {
  LOG_HEADER_ROW: 3,
  LOG_SHEET_NAME: "Submittals Log",
  STAMPED_FILE_PREFIX: "STAMPED_",
  TRANSMITTAL_TEMPLATE_ID: "tmpl-1",
  PDF_TEMPLATE_ID: "tmpl-2"
};

(globalThis as any).MESSAGES = {
  ERROR_GENERAL: (m: string) => `Error: ${m}`,
  SUCCESS_MOVED: (f: string) => `Moved to ${f}`
};

(globalThis as any).CardService = {
  newActionResponseBuilder: () => {
    let resNav: any = null, resNotif: any = null;
    const builder: any = {
      setNavigation: (nav: any) => { resNav = nav; return builder; },
      setNotification: (notif: any) => { resNotif = notif; return builder; },
      build: () => ({ navigation: resNav, notification: resNotif })
    };
    return builder;
  },
  newNotification: () => ({
    setText: (t: string) => t
  }),
  newNavigation: () => ({
    updateCard: (card: any) => ({ card, action: "updateCard" }),
    pushCard: (card: any) => ({ card, action: "pushCard" })
  })
};

(globalThis as any).buildIntakeCard = (e: any, d: any, flashData: any) => ({ cardType: "MainCard", flashData });

test("DocumentPipeline.processFormIntake - returns interaction_required ADD_TAG when specTag does not exist in validTags", () => {
  const formInput = {
    discipline: "FF&E",
    date: "2026-07-25",
    contact: "Jane Smith",
    action: "Approved",
    specTag: "NEW-TAG-99",
    specTitle: "Special Chair",
    vendor: "Herman Miller"
  };

  const context = {
    ffeTags: {
      tags: ["CH-01", "CH-02"],
      vendors: ["Herman Miller"]
    }
  };

  const result = DocumentPipeline.processFormIntake(formInput, context);

  assert.strictEqual(result.status, "interaction_required");
  if (result.status === "interaction_required") {
    assert.strictEqual(result.interactionType, "ADD_TAG");
    assert.match(result.message, /Spec Tag "NEW-TAG-99" is not in the Tag List/);
  }
});

test("DocumentPipeline.processFormIntake - returns interaction_required ADD_VENDOR when vendor does not exist in validVendors", () => {
  const formInput = {
    discipline: "FF&E",
    date: "2026-07-25",
    contact: "Jane Smith",
    action: "Approved",
    specTag: "CH-01",
    specTitle: "Dining Chair",
    vendor: "Unknown Design Co"
  };

  const context = {
    ffeTags: {
      tags: ["CH-01", "CH-02"],
      vendors: ["Herman Miller", "Knoll"]
    }
  };

  const result = DocumentPipeline.processFormIntake(formInput, context);

  assert.strictEqual(result.status, "interaction_required");
  if (result.status === "interaction_required") {
    assert.strictEqual(result.interactionType, "ADD_VENDOR");
    assert.match(result.message, /Vendor "Unknown Design Co" is not in the Tag List/);
  }
});

test("DocumentPipeline.processFormIntake - bypasses tag validation when bypassTagValidation is set", () => {
  const formInput = {
    discipline: "FF&E",
    date: "2026-07-25",
    contact: "Jane Smith",
    action: "Approved",
    specTag: "NEW-TAG-99",
    specTitle: "Special Chair",
    vendor: "Herman Miller"
  };

  const context = {
    ffeTags: {
      tags: ["CH-01"],
      vendors: ["Herman Miller"]
    },
    bypassTagValidation: true
  };

  const result = DocumentPipeline.processFormIntake(formInput, context);

  assert.strictEqual(result.status, "success");
});

test("DocumentPipeline.processFormIntake - bypasses vendor validation when bypassVendorValidation is set", () => {
  const formInput = {
    discipline: "FF&E",
    date: "2026-07-25",
    contact: "Jane Smith",
    action: "Approved",
    specTag: "CH-01",
    specTitle: "Dining Chair",
    vendor: "Unknown Design Co"
  };

  const context = {
    ffeTags: {
      tags: ["CH-01"],
      vendors: ["Herman Miller"]
    },
    bypassVendorValidation: true
  };

  const result = DocumentPipeline.processFormIntake(formInput, context);

  assert.strictEqual(result.status, "success");
});

test("processSubmission handles interaction_required ADD_TAG by updating main card with promptAddTag flash", async () => {
  const fakeSheet = { getSheetId: () => 505 };
  (globalThis as any).SpreadsheetApp = {
    openById: () => ({ getSheetByName: () => fakeSheet })
  };
  (globalThis as any).defaultLogRepository = {
    verifyAndFormatLogSheet: () => ["Spec Tag", "Spec Title", "Vendor"],
    getLogSettings: () => ({
      logFileId: "log-1",
      targetFolderId: "folder-1",
      actions: [{ action: "Approved", status: "Approved", abbr: " Appr" }],
      ffeTags: { tags: ["CH-01"], vendors: ["Herman Miller"] }
    })
  };

  const event = {
    formInput: {
      discipline: "FF&E",
      date: "2026-07-25",
      contact: "Jane Smith",
      action: "Approved",
      specTag: "NEW-TAG",
      specTitle: "New Chair",
      vendor: "Herman Miller"
    },
    parameters: { logFileId: "log-1" }
  };

  const res = await processSubmission(event as any);
  assert.strictEqual(res.navigation.card.flashData.promptAddTag, true);
  assert.match(res.navigation.card.flashData.warning, /Spec Tag "NEW-TAG" is not in the Tag List/);
});

test("processSubmission handles interaction_required ADD_VENDOR by updating main card with promptAddVendor flash", async () => {
  const fakeSheet = { getSheetId: () => 505 };
  (globalThis as any).SpreadsheetApp = {
    openById: () => ({ getSheetByName: () => fakeSheet })
  };
  (globalThis as any).defaultLogRepository = {
    verifyAndFormatLogSheet: () => ["Spec Tag", "Spec Title", "Vendor"],
    getLogSettings: () => ({
      logFileId: "log-1",
      targetFolderId: "folder-1",
      actions: [{ action: "Approved", status: "Approved", abbr: " Appr" }],
      ffeTags: { tags: ["CH-01"], vendors: ["Herman Miller"] }
    })
  };

  const event = {
    formInput: {
      discipline: "FF&E",
      date: "2026-07-25",
      contact: "Jane Smith",
      action: "Approved",
      specTag: "CH-01",
      specTitle: "New Chair",
      vendor: "New Vendor"
    },
    parameters: { logFileId: "log-1" }
  };

  const res = await processSubmission(event as any);
  assert.strictEqual(res.navigation.card.flashData.promptAddVendor, true);
  assert.match(res.navigation.card.flashData.warning, /Vendor "New Vendor" is not in the Tag List/);
});
