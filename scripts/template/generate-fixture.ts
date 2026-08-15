/**
 * @file generate-fixture.ts
 * @description Generates the document log workbook template JSON fixture from declarative JSON specs.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { WorkbookTemplateViewModel } from "../../src/core/config/WorkbookTemplateViewModel";
import { createWorkbookTemplateViewModel } from "./spec-loader";

export function generateFixture(
  viewModel?: WorkbookTemplateViewModel,
  customOutputPath?: string
): string {
  const vm = viewModel || createWorkbookTemplateViewModel();
  const fixture = vm.toFixtureJson();
  const outputPath =
    customOutputPath ||
    path.resolve(__dirname, "../../test/fixtures/document-log-workbook-template.json");

  fs.writeFileSync(outputPath, JSON.stringify(fixture, null, 2) + "\n", "utf-8");
  console.log(`[OK] Successfully generated template fixture at ${outputPath}`);
  return outputPath;
}

if (require.main === module) {
  try {
    generateFixture();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] Failed to generate fixture: ${msg}`);
    process.exit(1);
  }
}