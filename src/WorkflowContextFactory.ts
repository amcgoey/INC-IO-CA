/// <reference path="./types.ts" />
/**
 * @file WorkflowContextFactory.ts
 * @description Factory for creating DocumentActionContext instances with lazy adapter ES5 property getters.
 */

import { defaultDocumentTypeConfigRegistry } from './DocumentTypeConfigRegistry';

declare var require: any;
let FakeLogRepoClass: any;
let FakeDriveFilingRepoClass: any;
let FakePdfServiceClass: any;
let FakeAiAdapterClass: any;

if (typeof require !== 'undefined') {
  try {
    FakeLogRepoClass = require('../test/harness/fakes/FakeLogRepository').FakeLogRepository;
  } catch (e) {}
  try {
    FakeDriveFilingRepoClass = require('../test/harness/fakes/FakeDriveFilingRepository').FakeDriveFilingRepository;
  } catch (e) {}
  try {
    FakePdfServiceClass = require('../test/harness/fakes/FakePdfDocumentService').FakePdfDocumentService;
  } catch (e) {}
  try {
    FakeAiAdapterClass = require('../test/harness/fakes/FakeAiAnalysisAdapter').FakeAiAnalysisAdapter;
  } catch (e) {}
}

export type AdapterMap = ContextAdapters;

export interface WorkflowContextOptions extends Partial<DocumentActionContext> {
  adapters?: AdapterMap;
}

export class WorkflowContextFactory {
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
        enumerable: true,
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
    const resolvedConfig = config || defaultDocumentTypeConfigRegistry.getConfig('Submittal');
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
        const adapterKey = resolvedConfig.logAdapterKey || 'GoogleSheetsLogRepository';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
      driveFilingRepository: () => {
        if (combinedOverrides.driveFilingRepository !== undefined) return combinedOverrides.driveFilingRepository;
        if (typeof defaultDriveFilingRepository !== 'undefined') return defaultDriveFilingRepository;
        const adapterKey = resolvedConfig.filingAdapterKey || 'GoogleDriveFilingRepository';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
      pdfService: () => resolvers.pdfDocumentService(),
      pdfDocumentService: () => {
        if (combinedOverrides.pdfDocumentService !== undefined) return combinedOverrides.pdfDocumentService;
        if (typeof defaultPdfDocumentService !== 'undefined') return defaultPdfDocumentService;
        const adapterKey = resolvedConfig.pdfAdapterKey || 'PdfDocumentService';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
      aiService: () => resolvers.aiAnalysisService(),
      aiAnalysisService: () => {
        if (combinedOverrides.aiAnalysisService !== undefined) return combinedOverrides.aiAnalysisService;
        if (typeof defaultAiAnalysisService !== 'undefined') return defaultAiAnalysisService;
        const adapterKey = resolvedConfig.aiAdapterKey || 'GeminiAiAnalysisAdapter';
        if (g[adapterKey]) return new g[adapterKey]();
        return null;
      },
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
    const resolvedConfig = config || defaultDocumentTypeConfigRegistry.getConfig('Submittal');
    const combinedOverrides = { ...options.adapters, ...overrides };

    const context: DocumentActionContext = {
      ...options,
      config: resolvedConfig
    };

    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {};

    const resolvers: Record<keyof ContextAdapters, () => any> = {
      logRepository: () => {
        if (combinedOverrides.logRepository !== undefined) return combinedOverrides.logRepository;
        const Ctor = FakeLogRepoClass || g.FakeLogRepository;
        if (!Ctor) throw new Error('FakeLogRepository unavailable in current test environment');
        return new Ctor();
      },
      driveFilingRepository: () => {
        if (combinedOverrides.driveFilingRepository !== undefined) return combinedOverrides.driveFilingRepository;
        const Ctor = FakeDriveFilingRepoClass || g.FakeDriveFilingRepository;
        if (!Ctor) throw new Error('FakeDriveFilingRepository unavailable in current test environment');
        return new Ctor();
      },
      pdfDocumentService: () => {
        if (combinedOverrides.pdfDocumentService !== undefined) return combinedOverrides.pdfDocumentService;
        const Ctor = FakePdfServiceClass || g.FakePdfDocumentService;
        if (!Ctor) throw new Error('FakePdfDocumentService unavailable in current test environment');
        return new Ctor();
      },
      aiAnalysisService: () => {
        if (combinedOverrides.aiAnalysisService !== undefined) return combinedOverrides.aiAnalysisService;
        const Ctor = FakeAiAdapterClass || g.FakeAiAnalysisAdapter;
        if (!Ctor) throw new Error('FakeAiAnalysisAdapter unavailable in current test environment');
        return new Ctor();
      },
      };

    context.adapters = this.setupLazyAdapters(context, resolvers);
    return context;
  }
}

export function createTestContext(
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
