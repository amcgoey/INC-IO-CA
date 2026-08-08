import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GasMockHarness } from "./harness/GasMockHarness";

const { DOCUMENT_LOG_WORKBOOK_SPEC } = require("../src/core/config/DocumentLogWorkbookSpec");
const { PicklistResolver } = require("../src/core/config/PicklistResolver");
const templateJson = require("./fixtures/document-log-workbook-template.json");

describe("Canonical Reference Seed Data for Contacts, Actions and Project Settings (Issue #200)", () => {
  let harness: GasMockHarness;

  beforeEach(() => {
    harness = GasMockHarness.install();
  });

  describe("DOCUMENT_LOG_WORKBOOK_SPEC seed rows and named ranges", () => {
    it("should include canonical Shared_Contacts_Arch seed data in _Shared tab", () => {
      const sharedTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: any) => t.name === "_Shared");
      assert.ok(sharedTab, "_Shared tab must exist in spec");

      const contactsArchRange = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((r: any) => r.name === "Shared_Contacts_Arch");
      assert.ok(contactsArchRange, "Shared_Contacts_Arch named range must exist");
      assert.equal(contactsArchRange.tabName, "_Shared");
      assert.equal(contactsArchRange.rangeNotation, "A2:B6");

      const seedRows = sharedTab.seedRows || [];
      const archContacts = seedRows.slice(1, 6).map((r: any) => [r[0], r[1]]);
      assert.deepEqual(archContacts, [
        ["INC", "INC Architecture and Design"],
        ["PMG", "Pavarini McGovern"],
        ["FXC", "FX Collaborative"],
        ["IE", "Interface Engineering"],
        ["VLD", "Ventresca Lighting Design"]
      ]);
    });

    it("should include canonical Shared_Contacts_FFE seed data in _Shared tab", () => {
      const contactsFfeRange = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((r: any) => r.name === "Shared_Contacts_FFE");
      assert.ok(contactsFfeRange, "Shared_Contacts_FFE named range must exist");
      assert.equal(contactsFfeRange.tabName, "_Shared");
      assert.equal(contactsFfeRange.rangeNotation, "C2:D5");

      const sharedTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: any) => t.name === "_Shared");
      const seedRows = sharedTab.seedRows || [];
      const ffeContacts = seedRows.slice(1, 5).map((r: any) => [r[2], r[3]]);
      assert.deepEqual(ffeContacts, [
        ["INC", "INC Architecture & Design"],
        ["BW", "Benjamin West"],
        ["Lighting", "Lighting"],
        ["Brand", "Brand"]
      ]);
    });

    it("should include canonical Actions_Submittal seed data matching Order 1-7", () => {
      const actionsRange = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((r: any) => r.name === "Actions_Submittal");
      assert.ok(actionsRange, "Actions_Submittal named range must exist");
      assert.equal(actionsRange.tabName, "_Shared");
      assert.equal(actionsRange.rangeNotation, "E2:F8");

      const sharedTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: any) => t.name === "_Shared");
      const seedRows = sharedTab.seedRows || [];
      const actions = seedRows.slice(1, 8).map((r: any) => [r[4], r[5]]);
      assert.deepEqual(actions, [
        ["Received", "Received"],
        ["Referred", "_REF"],
        ["Not Reviewed", "_NR"],
        ["Rejected", "_REJ"],
        ["Revise & Resubmit", "_RR"],
        ["No Objection as Corrected", "_NOC"],
        ["No Exceptions Taken", "_NET"]
      ]);
    });

    it("should include Contact Chain Max (-5) and Project Abbreviation (INC) in _Config and _Shared", () => {
      const configTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: any) => t.name === "_Config");
      assert.ok(configTab, "_Config tab must exist");

      const keyValues = new Map(configTab.seedRows as [string, string][]);
      assert.equal(keyValues.get("PROJECT_ABBREVIATION"), "INC");
      assert.equal(keyValues.get("CONTACT_CHAIN_MAX"), "-5");
    });

    it("should include canonical Vendors and SpecTags in Submittal FFE Support tab", () => {
      const ffeSupportTab = DOCUMENT_LOG_WORKBOOK_SPEC.tabs.find((t: any) => t.name === "Submittal FFE Support");
      assert.ok(ffeSupportTab, "Submittal FFE Support tab must exist");

      const vendorsRange = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((r: any) => r.name === "Vendors");
      assert.ok(vendorsRange, "Vendors named range must exist");
      assert.equal(vendorsRange.rangeNotation, "A2:B8");

      const specTagsRange = DOCUMENT_LOG_WORKBOOK_SPEC.namedRanges.find((r: any) => r.name === "SpecTags");
      assert.ok(specTagsRange, "SpecTags named range must exist");
      assert.equal(specTagsRange.rangeNotation, "C2:D7");

      const seedRows = ffeSupportTab.seedRows || [];
      const vendors = seedRows.slice(1, 8).map((r: any) => [r[0], r[1]]);
      assert.deepEqual(vendors, [
        ["BERMAN FALK", "Berman Falk"],
        ["ASHLEY", "Ashley Lighting"],
        ["CARNEGIE", "Carnegie"],
        ["DELTA", "Delta"],
        ["FIL DOUX", "Fil Doux Textiles"],
        ["LIGHT ANNEX", "Light Annex"],
        ["MOHAWK", "Mohawk"]
      ]);

      const specTags = seedRows.slice(1, 7).map((r: any) => [r[2], r[3]]);
      assert.deepEqual(specTags, [
        ["AC102", "HOOK"],
        ["CG104", "BED - KING"],
        ["CG126", "BED - DOUBLE QUEEN"],
        ["CG138", "CREDENZA"],
        ["CG138M", "CREDENZA - MIRRORED"],
        ["CP112", "CARPET - CORRIDOR"]
      ]);
    });
  });

  describe("document-log-workbook-template.json fixture alignment", () => {
    it("should match DOCUMENT_LOG_WORKBOOK_SPEC tab seed rows and named ranges", () => {
      assert.equal(templateJson.schemaVersion, DOCUMENT_LOG_WORKBOOK_SPEC.schemaVersion);

      const sharedTabJson = templateJson.tabs.find((t: any) => t.name === "_Shared");
      assert.ok(sharedTabJson);

      const ffeSupportJson = templateJson.tabs.find((t: any) => t.name === "Submittal FFE Support");
      assert.ok(ffeSupportJson);

      const actionsNr = templateJson.namedRanges.find((r: any) => r.name === "Actions_Submittal");
      assert.ok(actionsNr);
      assert.equal(actionsNr.rangeNotation, "E2:F8");
    });
  });

  describe("PicklistResolver runtime resolution against GasMockHarness", () => {
    it("should resolve Shared_Contacts_Arch options via PicklistResolver", () => {
      const ss = harness.sheetsService.openById("test-ss-canonical");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);
      const res = PicklistResolver.resolvePicklistOptionsRange("Shared_Contacts_Arch", ss, "Submittal_Arch", "Submittal Arch");

      assert.equal(res.success, true);
      assert.equal(res.options.length, 5);
      assert.deepEqual(res.options[0], { value: "INC", label: "INC Architecture and Design" });
    });

    it("should resolve Shared_Contacts_FFE options via PicklistResolver", () => {
      const ss = harness.sheetsService.openById("test-ss-canonical");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);
      const res = PicklistResolver.resolvePicklistOptionsRange("Shared_Contacts_FFE", ss, "Submittal_FFE", "Submittal FFE");

      assert.equal(res.success, true);
      assert.equal(res.options.length, 4);
      assert.deepEqual(res.options[0], { value: "INC", label: "INC Architecture & Design" });
    });

    it("should resolve Actions_Submittal options via PicklistResolver", () => {
      const ss = harness.sheetsService.openById("test-ss-canonical");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);
      const res = PicklistResolver.resolvePicklistOptionsRange("Actions_Submittal", ss, "Submittal_Arch", "Submittal Arch");

      assert.equal(res.success, true);
      assert.equal(res.options.length, 7);
      assert.deepEqual(res.options[0], { value: "Received", label: "Received" });
      assert.deepEqual(res.options[6], { value: "No Exceptions Taken", label: "_NET" });
    });

    it("should resolve Vendors and SpecTags options via PicklistResolver", () => {
      const ss = harness.sheetsService.openById("test-ss-canonical");
      ss.loadWorkbookSpec(DOCUMENT_LOG_WORKBOOK_SPEC);
      const resVendors = PicklistResolver.resolvePicklistOptionsRange("Vendors", ss, "Submittal_FFE", "Submittal FFE");
      assert.equal(resVendors.success, true);
      assert.equal(resVendors.options.length, 7);
      assert.deepEqual(resVendors.options[0], { value: "BERMAN FALK", label: "Berman Falk" });

      const resSpecTags = PicklistResolver.resolvePicklistOptionsRange("SpecTags", ss, "Submittal_FFE", "Submittal FFE");
      assert.equal(resSpecTags.success, true);
      assert.equal(resSpecTags.options.length, 6);
      assert.deepEqual(resSpecTags.options[0], { value: "AC102", label: "HOOK" });
    });
  });
});
