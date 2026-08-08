/// <reference path="../../types.ts" />
/**
 * @file WorkflowContextFactory.ts
 * @description Factory for creating DocumentActionContext instances with lazy adapter ES5 property getters.
 */

declare var require: any;
declare var defaultLogRepository: LogRepository;
declare var defaultDriveFilingRepository: DriveFilingRepository;
declare var defaultPdfDocumentService: PdfDocumentService;
declare var defaultAiAnalysisService: AiAnalysisService;
declare var defaultCacheAdapter: CacheAdapter;
declare var defaultSpreadsheetLockAdapter: SpreadsheetLockAdapter;
declare var defaultUserInterfacePresenter: UserInterfacePresenter;

let FakeLogRepoClass: new (...args: unknown[]) => LogRepository | undefined;
let FakeDriveFilingRepoClass: new (...args: unknown[]) => DriveFilingRepository | undefined;
let FakePdfServiceClass: new (...args: unknown[]) => PdfDocumentService | undefined;
let FakeAiAdapterClass: new (...args: unknown[]) => AiAnalysisService | undefined;
let FakeCacheAdapterClass: new (...args: unknown[]) => CacheAdapter | undefined;
let FakeSpreadsheetLockAdapterClass: new (...args: unknown[]) => SpreadsheetLockAdapter | undefined;
let FakeUserInterfacePresenterClass: new (...args: unknown[]) => UserInterfacePresenter | undefined;

if (typeof require !== 'undefined') {
  try {
    FakeLogRepoClass = require('../../adapters/fakes/FakeLogRepository').FakeLogRepository;
  } catch (e) {}
  try {
    FakeDriveFilingRepoClass = require('../../adapters/fakes/FakeDriveFilingRepository').FakeDriveFilingRepository;
  } catch (e) {}
  try {
    FakePdfServiceClass = require('../../adapters/fakes/FakePdfDocumentService').FakePdfDocumentService;
  } catch (e) {}
  try {
    FakeAiAdapterClass = require('../../adapters/fakes/FakeAiAnalysisAdapter').FakeAiAnalysisAdapter;
  } catch (e) {}
  try {
    FakeCacheAdapterClass = require('../../adapters/fakes/FakeCacheAdapter').FakeCacheAdapter;
  } catch (e) {}
  try {
    FakeSpreadsheetLockAdapterClass = require('../../adapters/fakes/FakeSpreadsheetLockAdapter').FakeSpreadsheetLockAdapter;
  } catch (e) {}
  try {
    FakeUserInterfacePresenterClass = require('../../adapters/fakes/FakeUserInterfacePresenter').FakeUserInterfacePresenter;
  } catch (e) {}
}

type AdapterMap = ContextAdapters;

interface WorkflowContextOptions extends Partial<DocumentActionContext> {
  adapters?: AdapterMap;
}

class WorkflowContextFactory {
  /**
   * Defines lazy ES5 getters on context.adapters and top-level context aliases.
   */
  private static setupLazyAdapters(
    context: DocumentActionContext,
    resolvers: Record<keyof ContextAdapters, () => any>
  ): ContextAdapters {
    const adaptersObj: ContextAdapters = {};
    const adapterCache: Record<string, any> = {};

    for (const key of Object.keys(resolvers) as Array<keyof ContextAdapters>) {
      const resolver = resolvers[key];

      Object.defineProperty(adaptersObj, key, {
        get: () => {
          if (!(key in adapterCache)) {
            adapterCache[key] = resolver();
          }
          return adapterCache[key];
        },
        enumerable: true,
        configurable: true
      });

      Object.defineProperty(context, key, {
        get: () => (adaptersObj as any)[key],
        enumerable: false,
        configurable: true
      });
    }

    return adaptersObj;
  }

  /**
   * Constructs a DocumentActionContext equipped with lazy ES5 adapter property getters.
   * Adapters are resolved dynamically using DocumentTypeConfig string adapter keys.
   */
  public static createContext(
    config?: DocumentTypeConfig,
    overrides: Partial<AdapterMap> = {},
    options: WorkflowContextOptions = {}
  ): DocumentActionContext {
    const registry = (globalThis as any).defaultDocumentTypeConfigRegistry || (typeof defaultDocumentTypeConfigRegistry !== 'undefined' ? defaultDocumentTypeConfigRegistry : undefined);
    const resolvedConfig = config || (registry ? registry.getConfig('Submittal') : undefined);
    const combinedOverrides = { ...options.adapters, ...overrides };

    const context: DocumentActionContext = {
      ...options,
      config: resolvedConfig
    };

    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {};

    const resolvers: Record<keyof ContextAdapters, () => any> = {
      logRepository: () => {
        if (combinedOverrides.logRepository !== undefined) return combinedOverrides.logRepository;
        if (typeof defaultLogRepository !== 'undefined') return defaultLogRepository;
        const adapterKey = resolvedConfig?.logAdapterKey || 'GoogleSheetsLogRepository';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
      driveFilingRepository: () => {
        if (combinedOverrides.driveFilingRepository !== undefined) return combinedOverrides.driveFilingRepository;
        if (typeof defaultDriveFilingRepository !== 'undefined') return defaultDriveFilingRepository;
        const adapterKey = resolvedConfig?.filingAdapterKey || 'GoogleDriveFilingRepository';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
      pdfService: () => resolvers.pdfDocumentService(),
      pdfDocumentService: () => {
        if (combinedOverrides.pdfDocumentService !== undefined) return combinedOverrides.pdfDocumentService;
        if (typeof defaultPdfDocumentService !== 'undefined') return defaultPdfDocumentService;
        const adapterKey = resolvedConfig?.pdfAdapterKey || 'PdfDocumentService';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
      aiService: () => resolvers.aiAnalysisService(),
      aiAnalysisService: () => {
        if (combinedOverrides.aiAnalysisService !== undefined) return combinedOverrides.aiAnalysisService;
        if (typeof defaultAiAnalysisService !== 'undefined') return defaultAiAnalysisService;
        const adapterKey = resolvedConfig?.aiAdapterKey || 'GeminiAiAnalysisAdapter';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
      cacheAdapter: () => {
        if (combinedOverrides.cacheAdapter !== undefined) return combinedOverrides.cacheAdapter;
        if (typeof defaultCacheAdapter !== 'undefined') return defaultCacheAdapter;
        const adapterKey = resolvedConfig?.cacheAdapterKey || 'CacheAdapter';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
      spreadsheetLockAdapter: () => {
        if (combinedOverrides.spreadsheetLockAdapter !== undefined) return combinedOverrides.spreadsheetLockAdapter;
        if (typeof defaultSpreadsheetLockAdapter !== 'undefined') return defaultSpreadsheetLockAdapter;
        const adapterKey = resolvedConfig?.lockAdapterKey || 'SpreadsheetLockAdapter';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
      userInterfacePresenter: () => {
        if (combinedOverrides.userInterfacePresenter !== undefined) return combinedOverrides.userInterfacePresenter;
        if (typeof defaultUserInterfacePresenter !== 'undefined') return defaultUserInterfacePresenter;
        const adapterKey = resolvedConfig?.presenterAdapterKey || 'UserInterfacePresenter';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      }
    };

    context.adapters = this.setupLazyAdapters(context, resolvers);
    return context;
  }

  /**
   * Constructs a DocumentActionContext for testing.
   * Un-overridden adapters lazily instantiate in-memory test fakes on first access.
   */
  public static createTestContext(
    config?: DocumentTypeConfig,
    overrides: Partial<AdapterMap> = {},
    options: WorkflowContextOptions = {}
  ): DocumentActionContext {
    const registry = (globalThis as any).defaultDocumentTypeConfigRegistry || (typeof defaultDocumentTypeConfigRegistry !== 'undefined' ? defaultDocumentTypeConfigRegistry : undefined);
    const resolvedConfig = config || (registry ? registry.getConfig('Submittal') : undefined);
    const combinedOverrides = { ...options.adapters, ...overrides };

    const context: DocumentActionContext = {
      ...options,
      config: resolvedConfig
    };

    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {};

    const testFakes: Record<string, any> = {};

    const resolvers: Record<keyof ContextAdapters, () => any> = {
      logRepository: () => {
        if (combinedOverrides.logRepository !== undefined) return combinedOverrides.logRepository;
        if (!testFakes.logRepository) {
          const Ctor = FakeLogRepoClass || g.FakeLogRepository;
          if (!Ctor) throw new Error('FakeLogRepository unavailable in current test environment');
          testFakes.logRepository = new Ctor();
        }
        return testFakes.logRepository;
      },
      driveFilingRepository: () => {
        if (combinedOverrides.driveFilingRepository !== undefined) return combinedOverrides.driveFilingRepository;
        if (!testFakes.driveFilingRepository) {
          const Ctor = FakeDriveFilingRepoClass || g.FakeDriveFilingRepository;
          if (!Ctor) throw new Error('FakeDriveFilingRepository unavailable in current test environment');
          testFakes.driveFilingRepository = new Ctor();
        }
        return testFakes.driveFilingRepository;
      },
      pdfDocumentService: () => {
        if (combinedOverrides.pdfDocumentService !== undefined) return combinedOverrides.pdfDocumentService;
        if (!testFakes.pdfDocumentService) {
          const Ctor = FakePdfServiceClass || g.FakePdfDocumentService;
          if (!Ctor) throw new Error('FakePdfDocumentService unavailable in current test environment');
          testFakes.pdfDocumentService = new Ctor();
        }
        return testFakes.pdfDocumentService;
      },
      aiAnalysisService: () => {
        if (combinedOverrides.aiAnalysisService !== undefined) return combinedOverrides.aiAnalysisService;
        if (!testFakes.aiAnalysisService) {
          const Ctor = FakeAiAdapterClass || g.FakeAiAnalysisAdapter;
          if (!Ctor) throw new Error('FakeAiAnalysisAdapter unavailable in current test environment');
          testFakes.aiAnalysisService = new Ctor();
        }
        return testFakes.aiAnalysisService;
      },
      cacheAdapter: () => {
        if (combinedOverrides.cacheAdapter !== undefined) return combinedOverrides.cacheAdapter;
        if (!testFakes.cacheAdapter) {
          const Ctor = FakeCacheAdapterClass || g.FakeCacheAdapter;
          if (!Ctor) throw new Error('FakeCacheAdapter unavailable in current test environment');
          testFakes.cacheAdapter = new Ctor();
        }
        return testFakes.cacheAdapter;
      },
      spreadsheetLockAdapter: () => {
        if (combinedOverrides.spreadsheetLockAdapter !== undefined) return combinedOverrides.spreadsheetLockAdapter;
        if (!testFakes.spreadsheetLockAdapter) {
          const Ctor = FakeSpreadsheetLockAdapterClass || g.FakeSpreadsheetLockAdapter;
          if (!Ctor) throw new Error('FakeSpreadsheetLockAdapter unavailable in current test environment');
          testFakes.spreadsheetLockAdapter = new Ctor();
        }
        return testFakes.spreadsheetLockAdapter;
      },
      userInterfacePresenter: () => {
        if (combinedOverrides.userInterfacePresenter !== undefined) return combinedOverrides.userInterfacePresenter;
        if (!testFakes.userInterfacePresenter) {
          const Ctor = FakeUserInterfacePresenterClass || g.FakeUserInterfacePresenter;
          if (!Ctor) throw new Error('FakeUserInterfacePresenter unavailable in current test environment');
          testFakes.userInterfacePresenter = new Ctor();
        }
        return testFakes.userInterfacePresenter;
      }
    };

    context.adapters = this.setupLazyAdapters(context, resolvers);
    return context;
  }
}

function createTestContext(
  config?: DocumentTypeConfig,
  overrides?: Partial<AdapterMap>,
  options?: WorkflowContextOptions
): DocumentActionContext {
  return WorkflowContextFactory.createTestContext(config, overrides, options);
}

declare var module: any;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WorkflowContextFactory,
    createTestContext
  };
}

(globalThis as any).WorkflowContextFactory = WorkflowContextFactory;
(globalThis as any).createTestContext = createTestContext;
