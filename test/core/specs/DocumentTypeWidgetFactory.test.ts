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
        {
          key: "contact",
          label: "Contact",
          type: "enum",
          required: true,
          picklistSource: {
            supportDataKey: "Contacts",
            valueColumnKey: "abbr",
            displayColumnKey: "name"
          }
        },
        {
          key: "action",
          label: "Action",
          type: "enum",
          required: true,
          picklistSource: {
            supportDataKey: "Actions",
            valueColumnKey: "action",
            displayColumnKey: "action"
          }
        },
        {
          key: "incomingRouting",
          label: "Routing",
          type: "enum",
          options: [
            { label: "To Review", value: "To Review" },
            { label: "To Refer", value: "To Refer" }
          ]
        }
      ],
      supportData: {
        Contacts: {
          key: "Contacts",
          columns: [{ key: "abbr", type: "string" }, { key: "name", type: "string" }],
          items: [
            { abbr: "ARCH", name: "Architect" },
            { abbr: "STR", name: "Structural Engineer" }
          ]
        },
        Actions: {
          key: "Actions",
          columns: [{ key: "action", type: "string" }],
          items: [
            { action: "Received" },
            { action: "Reviewed" }
          ]
        }
      }
    };

    const result = DocumentTypeWidgetFactory.buildSectionViewModel(specWithContactAction, {
      hydrationContext: {
        formInput: {
          contact: "STR",
          action: "Received",
          incomingRouting: "To Refer"
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

  it("hydrates FF&E specTag, specTitle, and vendor with suggestions", () => {
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
        {
          key: "specTag",
          label: "Spec Tag",
          type: "string",
          required: true,
          picklistSource: {
            supportDataKey: "SpecTags",
            valueColumnKey: "tag",
            displayColumnKey: "tag"
          }
        },
        { key: "specTitle", label: "Spec Title", type: "string" },
        {
          key: "vendor",
          label: "Vendor",
          type: "string",
          picklistSource: {
            supportDataKey: "Vendors",
            valueColumnKey: "name",
            displayColumnKey: "name"
          }
        },
        {
          key: "relatedTag",
          label: "Related Tags",
          type: "multi_select",
          picklistSource: {
            supportDataKey: "SpecTags",
            valueColumnKey: "tag",
            displayColumnKey: "tag"
          }
        }
      ],
      supportData: {
        SpecTags: {
          key: "SpecTags",
          columns: [{ key: "tag", type: "string" }],
          items: [{ tag: "CH-01" }, { tag: "TB-02" }]
        },
        Vendors: {
          key: "Vendors",
          columns: [{ key: "name", type: "string" }],
          items: [{ name: "Acme Seating" }, { name: "Global Tables" }]
        }
      },
      storage: [{ type: "drive", rootFolderSearchTerms: ["FFE"], closedRootFolderName: "Closed" }],
      workflows: [{ context: "intake", sequence: ["LogFfe", "FileDrive"] }]
    };

    const result = DocumentTypeWidgetFactory.buildSectionViewModel(ffeSpec, {
      hydrationContext: {
        formInput: {
          specTag: "CH-01",
          specTitle: "Lounge Chair"
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

  describe("Generic Picklist Resolution & Fallbacks in View Model (Issue #288)", () => {
    const specWithPicklistSources: DocumentTypeSpec = {
      key: "SUBMITTAL_CUSTOM",
      name: "Submittal Custom",
      label: "Submittal Custom",
      identity: {
        format: "${code}-${revision}",
        groupFormat: "${code}",
        revisionGroupFormat: "${code}"
      },
      fields: [
        {
          key: "category",
          label: "Category",
          type: "enum",
          required: true,
          picklistSource: {
            supportDataKey: "Categories",
            valueColumnKey: "code",
            displayColumnKey: "label"
          }
        },
        {
          key: "subCategory",
          label: "Sub Category",
          type: "list",
          picklistSource: {
            supportDataKey: "SubCategories",
            valueColumnKey: "id",
            displayColumnKey: "title"
          }
        }
      ],
      storage: [{ type: "drive", rootFolderSearchTerms: ["Custom"], closedRootFolderName: "Closed" }],
      workflows: [{ context: "intake", sequence: ["LogCustom", "FileDrive"] }],
      supportData: {
        Categories: {
          key: "Categories",
          columns: [
            { key: "code", type: "string", isPrimaryKey: true },
            { key: "label", type: "string", isDisplayLabel: true }
          ],
          items: [
            { code: "ELEC", label: "Electrical" },
            { code: "PLUMB", label: "Plumbing" }
          ]
        },
        SubCategories: {
          key: "SubCategories",
          columns: [
            { key: "id", type: "string", isPrimaryKey: true },
            { key: "title", type: "string", isDisplayLabel: true }
          ],
          items: [
            { id: "HVAC_DUCT", title: "Ductwork" },
            { id: "HVAC_UNIT", title: "Air Handler" }
          ]
        }
      }
    };

    it("generically populates dropdown options from supportData based on picklistSource", () => {
      const result = DocumentTypeWidgetFactory.buildSectionViewModel(specWithPicklistSources, {
        hydrationContext: {
          formInput: {
            category: "PLUMB"
          }
        }
      });

      expect(result).not.toBeNull();
      const categoryField = result!.fields.find(f => f.key === "category");
      expect(categoryField).toBeDefined();
      expect(categoryField!.type).toBe("dropdown");
      expect(categoryField!.options).toHaveLength(2);
      expect(categoryField!.options![0]).toEqual({
        value: "ELEC",
        label: "Electrical",
        isSelected: false
      });
      expect(categoryField!.options![1]).toEqual({
        value: "PLUMB",
        label: "Plumbing",
        isSelected: true
      });
    });

    it("dynamically appends unlisted draftValue as fallback option and sets isSelected to true", () => {
      const result = DocumentTypeWidgetFactory.buildSectionViewModel(specWithPicklistSources, {
        hydrationContext: {
          formInput: {
            category: "SOLAR_PV" // Unlisted in supportData
          }
        }
      });

      expect(result).not.toBeNull();
      const categoryField = result!.fields.find(f => f.key === "category");
      expect(categoryField).toBeDefined();
      expect(categoryField!.type).toBe("dropdown");
      // 2 spec options + 1 fallback option
      expect(categoryField!.options).toHaveLength(3);
      const fallbackOption = categoryField!.options!.find(o => o.value === "SOLAR_PV");
      expect(fallbackOption).toBeDefined();
      expect(fallbackOption).toEqual({
        value: "SOLAR_PV",
        label: "SOLAR_PV",
        isSelected: true
      });
    });

    it("correctly handles multi_select draft values without duplicating compound strings or falsely matching substrings", () => {
      const multiSelectSpec: DocumentTypeSpec = {
        key: "SUBMITTAL_MULTI",
        name: "Submittal Multi",
        label: "Submittal Multi",
        identity: {
          format: "${tags}",
          groupFormat: "${tags}",
          revisionGroupFormat: "${tags}"
        },
        fields: [
          {
            key: "tags",
            label: "Tags",
            type: "multi_select",
            picklistSource: {
              supportDataKey: "Tags",
              valueColumnKey: "code",
              displayColumnKey: "name"
            }
          }
        ],
        storage: [{ type: "drive", rootFolderSearchTerms: ["Multi"], closedRootFolderName: "Closed" }],
        workflows: [{ context: "intake", sequence: ["LogMulti"] }],
        supportData: {
          Tags: {
            key: "Tags",
            columns: [
              { key: "code", type: "string", isPrimaryKey: true },
              { key: "name", type: "string", isDisplayLabel: true }
            ],
            items: [
              { code: "MAC", name: "Machinery" },
              { code: "C", name: "Concrete" },
              { code: "ELEC", name: "Electrical" }
            ]
          }
        }
      };

      // Substring match check: "MAC" is selected, "C" should NOT be selected even though "C" is a substring of "MAC"
      const result1 = DocumentTypeWidgetFactory.buildSectionViewModel(multiSelectSpec, {
        hydrationContext: {
          formInput: {
            tags: "MAC"
          }
        }
      });

      expect(result1).not.toBeNull();
      const tagsField1 = result1!.fields.find(f => f.key === "tags");
      expect(tagsField1).toBeDefined();
      expect(tagsField1!.widgetType).toBe("multi_select");
      expect(tagsField1!.options).toHaveLength(3);
      expect(tagsField1!.options!.find(o => o.value === "MAC")?.isSelected).toBe(true);
      expect(tagsField1!.options!.find(o => o.value === "C")?.isSelected).toBe(false);
      expect(tagsField1!.options!.find(o => o.value === "ELEC")?.isSelected).toBe(false);

      // Compound string draft value with known and unknown options: "MAC, CUSTOM_TAG"
      const result2 = DocumentTypeWidgetFactory.buildSectionViewModel(multiSelectSpec, {
        hydrationContext: {
          formInput: {
            tags: "MAC, CUSTOM_TAG"
          }
        }
      });

      expect(result2).not.toBeNull();
      const tagsField2 = result2!.fields.find(f => f.key === "tags");
      expect(tagsField2).toBeDefined();
      // Should have 3 spec options + 1 fallback option ("CUSTOM_TAG"), NOT "MAC, CUSTOM_TAG" as a single option
      expect(tagsField2!.options).toHaveLength(4);
      expect(tagsField2!.options!.find(o => o.value === "MAC")?.isSelected).toBe(true);
      expect(tagsField2!.options!.find(o => o.value === "CUSTOM_TAG")?.isSelected).toBe(true);
      expect(tagsField2!.options!.find(o => o.value === "C")?.isSelected).toBe(false);
      expect(tagsField2!.options!.find(o => o.value === "MAC, CUSTOM_TAG")).toBeUndefined();
    });

    it("populates explicit widgetType on all widget view models", () => {
      const allTypesSpec: DocumentTypeSpec = {
        key: "ALL_TYPES",
        name: "All Types",
        label: "All Types",
        identity: { format: "${f1}", groupFormat: "${f1}", revisionGroupFormat: "${f1}" },
        fields: [
          { key: "fText", label: "Text", type: "string" },
          { key: "fMultiLine", label: "MultiLine", type: "multiline" },
          { key: "fEnum", label: "Enum", type: "enum", options: [{ value: "A", label: "A" }] },
          { key: "fMultiSelect", label: "MultiSelect", type: "multi_select", options: [{ value: "B", label: "B" }] },
          { key: "fDate", label: "Date", type: "date" }
        ],
        storage: [{ type: "drive", rootFolderSearchTerms: ["All"], closedRootFolderName: "Closed" }],
        workflows: [{ context: "intake", sequence: ["LogAll"] }]
      };

      const result = DocumentTypeWidgetFactory.buildSectionViewModel(allTypesSpec, {
        hydrationContext: {
          formInput: {
            fDate: "260815"
          }
        }
      });

      expect(result).not.toBeNull();
      const fields = result!.fields;
      expect(fields.find(f => f.key === "fText")?.widgetType).toBe("text");
      expect(fields.find(f => f.key === "fMultiLine")?.widgetType).toBe("multiline");
      expect(fields.find(f => f.key === "fEnum")?.widgetType).toBe("dropdown");
      expect(fields.find(f => f.key === "fMultiSelect")?.widgetType).toBe("multi_select");
      const dateField = fields.find(f => f.key === "fDate");
      expect(dateField?.widgetType).toBe("date_picker");
      expect(dateField?.epochMs).toBeDefined();
      expect(typeof dateField?.epochMs).toBe("number");
    });
  });
});
