import * as fs from 'node:fs';
import * as path from 'node:path';
import { DOCUMENT_LOG_WORKBOOK_SPEC } from '../../src/core/config/DocumentLogWorkbookSpec';
import { DOCUMENT_LOG_WORKBOOK_VIEW_SPEC } from '../../src/core/config/DocumentLogWorkbookViewSpec';
import { WorkbookTemplateViewModel } from '../../src/core/config/WorkbookTemplateViewModel';

export function generateFixture(): void {
  const viewModel = new WorkbookTemplateViewModel(DOCUMENT_LOG_WORKBOOK_SPEC, DOCUMENT_LOG_WORKBOOK_VIEW_SPEC);
  const fixture = viewModel.toFixtureJson();
  const outputPath = path.resolve(__dirname, '../../test/fixtures/document-log-workbook-template.json');

  fs.writeFileSync(outputPath, JSON.stringify(fixture, null, 2) + '\n', 'utf-8');
  console.log(`[OK] Successfully generated template fixture at ${outputPath}`);
}

generateFixture();
