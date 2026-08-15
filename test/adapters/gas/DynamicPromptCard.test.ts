import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GasMockHarness } from '../../harness';
import { CardPresenter } from '../../../src/adapters/gas/CardPresenter';
import { buildDynamicSupportDataCard } from '../../../src/adapters/gas/UI';
import type { DynamicPromptConfig } from '../../../src/core/specs/DocumentTypeSpec';

describe('DynamicSupportDataCard & CardPresenter Tier 2 Intercept', () => {
  beforeEach(() => {
    GasMockHarness.install();
  });

  afterEach(() => {
    GasMockHarness.uninstall();
  });

  it('should build a dynamic support data entry card with inputs for all dynamicPrompts', () => {
    const dynamicPrompts: DynamicPromptConfig[] = [
      { columnKey: 'code', uiLabel: 'Vendor Code', required: true },
      { columnKey: 'notes', uiLabel: 'Vendor Notes', required: false },
    ];

    const mockEvent = {
      formInput: {
        discipline: 'FF&E',
        specTag: 'FB101',
        vendor: 'Brand New Vendor Inc',
      },
      parameters: {
        logFileId: 'LOG_123',
        targetFolderId: 'FOLDER_123',
      },
    };

    const payload = {
      supportDataKey: 'Vendors',
      fieldKey: 'vendor',
      userValue: 'Brand New Vendor Inc',
      dynamicPrompts,
      message: 'Vendor "Brand New Vendor Inc" is not in the system.',
    };

    const card = buildDynamicSupportDataCard(mockEvent as any, payload);
    expect(card).toBeDefined();

    const sections = (card as any).sections || [];
    expect(sections.length).toBeGreaterThanOrEqual(2);

    const inputSection = sections[1];
    const widgets = (inputSection as any).widgets || [];
    expect(widgets.length).toBeGreaterThanOrEqual(3); // 2 inputs + 1 buttonSet

    // Verify first widget is the required Code input
    const codeInput = widgets[0];
    expect(codeInput.fieldName).toBe('code');
    expect(codeInput.title).toContain('Vendor Code *');

    // Verify second widget is optional Notes input
    const notesInput = widgets[1];
    expect(notesInput.fieldName).toBe('notes');
    expect(notesInput.title).toContain('Vendor Notes');
  });

  it('should push dynamic support data card via CardPresenter.presentDynamicPromptCard', () => {
    const presenter = new CardPresenter();
    const dynamicPrompts: DynamicPromptConfig[] = [
      { columnKey: 'tag', uiLabel: 'Spec Tag', required: true },
      { columnKey: 'category', uiLabel: 'Category', required: false },
      { columnKey: 'description', uiLabel: 'Description', required: false },
    ];

    const mockEvent = {
      formInput: {
        specTag: 'NEWTAG100',
      },
      parameters: {
        logFileId: 'LOG_123',
      },
    };

    const payload = {
      supportDataKey: 'SpecTags',
      fieldKey: 'specTag',
      userValue: 'NEWTAG100',
      dynamicPrompts,
    };

    const response = presenter.presentDynamicPromptCard(mockEvent as any, payload);
    expect(response).toBeDefined();
    expect((response as any).navigation).toBeDefined();
    expect((response as any).navigation.actionResponse?.action).toBe('pushCard');
    expect((response as any).navigation.card).toBeDefined();
  });
});
