/**
 * @file DocumentTypeWidgetFactory.ts
 * @description Tier 1 Pure Core View Model Factory building UI widget abstractions from DocumentTypeSpec.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

import { DocumentFieldSpec, DocumentTypeSpec } from "./DocumentTypeSpec";
import { PicklistResolver, PicklistOption } from "../config/PicklistResolver";

export type WidgetInputType =
  | "text"
  | "multiline"
  | "dropdown"
  | "multi_select"
  | "date"
  | "date_picker";

export interface WidgetOptionViewModel {
  value: string;
  label: string;
  isSelected?: boolean;
}

export interface DocumentWidgetViewModel {
  key: string;
  type: WidgetInputType;
  displayTitle: string;
  hintText: string;
  value: any;
  required: boolean;
  options?: WidgetOptionViewModel[];
  suggestions?: string[];
  epochMs?: number;
  isLowConfidence?: boolean;
  isMissing?: boolean;
  confidence?: number;
  onStateActionName?: string;
  actionParams?: Record<string, string>;
}

export interface DocumentSectionViewModel {
  header: string;
  docTypeKey: string;
  displayName: string;
  fields: DocumentWidgetViewModel[];
  visible: boolean;
}

export interface WidgetFactoryOptions {
  hydrationContext?: {
    formInput?: Record<string, any>;
    state?: Record<string, any>;
    userCacheDraft?: Record<string, any>;
    parserResult?: Record<string, any>;
    aiMetadata?: Record<string, any>;
    logSettings?: Record<string, any>;
    spreadsheet?: any;
    docTypeKey?: string;
    activeSheetName?: string;
    [key: string]: any;
  };
  validationContext?: {
    missingFields?: string[];
    fieldConfidence?: Record<string, number>;
    onStateActionName?: string;
    actionParams?: Record<string, string>;
    [key: string]: any;
  };
  confidenceThreshold?: number;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

const DEFAULT_CONTACTS = [
  { abbr: "ARCH", name: "Architect" },
  { abbr: "GC", name: "General Contractor" },
  { abbr: "CLIENT", name: "Client" },
  { abbr: "MEP", name: "MEP Engineer" },
  { abbr: "STR", name: "Structural Engineer" }
];

const DEFAULT_ACTIONS = [
  { action: "Received", abbr: "REC", status: "Incoming" },
  { action: "Reviewed", abbr: "REV", status: "Outgoing" },
  { action: "Referred", abbr: "REF", status: "Outgoing" },
  { action: "Rejected", abbr: "REJ", status: "Outgoing" }
];

export class DocumentTypeWidgetFactory {
  /**
   * Builds an abstract UI section view model from a DocumentTypeSpec.
   *
   * @param spec - Declarative document type specification.
   * @param options - Hydration context and validation parameters.
   * @returns Abstract section view model, or null if no document type is selected.
   */
  public static buildSectionViewModel(
    spec: DocumentTypeSpec | null | undefined,
    options?: WidgetFactoryOptions
  ): DocumentSectionViewModel | null {
    if (!spec || !spec.key) {
      return null;
    }

    const hydration = options?.hydrationContext || {};
    const validation = options?.validationContext || {};
    const threshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

    const missingFields = validation.missingFields || [];
    const fieldConfidence = validation.fieldConfidence || {};
    const onStateActionName = validation.onStateActionName || "onStateChange";
    const actionParams = validation.actionParams || {};

    const displayName = spec.label || spec.name || spec.key;
    const header = `3. Document Attributes (${displayName})`;

    const widgetViewModels: DocumentWidgetViewModel[] = [];

    const fields = spec.fields || [];
    for (const field of fields) {
      // Rule: Exclude calculated fields completely from UI view model
      if (field.isCalculated === true) {
        continue;
      }

      const widgetVm = this.buildFieldViewModel(
        field,
        hydration,
        missingFields,
        fieldConfidence,
        threshold,
        onStateActionName,
        actionParams
      );

      if (widgetVm) {
        widgetViewModels.push(widgetVm);
      }
    }

    return {
      header,
      docTypeKey: spec.key,
      displayName,
      fields: widgetViewModels,
      visible: true
    };
  }

  /**
   * Resolves the hydrated value of a field across the cascading state context.
   */
  private static resolveHydratedValue(
    field: DocumentFieldSpec,
    hydration: Record<string, any>
  ): any {
    const formInput = hydration.formInput || {};
    const state = hydration.state || {};
    const userCacheDraft = hydration.userCacheDraft || {};
    const parserResult = hydration.parserResult || {};
    const aiMetadata = hydration.aiMetadata || {};

    const val =
      formInput[field.key] ??
      state[field.key] ??
      userCacheDraft[field.key] ??
      parserResult[field.key] ??
      aiMetadata[field.key] ??
      field.defaultValue ??
      "";

    return val;
  }

  /**
   * Formats the display title and diagnostic hint text applying formatting precedence:
   * Missing required fields (?) take precedence over low AI confidence (??).
   */
  public static formatFieldTitleAndHint(
    field: DocumentFieldSpec,
    missingFields: string[] = [],
    fieldConfidence: Record<string, number> = {},
    threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
  ): { displayTitle: string; hintText: string; isMissing: boolean; isLowConfidence: boolean; confidence?: number } {
    const isMissing = Boolean(field.required && missingFields.includes(field.key));
    const confidence = fieldConfidence[field.key];
    const isLowConfidence = confidence !== undefined && confidence < threshold;

    let displayTitle = field.label || field.key;
    if (isMissing) {
      displayTitle = "\u274C " + displayTitle;
    } else if (isLowConfidence) {
      displayTitle = "\u26A0\uFE0F " + displayTitle;
    }

    let hintText = field.description || "";
    if (isLowConfidence && !isMissing) {
      const pct = Math.round(confidence * 100);
      hintText = `Low AI confidence (${pct}%) \u2014 please verify`;
    }

    return {
      displayTitle,
      hintText,
      isMissing,
      isLowConfidence,
      confidence
    };
  }

  /**
   * Builds an individual DocumentWidgetViewModel for a field specification.
   */
  private static buildFieldViewModel(
    field: DocumentFieldSpec,
    hydration: Record<string, any>,
    missingFields: string[],
    fieldConfidence: Record<string, number>,
    threshold: number,
    onStateActionName: string,
    actionParams: Record<string, string>
  ): DocumentWidgetViewModel | null {
    const hydratedValue = this.resolveHydratedValue(field, hydration);
    const { displayTitle, hintText, isMissing, isLowConfidence, confidence } =
      this.formatFieldTitleAndHint(field, missingFields, fieldConfidence, threshold);

    const logSettings = hydration.logSettings || {};

    // Special Field Handling for Contact
    if (field.key === "contact") {
      const contactsList =
        logSettings.contacts && logSettings.contacts.length > 0
          ? logSettings.contacts
          : DEFAULT_CONTACTS;

      let selectedFound = false;
      const options: WidgetOptionViewModel[] = contactsList.map((c: any) => {
        const isSelected = String(hydratedValue) === String(c.abbr);
        if (isSelected) selectedFound = true;
        return {
          label: `${c.abbr} - ${c.name}`,
          value: c.abbr,
          isSelected
        };
      });

      if (hydratedValue && !selectedFound) {
        options.push({
          label: String(hydratedValue),
          value: String(hydratedValue),
          isSelected: true
        });
      }

      return {
        key: "contact",
        type: "dropdown",
        displayTitle,
        hintText,
        value: hydratedValue,
        required: Boolean(field.required),
        options,
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Special Field Handling for Action
    if (field.key === "action") {
      const actionsList =
        logSettings.actions && logSettings.actions.length > 0
          ? logSettings.actions
          : DEFAULT_ACTIONS;

      let selectedFound = false;
      const options: WidgetOptionViewModel[] = [
        { label: "", value: "", isSelected: !hydratedValue }
      ];

      actionsList.forEach((a: any) => {
        const isSelected = String(hydratedValue) === String(a.action);
        if (isSelected) selectedFound = true;
        options.push({
          label: a.action,
          value: a.action,
          isSelected
        });
      });

      if (hydratedValue && !selectedFound) {
        options.push({
          label: String(hydratedValue),
          value: String(hydratedValue),
          isSelected: true
        });
      }

      return {
        key: "action",
        type: "dropdown",
        displayTitle,
        hintText,
        value: hydratedValue,
        required: Boolean(field.required),
        options,
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Special Field Handling for Incoming Routing
    if (field.key === "incomingRouting") {
      const currentAction =
        hydration.formInput?.action ||
        hydration.state?.action ||
        hydration.userCacheDraft?.action ||
        hydration.parserResult?.action ||
        hydration.aiMetadata?.action ||
        "";

      const actionsList =
        logSettings.actions && logSettings.actions.length > 0
          ? logSettings.actions
          : [{ action: "Received", abbr: "REC", status: "Incoming" }];

      const isIncomingAction =
        currentAction === "Received" ||
        actionsList.some(
          (a: any) =>
            (a.action === currentAction || a.abbr === currentAction) &&
            a.action === "Received"
        );

      if (!isIncomingAction) {
        return null; // Omit incomingRouting when action is not Incoming/Received
      }

      const isRefer = String(hydratedValue) === "To Refer";
      const options: WidgetOptionViewModel[] = [
        { label: "To Review", value: "To Review", isSelected: !isRefer },
        { label: "To Refer", value: "To Refer", isSelected: isRefer }
      ];

      return {
        key: "incomingRouting",
        type: "dropdown",
        displayTitle,
        hintText,
        value: hydratedValue || "To Review",
        required: Boolean(field.required),
        options,
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Special Field Handling for Date
    if (field.key === "date") {
      return {
        key: "date",
        type: "date",
        displayTitle: displayTitle || "Date",
        hintText: hintText || "Date (YYMMDD)",
        value: hydratedValue,
        required: Boolean(field.required),
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Special Field Handling for FF&E Spec Tag
    if (
      field.key === "specTag" &&
      field.type !== "list" &&
      field.type !== "enum" &&
      (!field.options || field.options.length === 0)
    ) {
      const ffeTags =
        logSettings.ffeTags && logSettings.ffeTags.tags ? logSettings.ffeTags.tags : [];

      return {
        key: "specTag",
        type: "text",
        displayTitle,
        hintText,
        value: hydratedValue,
        required: Boolean(field.required),
        suggestions: ffeTags.length > 0 ? ffeTags : undefined,
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName: "onSpecTagChange",
        actionParams
      };
    }

    // Special Field Handling for FF&E Related Tags
    if (
      field.key === "relatedTag" &&
      field.type !== "list" &&
      field.type !== "enum" &&
      (!field.options || field.options.length === 0)
    ) {
      const ffeTags =
        logSettings.ffeTags && logSettings.ffeTags.tags ? logSettings.ffeTags.tags : [];

      if (ffeTags.length > 0) {
        const selectedStr = String(hydratedValue || "");
        const options: WidgetOptionViewModel[] = ffeTags.map((tag: string) => ({
          label: tag,
          value: tag,
          isSelected: selectedStr.includes(tag)
        }));

        return {
          key: "relatedTag",
          type: "multi_select",
          displayTitle,
          hintText,
          value: hydratedValue,
          required: Boolean(field.required),
          options,
          isMissing,
          isLowConfidence,
          confidence,
          onStateActionName,
          actionParams
        };
      }

      return {
        key: "relatedTag",
        type: "text",
        displayTitle,
        hintText,
        value: hydratedValue,
        required: Boolean(field.required),
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Special Field Handling for FF&E Spec Title
    if (
      field.key === "specTitle" &&
      field.type !== "list" &&
      field.type !== "enum" &&
      (!field.options || field.options.length === 0)
    ) {
      const currentSpecTag =
        hydration.formInput?.specTag ||
        hydration.state?.specTag ||
        hydration.userCacheDraft?.specTag ||
        hydration.parserResult?.specTag ||
        hydration.aiMetadata?.specTag ||
        "";

      const tagMap =
        logSettings.ffeTags && logSettings.ffeTags.tagMap
          ? logSettings.ffeTags.tagMap
          : {};

      let titleVal = String(hydratedValue || "");
      if (!titleVal && currentSpecTag && tagMap[currentSpecTag]) {
        titleVal = tagMap[currentSpecTag];
      }

      return {
        key: "specTitle",
        type: "text",
        displayTitle,
        hintText,
        value: titleVal,
        required: Boolean(field.required),
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Special Field Handling for FF&E Vendor
    if (
      field.key === "vendor" &&
      field.type !== "list" &&
      field.type !== "enum" &&
      (!field.options || field.options.length === 0)
    ) {
      const ffeVendors =
        logSettings.ffeTags && logSettings.ffeTags.vendors
          ? logSettings.ffeTags.vendors
          : [];

      return {
        key: "vendor",
        type: "text",
        displayTitle,
        hintText,
        value: hydratedValue,
        required: Boolean(field.required),
        suggestions: ffeVendors.length > 0 ? ffeVendors : undefined,
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Generic Dropdown (list / enum)
    if (field.type === "list" || field.type === "enum") {
      let optionsList: PicklistOption[] = field.options || [];

      if (field.optionsRange) {
        const ss = hydration.spreadsheet || null;
        const docTypeKey = hydration.docTypeKey || "Submittal_Arch";
        const activeSheetName = hydration.activeSheetName || "Submittal Arch";
        const resolvedResult = PicklistResolver.resolvePicklistOptionsRange(
          field.optionsRange,
          ss,
          docTypeKey,
          activeSheetName,
          field
        );
        if (resolvedResult && resolvedResult.options && resolvedResult.options.length > 0) {
          optionsList = resolvedResult.options;
        }
      }

      const options: WidgetOptionViewModel[] = [];

      if (optionsList.length === 0) {
        options.push({ label: "-- None --", value: "", isSelected: true });
      } else {
        optionsList.forEach((opt: any) => {
          const isSelected =
            String(opt.value) === String(hydratedValue) ||
            String(opt.label) === String(hydratedValue);
          options.push({
            label: opt.label || opt.value,
            value: opt.value,
            isSelected
          });
        });
      }

      return {
        key: field.key,
        type: "dropdown",
        displayTitle,
        hintText,
        value: hydratedValue,
        required: Boolean(field.required),
        options,
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Date field handling
    if (field.key === "date" || field.type === "date") {
      let epochMs: number | undefined;
      if (hydratedValue) {
        if (typeof hydratedValue === "number") {
          epochMs = hydratedValue;
        } else if (typeof hydratedValue === "string") {
          if (/^\d{6}$/.test(hydratedValue)) {
            const yy = parseInt(hydratedValue.slice(0, 2), 10);
            const mm = parseInt(hydratedValue.slice(2, 4), 10) - 1;
            const dd = parseInt(hydratedValue.slice(4, 6), 10);
            const year = 2000 + yy;
            epochMs = new Date(year, mm, dd).getTime();
          } else if (!isNaN(Date.parse(hydratedValue))) {
            epochMs = Date.parse(hydratedValue);
          }
        }
      }

      return {
        key: field.key,
        type: field.type === "date" ? "date_picker" : "date",
        displayTitle: displayTitle || "Date",
        hintText: hintText || "Date (YYMMDD)",
        value: hydratedValue,
        epochMs,
        required: Boolean(field.required),
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Multiline Text
    if (field.type === "multiline") {
      return {
        key: field.key,
        type: "multiline",
        displayTitle,
        hintText,
        value: hydratedValue,
        required: Boolean(field.required),
        isMissing,
        isLowConfidence,
        confidence,
        onStateActionName,
        actionParams
      };
    }

    // Default Single-Line Text
    return {
      key: field.key,
      type: "text",
      displayTitle,
      hintText,
      value: hydratedValue,
      required: Boolean(field.required),
      isMissing,
      isLowConfidence,
      confidence,
      onStateActionName,
      actionParams
    };
  }
}
