import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness } from "./harness/GasMockHarness";
import { CardSerializer } from "./harness/CardSerializer";

// Register globals and load modules
import "../src/DocumentTypeConfigRegistry";
import { PicklistResolver } from "../src/core/config/PicklistResolver";
import { DOCUMENT_LOG_WORKBOOK_SPEC } from "../src/core/config/DocumentLogWorkbookSpec";
import { renderDynamicFormFields } from "../src/adapters/gas/UI";

describe("PicklistResolver & Dynamic Field Rendering (Issue #177)", () => {
  let harness: GasMockHarness;

  beforeEach(() => {
    harness = GasMockHarness.install();
  });

  describe("PicklistResolver.resolveOptions", () => {
    it("should resolve 2D range arrays mapping row[0] = value and row[1] = label", () => {
      const mockRangeData = [
        ["ACME", "Acme Supplies"],
        ["GLOBAL", "Global Materials"],
        ["SOLO", ""] // Missing label fallback
      ];

      const options = PicklistResolver.resolveFrom2DArray(mockRangeData);

      assert.deepEqual(options, [
        { value: "ACME", label: "Acme Supplies" },
        { value: "GLOBAL", label: "Global Materials" },
        { value: "SOLO", label: "SOLO" }
      ]);
    });

    it("should resolve sheet-scoped named ranges with single-quoted sheet tab prefixes", () => {
      const ss = harness.sheetsService.openById("test-ss");
      const supportSheet = ss.insertSheet("Submittal FFE Support");
      supportSheet.setGrid([
        ["Vendor Key", "Vendor Label"],
        ["VEND-01", "Acme Supplies"],
        ["VEND-02", "Global Materials"]
      ]);
      ss.setNamedRange("'Submittal FFE Support'!Vendors", "Submittal FFE Support", "A2:B3");

      const optionsResult = PicklistResolver.resolvePicklistOptionsRange(
        "'Submittal FFE Support'!Vendors",
        ss,
        "Submittal_FFE",
        "Submittal FFE"
      );

      assert.equal(optionsResult.success, true);
      assert.deepEqual(optionsResult.options, [
        { value: "VEND-01", label: "Acme Supplies" },
        { value: "VEND-02", label: "Global Materials" }
      ]);
    });

    it("should defensively handle missing or deleted support tabs and fall back to configured JSON field options", () => {
      const ss = harness.sheetsService.openById("test-ss-missing");
      const fieldSpec = {
        key: "vendor",
        label: "Vendor",
        type: "list" as const,
        optionsRange: "'Missing Tab'!Vendors",
        options: [
          { value: "JSON_1", label: "JSON Vendor 1" },
          { value: "JSON_2", label: "JSON Vendor 2" }
        ]
      };

      const result = PicklistResolver.resolvePicklistOptionsRange(
        fieldSpec.optionsRange,
        ss,
        "Submittal_FFE",
        "Submittal FFE",
        fieldSpec
      );

      assert.equal(result.success, false);
      assert.equal(result.isFallback, true);
      assert.ok(result.warningBanner.includes("missing or invalid"));
      assert.deepEqual(result.options, fieldSpec.options);
      assert.equal(result.auditEvent?.eventType, "AUDIT_EVENT_MISSING_OPTIONS_RANGE");
    });

    it("should retry bare range names against DocumentLogWorkbookSpec tab declarations if direct lookup fails", () => {
      const ss = harness.sheetsService.openById("test-ss-spec-retry");
      const supportSheet = ss.insertSheet("Submittal FFE Support");
      supportSheet.setGrid([
        ["Vendor Key", "Vendor Label"],
        ["VEND-01", "Acme Supplies"]
      ]);

      const result = PicklistResolver.resolvePicklistOptionsRange(
        "Vendors",
        ss,
        "Submittal_FFE",
        "Submittal FFE"
      );

      assert.equal(result.success, true);
      assert.deepEqual(result.options, [
        { value: "VEND-01", label: "Acme Supplies" }
      ]);
    });
  });

  describe("PicklistResolver.normalizePicklistValue", () => {
    it("should handle hyphenated section numbers with descriptions under code rule", () => {
      const specCode = {
        key: "section",
        label: "Section",
        type: "string" as const,
        keyNormalizationRule: "code" as const
      };
      const result = PicklistResolver.normalizePicklistValue("08-11-00 - Metal Doors", specCode);
      assert.equal(result, "081100");
    });

    const fieldSpec = {
      key: "vendor",
      label: "Vendor",
      type: "list" as const,
      keyNormalizationRule: "picklist" as const,
      options: [
        { label: "Acme Supplies", value: "ACME" },
        { label: "Global Materials", value: "GLOBAL" }
      ]
    };

    it("should resolve display label to canonical value under picklist rule", () => {
      const val1 = PicklistResolver.normalizePicklistValue("Acme Supplies", fieldSpec);
      assert.equal(val1, "ACME");

      const val2 = PicklistResolver.normalizePicklistValue("ACME", fieldSpec);
      assert.equal(val2, "ACME");
    });

    it("should extract leading section codes under code rule", () => {
      const specCode = {
        key: "section",
        label: "Section",
        type: "string" as const,
        keyNormalizationRule: "code" as const
      };
      const result = PicklistResolver.normalizePicklistValue("08 11 00 - Metal Doors", specCode);
      assert.equal(result, "081100");
    });

    it("should preserve exact text under exact rule", () => {
      const specExact = {
        key: "notes",
        label: "Notes",
        type: "string" as const,
        keyNormalizationRule: "exact" as const
      };
      const result = PicklistResolver.normalizePicklistValue(" Special Note 1 ", specExact);
      assert.equal(result, "SPECIAL NOTE 1");
    });
  });

  describe("UI Dynamic Field Rendering (renderDynamicFormFields)", () => {
    it("should render picklist fields as SelectionInput(DROPDOWN) widgets", () => {
      const cardSection = CardService.newCardSection();
      const fields = [
        {
          key: "vendor",
          label: "Vendor",
          type: "list" as const,
          options: [
            { label: "Acme Supplies", value: "ACME" },
            { label: "Global Materials", value: "GLOBAL" }
          ]
        }
      ];

      renderDynamicFormFields(cardSection, fields, { formInput: { vendor: "GLOBAL" } });

      const card = CardService.newCardBuilder().addSection(cardSection).build();
      const cardJson = CardSerializer.toJSON(card);

      const widget = cardJson.sections[0].widgets[0] as any;
      assert.equal(widget.type, "SelectionInput");
      assert.equal(widget.inputType, "DROPDOWN");
      assert.equal(widget.fieldName, "vendor");
      assert.equal(widget.items.length, 2);
      assert.equal(widget.items[1].value, "GLOBAL");
      assert.equal(widget.items[1].selected, true);
    });

    it("should render date fields as DatePicker widgets (or YYMMDD text fallback)", () => {
      const cardSection = CardService.newCardSection();
      const fields = [
        {
          key: "date",
          label: "Submittal Date",
          type: "date" as const
        }
      ];

      renderDynamicFormFields(cardSection, fields, { formInput: { date: "260808" } });

      const card = CardService.newCardBuilder().addSection(cardSection).build();
      const cardJson = CardSerializer.toJSON(card);

      const widget = cardJson.sections[0].widgets[0] as any;
      assert.ok(widget.type === "DatePicker" || widget.type === "TextInput");
      assert.equal(widget.fieldName, "date");
    });
  });

  describe("_Shared Tab Contact Lists & Submittal Actions Picklists (Issue #182)", () => {
    it("should resolve Shared_Contacts_Arch from _Shared tab in mock spreadsheet", () => {
      const ss = harness.sheetsService.openById("test-ss-shared");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

      const result = PicklistResolver.resolvePicklistOptionsRange(
        "Shared_Contacts_Arch",
        ss,
        "Submittal_Arch",
        "Submittal Arch"
      );

      assert.equal(result.success, true);
      assert.equal(result.isFallback, false);
      assert.deepEqual(result.options, [
        { value: "INC", label: "INC Architecture and Design" },
        { value: "PMG", label: "Pavarini McGovern" },
        { value: "FXC", label: "FX Collaborative" },
        { value: "IE", label: "Interface Engineering" },
        { value: "VLD", label: "Ventresca Lighting Design" }
      ]);
    });

    it("should resolve Shared_Contacts_FFE from _Shared tab in mock spreadsheet", () => {
      const ss = harness.sheetsService.openById("test-ss-shared-ffe");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

      const result = PicklistResolver.resolvePicklistOptionsRange(
        "Shared_Contacts_FFE",
        ss,
        "Submittal_FFE",
        "Submittal FFE"
      );

      assert.equal(result.success, true);
      assert.equal(result.isFallback, false);
      assert.deepEqual(result.options, [
        { value: "INC", label: "INC Architecture & Design" },
        { value: "BW", label: "Benjamin West" },
        { value: "Lighting", label: "Lighting" },
        { value: "Brand", label: "Brand" }
      ]);
    });

    it("should resolve Actions_Submittal picklist array from _Shared tab in mock spreadsheet", () => {
      const ss = harness.sheetsService.openById("test-ss-actions");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);

      const result = PicklistResolver.resolvePicklistOptionsRange(
        "Actions_Submittal",
        ss,
        "Submittal_Arch",
        "Submittal Arch"
      );

      assert.equal(result.success, true);
      assert.equal(result.isFallback, false);
      assert.deepEqual(result.options, [
        { value: "Received", label: "Received" },
        { value: "Referred", label: "Referred" },
        { value: "Not Reviewed", label: "Not Reviewed" },
        { value: "Rejected", label: "Rejected" },
        { value: "Revise & Resubmit", label: "Revise & Resubmit" },
        { value: "No Objection as Corrected", label: "No Objection as Corrected" },
        { value: "No Exceptions Taken", label: "No Exceptions Taken" }
      ]);
    });
  });



    it("should resolve multi-column 3-column Actions records cleanly", () => {
      const actions2D = [
        [1, "For Approval", "_NET"],
        [2, "Approved as Noted", "_NOC"],
        [3, "Revise and Resubmit", "_R"],
        [4, "Rejected", "_REJ"],
        [5, "For Information Only", "_REF"]
      ];

      const options = PicklistResolver.resolveFrom2DArray(actions2D);
      assert.equal(options.length, 5);
      assert.deepEqual(options[0], { value: "For Approval", label: "For Approval" });
      assert.deepEqual(options[1], { value: "Approved as Noted", label: "Approved as Noted" });
      assert.deepEqual(options[4], { value: "For Information Only", label: "For Information Only" });
    });

    it("should resolve multi-column 3-column Contacts records cleanly", () => {
      const contacts2D = [
        ["Arch", "ARCH", "arch-reviewer@example.com"],
        ["Arch", "ARCH-LEAD", "arch-lead@example.com"],
        ["FFE", "FFE", "ffe-reviewer@example.com"],
        ["FFE", "FFE-LEAD", "ffe-lead@example.com"]
      ];

      const options = PicklistResolver.resolveFrom2DArray(contacts2D);
      assert.equal(options.length, 4);
      assert.deepEqual(options[0], { value: "arch-reviewer@example.com", label: "arch-reviewer@example.com" });
      assert.deepEqual(options[1], { value: "arch-lead@example.com", label: "arch-lead@example.com" });
    });
  });


  describe("Multi-Column Picklist Resolution (Issue #194)", () => {
    it("should resolve multi-column 3-column Actions records cleanly", () => {
      const actions2D = [
        [1, "For Approval", "_NET"],
        [2, "Approved as Noted", "_NOC"],
        [3, "Revise and Resubmit", "_R"],
        [4, "Rejected", "_REJ"],
        [5, "For Information Only", "_REF"]
      ];

      const options = PicklistResolver.resolveFrom2DArray(actions2D);
      assert.equal(options.length, 5);
      assert.deepEqual(options[0], { value: "For Approval", label: "For Approval" });
      assert.deepEqual(options[1], { value: "Approved as Noted", label: "Approved as Noted" });
      assert.deepEqual(options[4], { value: "For Information Only", label: "For Information Only" });
    });

    it("should resolve multi-column 3-column Contacts records cleanly", () => {
      const contacts2D = [
        ["Arch", "ARCH", "arch-reviewer@example.com"],
        ["Arch", "ARCH-LEAD", "arch-lead@example.com"],
        ["FFE", "FFE", "ffe-reviewer@example.com"],
        ["FFE", "FFE-LEAD", "ffe-lead@example.com"]
      ];

      const options = PicklistResolver.resolveFrom2DArray(contacts2D);
      assert.equal(options.length, 4);
      assert.deepEqual(options[0], { value: "arch-reviewer@example.com", label: "arch-reviewer@example.com" });
      assert.deepEqual(options[1], { value: "arch-lead@example.com", label: "arch-lead@example.com" });
    });
  });

