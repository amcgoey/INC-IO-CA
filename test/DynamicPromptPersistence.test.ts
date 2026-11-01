import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GasMockHarness } from './harness/GasMockHarness';
import { FakeCacheAdapter } from '../src/adapters/fakes/FakeCacheAdapter';
import { PrefixCacheManager } from '../src/core/admin/PrefixCacheManager';
import { processSubmission, handleDynamicPromptSubmission, ProcessDependencies } from '../src/Process';
import { defaultActionRegistry } from '../src/core/workflow/ActionRegistry';
import { defaultSpecRegistry } from '../src/core/specs/DocumentTypeSpecRegistry';
import { defaultDocumentTypeConfigRegistry } from '../src/DocumentTypeConfigRegistry';
import { PipelineBuilder } from '../src/core/workflow/PipelineBuilder';

describe('Ticket #311 - Synchronous Dynamic SpecTag & Vendor Persistence with Scoped Cache Eviction', () => {
  let fakeCache: FakeCacheAdapter;
  let prefixManager: PrefixCacheManager;
  let mockLogRepository: any;
  let mockCardPresenter: any;
  let deps: ProcessDependencies;
  const logFileId = 'ss-test-log-311';

  beforeEach(() => {
    GasMockHarness.install();

    fakeCache = new FakeCacheAdapter();
    (globalThis as any).defaultCacheAdapter = fakeCache;
    prefixManager = new PrefixCacheManager(fakeCache);

    // Setup spreadsheet mock in GasMockHarness
    const ss = (globalThis as any).SpreadsheetApp.openById(logFileId);
    ss.insertSheet('Submittals Log');

    mockLogRepository = {
      addNewTagToTagList: vi.fn(),
      addNewVendorToTagList: vi.fn(),
      getLogSettings: vi.fn().mockReturnValue({
        actions: [{ action: 'Received', abbr: 'Rec', status: 'Under Review' }],
        ffeTags: { tags: ['CH-01'], vendors: ['Furniture Co'], tagMap: {} },
      }),
      verifyAndFormatLogSheet: vi.fn().mockReturnValue(['Section', 'Number', 'Title', 'Link']),
      appendDocument: vi.fn().mockReturnValue({
        targetKey: '033000-001-001',
        newFileName: '033000-001-001 Concrete',
        contactHistory: 'GC',
        rowIndex: 5,
        failedColumns: [],
        previousRowUpdated: false,
      }),
    };

    mockCardPresenter = {
      presentValidationError: vi.fn(),
      presentInteractionPrompt: vi.fn(),
      presentNotification: vi.fn().mockImplementation((text: string) => ({
        type: 'notification',
        text,
      })),
      presentError: vi.fn().mockImplementation((err: any) => ({
        type: 'error',
        message: err.message || String(err),
      })),
      presentIncomingSuccess: vi.fn().mockReturnValue({ type: 'success' }),
      presentOutgoingSuccess: vi.fn().mockReturnValue({ type: 'success' }),
      presentCardReload: vi.fn(),
      presentIntakeCard: vi.fn(),
    };

    deps = {
      actionRegistry: defaultActionRegistry,
      specRegistry: defaultSpecRegistry,
      configRegistry: defaultDocumentTypeConfigRegistry,
      logRepository: mockLogRepository,
      driveFilingRepository: {
        fileDocument: vi.fn().mockReturnValue({
          fileId: 'f1',
          url: 'http://drive.com/f1',
          name: 'f1.pdf',
        }),
      } as any,
      cardPresenter: mockCardPresenter,
      cacheAdapter: fakeCache,
      prefixManager: prefixManager,
    };
  });

  afterEach(() => {
    GasMockHarness.uninstall();
    vi.restoreAllMocks();
  });

  it('synchronously persists confirmed SpecTag and invalidates scoped config cache upon prompt resumption', async () => {
    // Populate scoped caches
    prefixManager.putScoped(`DOC_CONFIG_${logFileId}`, `DOC_CONFIG_${logFileId}_ffe`, 'cached_ffe_config', 3600);
    prefixManager.putScoped(`log_settings_${logFileId}`, `log_settings_${logFileId}_tag`, 'cached_settings', 3600);
    prefixManager.putScoped('log_search_', 'log_search_unrelated', 'keep_me', 3600);

    // Mock PipelineBuilder to avoid full workflow execution
    vi.spyOn(PipelineBuilder, 'buildAndExecute').mockResolvedValue({
      action: 'updateCard',
      card: { cardId: 'mock-card' },
    } as any);

    const originalForm = {
      discipline: 'Architecture',
      section: '033000',
      submittalNum: '001',
      revNum: '001',
      title: 'Specimen Chair',
      date: '2026-11-01',
      contact: 'GC',
      action: 'Received',
      incomingRouting: 'To Review',
      specTag: 'FB-999',
    };

    const event: any = {
      formInput: {
        tag: 'FB-999',
        description: 'Custom Executive Chair',
      },
      parameters: {
        logFileId,
        resumedFromDynamicPrompt: 'true',
        promptSupportDataKey: 'SpecTags',
        promptFieldKey: 'specTag',
        promptUserValue: 'FB-999',
        originalFormInput: JSON.stringify(originalForm),
      },
    };

    const res = await processSubmission(event, deps);

    // 1. Verify addNewTagToTagList called synchronously with tag and title
    expect(mockLogRepository.addNewTagToTagList).toHaveBeenCalledTimes(1);
    expect(mockLogRepository.addNewTagToTagList).toHaveBeenCalledWith(logFileId, 'FB-999', 'Custom Executive Chair');

    // 2. Verify Scoped Cache Eviction occurred
    expect(prefixManager.getScoped(`DOC_CONFIG_${logFileId}`, `DOC_CONFIG_${logFileId}_ffe`)).toBeNull();
    expect(prefixManager.getScoped(`log_settings_${logFileId}`, `log_settings_${logFileId}_tag`)).toBeNull();
    // Unrelated scope left alone
    expect(prefixManager.getScoped('log_search_', 'log_search_unrelated')).toBe('keep_me');

    // 3. Verify filing pipeline proceeded
    expect(PipelineBuilder.buildAndExecute).toHaveBeenCalled();
  });

  it('synchronously persists confirmed Vendor and invalidates scoped config cache upon prompt resumption', async () => {
    prefixManager.putScoped(`DOC_CONFIG_${logFileId}`, `DOC_CONFIG_${logFileId}_ffe`, 'cached_ffe_config', 3600);

    vi.spyOn(PipelineBuilder, 'buildAndExecute').mockResolvedValue({
      action: 'updateCard',
      card: { cardId: 'mock-card' },
    } as any);

    const originalForm = {
      discipline: 'Architecture',
      section: '033000',
      submittalNum: '001',
      revNum: '001',
      title: 'Acoustic Panels',
      date: '2026-11-01',
      contact: 'GC',
      action: 'Received',
      incomingRouting: 'To Review',
      vendor: 'New Acoustics LLC',
    };

    const event: any = {
      formInput: {
        code: 'NEW_ACOUSTICS',
        name: 'New Acoustics LLC',
      },
      parameters: {
        logFileId,
        resumedFromDynamicPrompt: 'true',
        promptSupportDataKey: 'Vendors',
        promptFieldKey: 'vendor',
        promptUserValue: 'New Acoustics LLC',
        originalFormInput: JSON.stringify(originalForm),
      },
    };

    await processSubmission(event, deps);

    expect(mockLogRepository.addNewVendorToTagList).toHaveBeenCalledTimes(1);
    expect(mockLogRepository.addNewVendorToTagList).toHaveBeenCalledWith(logFileId, 'New Acoustics LLC', 'New Acoustics LLC');
    expect(prefixManager.getScoped(`DOC_CONFIG_${logFileId}`, `DOC_CONFIG_${logFileId}_ffe`)).toBeNull();
    expect(PipelineBuilder.buildAndExecute).toHaveBeenCalled();
  });

  it('handles spreadsheet write failure cleanly: does NOT evict cache, halts pipeline, and returns error notification', async () => {
    prefixManager.putScoped(`DOC_CONFIG_${logFileId}`, `DOC_CONFIG_${logFileId}_ffe`, 'cached_ffe_config', 3600);

    // Simulate spreadsheet write error (e.g. lock failure or protected range)
    mockLogRepository.addNewTagToTagList.mockImplementation(() => {
      throw new Error('Spreadsheet range is protected or locked');
    });

    const buildAndExecuteSpy = vi.spyOn(PipelineBuilder, 'buildAndExecute');

    const originalForm = {
      discipline: 'Architecture',
      section: '033000',
      submittalNum: '001',
      revNum: '001',
      title: 'Specimen Chair',
      date: '2026-11-01',
      contact: 'GC',
      action: 'Received',
      incomingRouting: 'To Review',
      specTag: 'FB-999',
    };

    const event: any = {
      formInput: {
        tag: 'FB-999',
        description: 'Custom Executive Chair',
      },
      parameters: {
        logFileId,
        resumedFromDynamicPrompt: 'true',
        promptSupportDataKey: 'SpecTags',
        promptFieldKey: 'specTag',
        promptUserValue: 'FB-999',
        originalFormInput: JSON.stringify(originalForm),
      },
    };

    const result = await processSubmission(event, deps);

    // 1. Persistence was attempted
    expect(mockLogRepository.addNewTagToTagList).toHaveBeenCalledTimes(1);

    // 2. Cache was NOT evicted / NOT poisoned
    expect(prefixManager.getScoped(`DOC_CONFIG_${logFileId}`, `DOC_CONFIG_${logFileId}_ffe`)).toBe('cached_ffe_config');

    // 3. Pipeline execution was HALTED (no partial pipeline)
    expect(buildAndExecuteSpy).not.toHaveBeenCalled();

    // 4. User received actionable error notification
    expect(mockCardPresenter.presentNotification).toHaveBeenCalledWith(
      expect.stringContaining('Spreadsheet range is protected or locked')
    );
    expect(result).toEqual({
      type: 'notification',
      text: expect.stringContaining('Spreadsheet range is protected or locked'),
    });
  });

  it('handleDynamicPromptSubmission executes synchronously and delegates cleanly', async () => {
    prefixManager.putScoped(`DOC_CONFIG_${logFileId}`, `DOC_CONFIG_${logFileId}_ffe`, 'cached_ffe_config', 3600);

    vi.spyOn(PipelineBuilder, 'buildAndExecute').mockResolvedValue({
      action: 'updateCard',
      card: { cardId: 'mock-card' },
    } as any);

    const originalForm = {
      discipline: 'Architecture',
      section: '033000',
      submittalNum: '001',
      revNum: '001',
      title: 'Specimen Chair',
      date: '2026-11-01',
      contact: 'GC',
      action: 'Received',
      incomingRouting: 'To Review',
      specTag: 'FB-999',
    };

    const event: any = {
      formInput: {
        tag: 'FB-999',
        description: 'Custom Executive Chair',
      },
      parameters: {
        logFileId,
        resumedFromDynamicPrompt: 'true',
        promptSupportDataKey: 'SpecTags',
        promptFieldKey: 'specTag',
        promptUserValue: 'FB-999',
        originalFormInput: JSON.stringify(originalForm),
      },
    };

    await handleDynamicPromptSubmission(event, deps);

    expect(mockLogRepository.addNewTagToTagList).toHaveBeenCalledWith(logFileId, 'FB-999', 'Custom Executive Chair');
    expect(prefixManager.getScoped(`DOC_CONFIG_${logFileId}`, `DOC_CONFIG_${logFileId}_ffe`)).toBeNull();
    expect(PipelineBuilder.buildAndExecute).toHaveBeenCalled();
  });
});
