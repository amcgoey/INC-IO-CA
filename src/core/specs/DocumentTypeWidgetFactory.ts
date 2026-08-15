/**
 * @file DocumentTypeWidgetFactory.ts
 * @description Tier 1 Pure Core View Model Factory building UI widget abstractions from DocumentTypeSpec.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

import { DocumentFieldSpec, DocumentTypeSpec } from "./DocumentTypeSpec";
import { PicklistResolver, PicklistOption, PicklistResolutionContext } from "../config/PicklistResolver";

export type WidgetType =
  | "text"
  | "multiline"
  | "dropdown"
  | "multi_select"
  | "date_picker";

export type WidgetInputType = WidgetType | "date";

export interface WidgetOptionViewModel {
  value: string;
  label: string;
  isSelected?: boolean;
}

export interface DocumentWidgetViewModel {
  key: string;
  type: WidgetInputType;
  widgetType: WidgetType;
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

export interface ValidationUIContext {
  missingFields?: string[];
  fieldConfidence?: Record<string, number>;
  onStateActionName?: string;
  actionParams?: Record<string, string>;
  [key: string]: any;
}

export interface HydrationContext {
  formInput?: Record<string, any>;
  state?: Record<string, any>;
  userCacheDraft?: Record<string, any>;
  parserResult?: Record<string, any>;
  aiMetadata?: Record<string, any>;
  logSettings?: Record<string, any>;
  spreadsheet?: any;
  docTypeKey?: string;
  activeSheetName?: string;
  spec?: DocumentTypeSpec | null;
  supportData?: Record<string, any>;
  [key: string]: any;
}

export interface WidgetFactoryOptions {
  hydrationContext?: HydrationContext;
  validationContext?: ValidationUIContext;
  confidenceThreshold?: number;
}

export interface FieldBuildContext {
  field: DocumentFieldSpec;
  hydration?: HydrationContext;
  validation?: ValidationUIContext;
  threshold?: number;
  spec?: DocumentTypeSpec | null;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

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

    const displayName = spec.label || spec.name || spec.key;
    const header = `3. Document Attributes (${displayName})`;

    const widgetViewModels: DocumentWidgetViewModel[] = [];

    const fields = spec.fields || [];
    for (const field of fields) {
      // Rule: Exclude calculated fields completely from UI view model
      if (field.isCalculated === true) {
        continue;
      }

      const widgetVm = this.buildFieldViewModel({
        field,
        hydration,
        validation,
        threshold,
        spec
      });

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
    hydration: HydrationContext
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
   * Missing required fields (❌) take precedence over low AI confidence (⚠️).
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
      displayTitle = "❌ " + displayTitle;
    } else if (isLowConfidence) {
      displayTitle = "⚠️ " + displayTitle;
    }

    let hintText = field.description || "";
    if (isLowConfidence && !isMissing) {
      const pct = Math.round(confidence * 100);
      hintText = `Low AI confidence (${pct}%) — please verify`;
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
   * Builds an individual DocumentWidgetViewModel for a field specification from a consolidated FieldBuildContext.
   */
  public static buildFieldViewModel(context: FieldBuildContext): DocumentWidgetViewModel | null {
    const { field, hydration = {}, validation = {}, threshold = DEFAULT_CONFIDENCE_THRESHOLD, spec } = context;

    const missingFields = validation.missingFields || [];
    const fieldConfidence = validation.fieldConfidence || {};
    const onStateActionName = validation.onStateActionName || "onStateChange";
    const actionParams = validation.actionParams || {};

    const hydratedValue = this.resolveHydratedValue(field, hydration);
    const { displayTitle, hintText, isMissing, isLowConfidence, confidence } =
      this.formatFieldTitleAndHint(field, missingFields, fieldConfidence, threshold);

    // Common Resolution Context for Picklists and Suggestions
    const resolutionContext: PicklistResolutionContext = {
      spec: hydration.spec || spec,
      supportData: spec?.supportData || hydration.supportData,
      spreadsheet: hydration.spreadsheet || null,
      docTypeKey: hydration.docTypeKey || spec?.key,
      activeSheetName: hydration.activeSheetName || spec?.label || spec?.name,
      logSettings: hydration.logSettings,
      fieldSpec: field
    };

    // Multi-select dropdown
    if (field.type === "multi_select") {
      const resolved = PicklistResolver.resolve(field.picklistSource, resolutionContext, hydratedValue);
      const optionsList = resolved.options || [];
      const selectedTokens = (Array.isArray(hydratedValue)
        ? hydratedValue.map((v: any) => String(v).trim())
        : String(hydratedValue || "").split(",").map((v: string) => v.trim())
      ).filter((v: string) => v !== "");

      const selectedSet = new Set(selectedTokens);

      const options: WidgetOptionViewModel[] = optionsList.map((opt: PicklistOption) => ({
        label: opt.label || opt.value,
        value: opt.value,
        isSelected: selectedSet.has(opt.value) || selectedSet.has(opt.label)
      }));

      return {
        key: field.key,
        type: "multi_select",
        widgetType: "multi_select",
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

    // Dropdown fields (list, enum, or fields with picklistSource when not string/multiline/date/number/boolean)
    const isDropdown =
      field.type === "list" ||
      field.type === "enum" ||
      (Boolean(field.picklistSource) &&
        field.type !== "string" &&
        field.type !== "multiline" &&
        field.type !== "date" &&
        field.type !== "number" &&
        field.type !== "boolean");

    if (isDropdown) {
      const resolved = PicklistResolver.resolve(field.picklistSource, resolutionContext, hydratedValue);
      const optionsList = resolved.options || [];

      const options: WidgetOptionViewModel[] = [];

      if (optionsList.length === 0) {
        options.push({ label: "-- None --", value: "", isSelected: true });
      } else {
        optionsList.forEach((opt: PicklistOption) => {
          const isSelected =
            hydratedValue !== undefined &&
            hydratedValue !== null &&
            hydratedValue !== "" &&
            (String(opt.value) === String(hydratedValue) ||
              String(opt.label) === String(hydratedValue));
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
        widgetType: "dropdown",
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
    if (field.type === "date") {
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
        type: "date_picker",
        widgetType: "date_picker",
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
        widgetType: "multiline",
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

    // Default Single-Line Text / String (with optional suggestions from picklistSource)
    let suggestions: string[] | undefined;
    if (field.picklistSource) {
      const resolved = PicklistResolver.resolve(field.picklistSource, resolutionContext);
      if (resolved.options && resolved.options.length > 0) {
        suggestions = resolved.options.map(o => o.value);
      }
    }

    return {
      key: field.key,
      type: "text",
      widgetType: "text",
      displayTitle,
      hintText,
      value: hydratedValue,
      required: Boolean(field.required),
      suggestions: suggestions && suggestions.length > 0 ? suggestions : undefined,
      isMissing,
      isLowConfidence,
      confidence,
      onStateActionName,
      actionParams
    };
  }
}
