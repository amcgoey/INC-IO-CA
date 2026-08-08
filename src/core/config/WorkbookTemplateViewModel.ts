/**
 * @file WorkbookTemplateViewModel.ts
 * @description Presenter binding domain layout (DocumentLogWorkbookSpec) and visual design system (DocumentLogWorkbookViewSpec).
 * Serializes template structure for offline test fixtures (toFixtureJson()) and Sheets API payload generation.
 */

import { DocumentLogWorkbookSpec, TabSpec, NamedRangeSpec } from "./DocumentLogWorkbookSpec";
import { DocumentLogWorkbookViewSpec, HeaderStyleSpec, ThemeColorsSpec } from "./DocumentLogWorkbookViewSpec";

export interface FixtureTabJson {
  name: string;
  rowCount: number;
  columnCount: number;
  isConfigTab: boolean;
  isSharedTab: boolean;
  isAuditLogTab: boolean;
  isLogTab: boolean;
  isSupportTab?: boolean;
  headers: string[];
  formulaRow: string[];
  seedRows: (string | number | boolean)[][];
}

export interface FixtureWorkbookJson {
  schemaVersion: string;
  tabs: FixtureTabJson[];
  namedRanges: NamedRangeSpec[];
}

export class WorkbookTemplateViewModel {
  constructor(
    private readonly spec: DocumentLogWorkbookSpec,
    private readonly viewSpec: DocumentLogWorkbookViewSpec
  ) {}

  public getSpec(): DocumentLogWorkbookSpec {
    return this.spec;
  }

  public getViewSpec(): DocumentLogWorkbookViewSpec {
    return this.viewSpec;
  }

  public getHeaderStyle(): HeaderStyleSpec {
    return this.viewSpec.headerStyle;
  }

  public getThemeColors(): ThemeColorsSpec {
    return this.viewSpec.themeColors;
  }

  public toFixtureJson(): FixtureWorkbookJson {
    const tabs: FixtureTabJson[] = this.spec.tabs.map((tab: TabSpec) => {
      const headers = tab.columns ? tab.columns.map((c) => c.header) : [];
      const formulaRow = tab.columns ? tab.columns.map((c) => c.formula || "") : [];
      
      const isSupportTab = Boolean(tab.isSupportTab);
      
      const tabJson: FixtureTabJson = {
        name: tab.name,
        rowCount: tab.rowCount,
        columnCount: tab.columnCount,
        isConfigTab: Boolean(tab.isConfigTab),
        isSharedTab: Boolean(tab.isSharedTab),
        isAuditLogTab: Boolean(tab.isAuditLogTab),
        isLogTab: Boolean(tab.isLogTab),
        headers,
        formulaRow,
        seedRows: tab.seedRows || []
      };

      if (isSupportTab) {
        tabJson.isSupportTab = true;
      }

      return tabJson;
    });

    return {
      schemaVersion: this.spec.schemaVersion,
      tabs,
      namedRanges: this.spec.namedRanges
    };
  }
}

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WorkbookTemplateViewModel
  };
}