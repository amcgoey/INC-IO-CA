import { describe, it, expect } from "vitest";
import { DocumentTypeWidgetFactory } from "../../../src/core/specs/DocumentTypeWidgetFactory";
import { DocumentTypeSpec } from "../../../src/core/specs/DocumentTypeSpec";

describe("DocumentTypeWidgetFactory (Tier 1 Pure Core)", () => {
  const sampleSpec: DocumentTypeSpec = {
    key: "SUBMITTAL_ARCH",
    name: "Submittal (Architecture)",
    label: "Submittal (Architecture)",
    identity: {
      format: "${section}-${number}-${revision}",
      groupFormat: "${section}-${number}",
      revisionGroupFormat: "${section}"
    },
    fields: [
      { key: "section", label: "Spec Section", type: "string", required: true, description: "6-digit CSI MasterFormat" },
      { key: "number", label: "Submittal Number", type: "string", required: true, description: "3-digit submittal sequence" },
      { key: "revision", label: "Revision", type: "string", required: true, defaultValue: "0" },
      { key: "title", label: "Submittal Title", type: "string", required: true, description: "Descriptive title" },
      { key: "calcFileName", label: "Calculated File Name", type: "string", isCalculated: true, calcFormat: "${section}-${number}" },
      { key: "notes", label: "Notes", type: "multiline", description: "Reviewer remarks" }
    ],
    storage: [
      {
        type: "drive",
        rootFolderSearchTerms: ["Submittals"],
        closedRootFolderName: "Closed"
      }
    ],
    workflows: [
      {
        context: "intake",
        sequence: ["LogSubmittal", "FileDrive"]
      }
    ]
  };

  it("evaluates conditional visibility: returns null when spec is null or undefined", () => {
    const nullResult = DocumentTypeWidgetFactory.buildSectionViewModel(null);
    expect(nullResult).toBeNull();

    const undefinedResult = DocumentTypeWidgetFactory.buildSectionViewModel(undefined);
    expect(undefinedResult).toBeNull();
  });

  it("evaluates conditional visibility: returns null when documentType key is empty", () => {
    const emptySpec: DocumentTypeSpec = {
      ...sampleSpec,
      key: ""
    };
    const result = DocumentTypeWidgetFactory.buildSectionViewModel(emptySpec);
    expect(result).toBeNull();
  });

  it("builds UI section view model with correct header, displayName, and fields", () => {
    const result = DocumentTypeWidgetFactory.buildSectionViewModel(sampleSpec, {
      hydrationContext: {
        formInput: {
          section: "033000",
          number: "001",
          revision: "0",
          title: "Cast-in-Place Concrete"
        }
      }
    });

    expect(result).not.toBeNull();
    expect(result!.visible).toBe(true);
    expect(result!.docTypeKey).toBe("SUBMITTAL_ARCH");
    expect(result!.displayName).toBe("Submittal (Architecture)");
    expect(result!.header).toBe("3. Document Attributes (Submittal (Architecture))");
  });

  it("completely excludes calculated fields (isCalculated === true) from the view model", () => {
    const result = DocumentTypeWidgetFactory.buildSectionViewModel(sampleSpec);
    expect(result).not.toBeNull();

    const fieldKeys = result!.fields.map(f => f.key);
    expect(fieldKeys).toContain("section");
    expect(fieldKeys).toContain("number");
    expect(fieldKeys).toContain("revision");
    expect(fieldKeys).toContain("title");
    expect(fieldKeys).toContain("notes");

    // Calculated field MUST NOT exist in view model
    expect(fieldKeys).not.toContain("calcFileName");
    expect(result!.fields.find(f => f.key === "calcFileName")).toBeUndefined();
  });

  it("applies visual formatting: applies \u26A0\uFE0F and diagnostic hint for low AI confidence (<0.85)", () => {
    const result = DocumentTypeWidgetFactory.buildSectionViewModel(sampleSpec, {
      hydrationContext: {
        formInput: { section: "033000", number: "001", title: "Concrete" }
      },
      validationContext: {
        fieldConfidence: {
          section: 0.60,
          number: 0.95
        }
      }
    });

    expect(result).not.toBeNull();
    const sectionField = result!.fields.find(f => f.key === "section");
    expect(sectionField).toBeDefined();
    expect(sectionField!.displayTitle).toContain("\u26A0\uFE0F");
    expect(sectionField!.displayTitle).toContain("Spec Section");
    expect(sectionField!.hintText).toBe("Low AI confidence (60%) \u2014 please verify");
    expect(sectionField!.isLowConfidence).toBe(true);
    expect(sectionField!.confidence).toBe(0.60);

    const numberField = result!.fields.find(f => f.key === "number");
    expect(numberField).toBeDefined();
    expect(numberField!.displayTitle).not.toContain("\u26A0\uFE0F");
    expect(numberField!.displayTitle).toBe("Submittal Number");
    expect(numberField!.isLowConfidence).toBe(false);
  });

  it("applies visual formatting precedence: \u274C for missing required fields overrides \u26A0\uFE0F for low AI confidence", () => {
    const result = DocumentTypeWidgetFactory.buildSectionViewModel(sampleSpec, {
      hydrationContext: {
        formInput: { section: "", number: "001" }
      },
      validationContext: {
        missingFields: ["section"],
        fieldConfidence: {
          section: 0.50
        }
      }
    });

    expect(result).not.toBeNull();
    const sectionField = result!.fields.find(f => f.key === "section");
    expect(sectionField).toBeDefined();
    // \u274C MUST override \u26A0\uFE0F
    expect(sectionField!.displayTitle).toBe("\u274C Spec Section");
    expect(sectionField!.displayTitle).not.toContain("\u26A0\uFE0F");
    expect(sectionField!.isMissing).toBe(true);
  });

  it("hydrates dropdowns for contact and action fields with fallback values", () => {
    const specWithContactAction: DocumentTypeSpec = {
      ...sampleSpec,
      fields: [
        { key: "contact", label: "Contact", type: "enum", required: true },
        { key: "action", label: "Action", type: "enum", required: true },
        { key: "incomingRouting", label: "Routing", type: "enum" }
      ]
    };

    const result = DocumentTypeWidgetFactory.buildSectionViewModel(specWithContactAction, {
      hydrationContext: {
        formInput: {
          contact: "STR",
          action: "Received",
          incomingRouting: "To Refer"
        },
        logSettings: {
          contacts: [
            { abbr: "ARCH", name: "Architect" },
            { abbr: "STR", name: "Structural Engineer" }
          ],
          actions: [
            { action: "Received", abbr: "REC", status: "Incoming" },
            { action: "Reviewed", abbr: "REV", status: "Outgoing" }
          ]
        }
      }
    });

    expect(result).not.toBeNull();
    const contactField = result!.fields.find(f => f.key === "contact");
    expect(contactField).toBeDefined();
    expect(contactField!.type).toBe("dropdown");
    expect(contactField!.options?.length).toBe(2);
    expect(contactField!.options?.find(o => o.value === "STR")?.isSelected).toBe(true);

    const actionField = result!.fields.find(f => f.key === "action");
    expect(actionField).toBeDefined();
    expect(actionField!.type).toBe("dropdown");
    expect(actionField!.options?.find(o => o.value === "Received")?.isSelected).toBe(true);

    const routingField = result!.fields.find(f => f.key === "incomingRouting");
    expect(routingField).toBeDefined();
    expect(routingField!.type).toBe("dropdown");
    expect(routingField!.options?.find(o => o.value === "To Refer")?.isSelected).toBe(true);
  });

  it("omits incomingRouting field when action is not Received/Incoming", () => {
    const specWithRouting: DocumentTypeSpec = {
      ...sampleSpec,
      fields: [
        { key: "action", label: "Action", type: "enum", required: true },
        { key: "incomingRouting", label: "Routing", type: "enum" }
      ]
    };

    const result = DocumentTypeWidgetFactory.buildSectionViewModel(specWithRouting, {
      hydrationContext: {
        formInput: {
          action: "Reviewed"
        }
      }
    });

    expect(result).not.toBeNull();
    const routingField = result!.fields.find(f => f.key === "incomingRouting");
    expect(routingField).toBeUndefined();
  });

  it("hydrates FF&E specTag, specTitle, and vendor with suggestions and tagMap", () => {
    const ffeSpec: DocumentTypeSpec = {
      key: "SUBMITTAL_FFE",
      name: "Submittal (FF&E)",
      label: "Submittal (FF&E)",
      identity: {
        format: "${specTag}-${revision}",
        groupFormat: "${specTag}",
        revisionGroupFormat: "${specTag}"
      },
      fields: [
        { key: "specTag", label: "Spec Tag", type: "string", required: true },
        { key: "specTitle", label: "Spec Title", type: "string" },
        { key: "vendor", label: "Vendor", type: "string" },
        { key: "relatedTag", label: "Related Tags", type: "string" }
      ],
      storage: [{ type: "drive", rootFolderSearchTerms: ["FFE"], closedRootFolderName: "Closed" }],
      workflows: [{ context: "intake", sequence: ["LogFfe", "FileDrive"] }]
    };

    const result = DocumentTypeWidgetFactory.buildSectionViewModel(ffeSpec, {
      hydrationContext: {
        formInput: {
          specTag: "CH-01"
        },
        logSettings: {
          ffeTags: {
            tags: ["CH-01", "TB-02"],
            vendors: ["Acme Seating", "Global Tables"],
            tagMap: {
              "CH-01": "Lounge Chair"
            }
          }
        }
      }
    });

    expect(result).not.toBeNull();
    const specTagField = result!.fields.find(f => f.key === "specTag");
    expect(specTagField).toBeDefined();
    expect(specTagField!.suggestions).toEqual(["CH-01", "TB-02"]);

    const specTitleField = result!.fields.find(f => f.key === "specTitle");
    expect(specTitleField).toBeDefined();
    expect(specTitleField!.value).toBe("Lounge Chair");

    const vendorField = result!.fields.find(f => f.key === "vendor");
    expect(vendorField).toBeDefined();
    expect(vendorField!.suggestions).toEqual(["Acme Seating", "Global Tables"]);

    const relatedTagField = result!.fields.find(f => f.key === "relatedTag");
    expect(relatedTagField).toBeDefined();
    expect(relatedTagField!.type).toBe("multi_select");
  });
});
