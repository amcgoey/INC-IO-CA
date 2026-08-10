/// <reference path="../../types.ts" />
/**
 * @file WorkflowContextFactory.ts
 * @description Factory for creating DocumentActionContext instances with lazy adapter ES5 property getters.
 */

import { FakeLogRepository } from '../../adapters/fakes/FakeLogRepository';
import { FakeDriveFilingRepository } from '../../adapters/fakes/FakeDriveFilingRepository';
import { FakePdfDocumentService } from '../../adapters/fakes/FakePdfDocumentService';
import { FakeAiAnalysisAdapter } from '../../adapters/fakes/FakeAiAnalysisAdapter';
import { FakeCacheAdapter } from '../../adapters/fakes/FakeCacheAdapter';
import { FakeSpreadsheetLockAdapter } from '../../adapters/fakes/FakeSpreadsheetLockAdapter';
import { FakeUserInterfacePresenter } from '../../adapters/fakes/FakeUserInterfacePresenter';
import { defaultDocumentTypeConfigRegistry } from '../../DocumentTypeConfigRegistry';
import { defaultLogRepository } from '../../GoogleSheetsLogRepository';
import { defaultDriveFilingRepository } from '../../DriveFilingRepository';

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
    const combinedOverrides = {
      ...options.adapters,
      ...overrides,
      ...(options.logRepository ? { logRepository: options.logRepository } : {}),
      ...(options.driveFilingRepository ? { driveFilingRepository: options.driveFilingRepository } : {})
    };

    const context: DocumentActionContext = {
      ...options,
      config: resolvedConfig
    };

    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {};

    const resolvers: Record<keyof ContextAdapters, () => any> = {
      logRepository: () => {
        if (combinedOverrides.logRepository !== undefined) return combinedOverrides.logRepository;
        if (g.defaultLogRepository) return g.defaultLogRepository;
        const adapterKey = resolvedConfig?.logAdapterKey || 'GoogleSheetsLogRepository';
        if (g[adapterKey]) return new g[adapterKey]();
        return defaultLogRepository;
      },
      driveFilingRepository: () => {
        if (combinedOverrides.driveFilingRepository !== undefined) return combinedOverrides.driveFilingRepository;
        if (g.defaultDriveFilingRepository) return g.defaultDriveFilingRepository;
        const adapterKey = resolvedConfig?.filingAdapterKey || 'GoogleDriveFilingRepository';
        if (g[adapterKey]) return new g[adapterKey]();
        return defaultDriveFilingRepository;
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
          testFakes.logRepository = new FakeLogRepository();
        }
        return testFakes.logRepository;
      },
      driveFilingRepository: () => {
        if (combinedOverrides.driveFilingRepository !== undefined) return combinedOverrides.driveFilingRepository;
        if (!testFakes.driveFilingRepository) {
          testFakes.driveFilingRepository = new FakeDriveFilingRepository();
        }
        return testFakes.driveFilingRepository;
      },
      pdfDocumentService: () => {
        if (combinedOverrides.pdfDocumentService !== undefined) return combinedOverrides.pdfDocumentService;
        if (!testFakes.pdfDocumentService) {
          testFakes.pdfDocumentService = new FakePdfDocumentService();
        }
        return testFakes.pdfDocumentService;
      },
      aiAnalysisService: () => {
        if (combinedOverrides.aiAnalysisService !== undefined) return combinedOverrides.aiAnalysisService;
        if (!testFakes.aiAnalysisService) {
          testFakes.aiAnalysisService = new FakeAiAnalysisAdapter();
        }
        return testFakes.aiAnalysisService;
      },
      cacheAdapter: () => {
        if (combinedOverrides.cacheAdapter !== undefined) return combinedOverrides.cacheAdapter;
        if (!testFakes.cacheAdapter) {
          testFakes.cacheAdapter = new FakeCacheAdapter();
        }
        return testFakes.cacheAdapter;
      },
      spreadsheetLockAdapter: () => {
        if (combinedOverrides.spreadsheetLockAdapter !== undefined) return combinedOverrides.spreadsheetLockAdapter;
        if (!testFakes.spreadsheetLockAdapter) {
          testFakes.spreadsheetLockAdapter = new FakeSpreadsheetLockAdapter();
        }
        return testFakes.spreadsheetLockAdapter;
      },
      userInterfacePresenter: () => {
        if (combinedOverrides.userInterfacePresenter !== undefined) return combinedOverrides.userInterfacePresenter;
        if (!testFakes.userInterfacePresenter) {
          testFakes.userInterfacePresenter = new FakeUserInterfacePresenter();
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

export {
  WorkflowContextFactory,
  createTestContext
};
