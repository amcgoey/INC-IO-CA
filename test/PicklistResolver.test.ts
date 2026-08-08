import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness } from "./harness/GasMockHarness";
import { CardSerializer } from "./harness/CardSerializer";

// Load modules
require("../src/DocumentTypeConfigRegistry");
const { PicklistResolver } = require("../src/core/config/PicklistResolver");
const { renderDynamicFormFields } = require("../src/adapters/gas/UI");

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

    it("should defensively handle missing or deleted support tabs and fall back to JSON options", () => {
      const ss = harness.sheetsService.openById("test-ss-missing");

      const result = PicklistResolver.resolvePicklistOptionsRange(
        "'Missing Tab'!NonExistentRange",
        ss,
        "Submittal_FFE",
        "Submittal FFE"
      );

      assert.equal(result.success, false);
      assert.equal(result.isFallback, true);
      assert.ok(result.warningBanner.includes("missing or invalid"));
      assert.ok(Array.isArray(result.options));
      assert.ok(result.options.length > 0);
    });

    it("should retry bare range names with active sheet prefix if direct lookup fails", () => {
      const ss = harness.sheetsService.openById("test-ss-bare");
      const activeSheet = ss.insertSheet("Submittal FFE");
      activeSheet.setGrid([
        ["Tag", "Label"],
        ["CH-01", "Chair"],
        ["TBL-01", "Table"]
      ]);
      ss.setNamedRange("'Submittal FFE'!SpecTags", "Submittal FFE", "A2:B3");

      const result = PicklistResolver.resolvePicklistOptionsRange(
        "SpecTags",
        ss,
        "Submittal_FFE",
        "Submittal FFE"
      );

      assert.equal(result.success, true);
      assert.deepEqual(result.options, [
        { value: "CH-01", label: "Chair" },
        { value: "TBL-01", label: "Table" }
      ]);
    });
  });

  describe("PicklistResolver.normalizePicklistValue", () => {
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
});
