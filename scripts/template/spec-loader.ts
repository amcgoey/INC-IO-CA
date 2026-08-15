/**
 * @file spec-loader.ts
 * @description Tier 3 Host Tooling utility for reading, validating, and compiling
 * declarative JSON specifications from src/specs/ into WorkbookTemplateViewModel.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { JsonWorkbookSpecAdapter } from "../../src/core/specs/JsonWorkbookSpecAdapter";
import { JsonDocumentTypeSpecAdapter } from "../../src/core/specs/JsonDocumentTypeSpecAdapter";
import { GoogleSheetsDocumentTypeSpecAdapter } from "../../src/adapters/gas/GoogleSheetsDocumentTypeSpecAdapter";
import { DocumentLogWorkbookSpec } from "../../src/core/config/DocumentLogWorkbookSpec";
import { DocumentLogWorkbookViewSpec } from "../../src/core/config/DocumentLogWorkbookViewSpec";
import { DocumentTypeSpec } from "../../src/core/specs/DocumentTypeSpec";
import { WorkbookTemplateViewModel } from "../../src/core/config/WorkbookTemplateViewModel";

export interface LoadedWorkbookSpecs {
  baseSpec: Partial<DocumentLogWorkbookSpec>;
  viewSpec: DocumentLogWorkbookViewSpec;
  docTypeSpecs: DocumentTypeSpec[];
  compiledModel: DocumentLogWorkbookSpec;
  viewModel: WorkbookTemplateViewModel;
}

export interface LoadWorkbookSpecsOptions {
  specsDir?: string;
  baseSpecPath?: string;
  viewSpecPath?: string;
}

export function loadBaseSpecFromFile(filePath: string): Partial<DocumentLogWorkbookSpec> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Base spec file not found at: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const result = JsonWorkbookSpecAdapter.parseBaseSpec(content);

  if (result.status === "invalid") {
    if (result.errors.some((e) => e.startsWith("Invalid JSON syntax:"))) {
      throw new Error(`Invalid JSON syntax in base spec (${filePath}): ${result.errors.join("; ")}`);
    }
    throw new Error(`Base spec validation failed (${filePath}): ${result.errors.join("; ")}`);
  }

  return result.spec;
}

export function loadViewSpecFromFile(filePath: string): DocumentLogWorkbookViewSpec {
  if (!fs.existsSync(filePath)) {
    throw new Error(`View spec file not found at: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const result = JsonWorkbookSpecAdapter.parseViewSpec(content);

  if (result.status === "invalid") {
    if (result.errors.some((e) => e.startsWith("Invalid JSON syntax:"))) {
      throw new Error(`Invalid JSON syntax in view spec (${filePath}): ${result.errors.join("; ")}`);
    }
    throw new Error(`View spec validation failed (${filePath}): ${result.errors.join("; ")}`);
  }

  return result.spec;
}

export function loadDocTypeSpecsFromDir(dirPath: string): DocumentTypeSpec[] {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Specs directory not found at: ${dirPath}`);
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const docTypeSpecs: DocumentTypeSpec[] = [];

  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name)
    .filter((name) => name !== "workbook_base.json" && name !== "workbook_view.json")
    .sort();

  for (const filename of jsonFiles) {
    const fullPath = path.join(dirPath, filename);
    const content = fs.readFileSync(fullPath, "utf-8");
    const result = JsonDocumentTypeSpecAdapter.parse(content);

    if (result.status === "invalid") {
      if (result.errors.some((e) => e.startsWith("Invalid JSON syntax:"))) {
        throw new Error(`Invalid JSON syntax in doc type spec (${filename}): ${result.errors.join("; ")}`);
      }
      throw new Error(`Document type spec validation failed (${filename}): ${result.errors.join("; ")}`);
    }

    docTypeSpecs.push(result.spec);
  }

  return docTypeSpecs;
}

export function loadWorkbookSpecs(options?: LoadWorkbookSpecsOptions): LoadedWorkbookSpecs {
  const specsDir = options?.specsDir || path.resolve(__dirname, "../../src/specs");
  const baseSpecPath = options?.baseSpecPath || path.join(specsDir, "workbook_base.json");
  const viewSpecPath = options?.viewSpecPath || path.join(specsDir, "workbook_view.json");

  const baseSpec = loadBaseSpecFromFile(baseSpecPath);
  const viewSpec = loadViewSpecFromFile(viewSpecPath);
  const docTypeSpecs = loadDocTypeSpecsFromDir(specsDir);

  const compiledModel = GoogleSheetsDocumentTypeSpecAdapter.compileWorkbookSpec(docTypeSpecs, baseSpec);
  const viewModel = new WorkbookTemplateViewModel(compiledModel, viewSpec);

  return {
    baseSpec,
    viewSpec,
    docTypeSpecs,
    compiledModel,
    viewModel
  };
}

export function createWorkbookTemplateViewModel(options?: LoadWorkbookSpecsOptions): WorkbookTemplateViewModel {
  return loadWorkbookSpecs(options).viewModel;
}