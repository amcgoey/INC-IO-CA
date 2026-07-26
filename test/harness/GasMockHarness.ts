import { MockDriveState, MockDriveApp } from "./MockDrive";
/**
 * @file GasMockHarness.ts
 * @description Centralized testing infrastructure harness managing globalThis stubs for CONFIG, CacheService, and PropertiesService with explicit lifecycle methods.
*/

declare const CONFIG: any;
const DEFAULT_CONFIG = typeof require !== 'undefined' ? require('../../src/Config').CONFIG : (globalThis as any).CONFIG;

export interface CallLog {
  method: string;
  args: unknown[];
  timestamp: number;
}

export class MockPropertiesStore {
  private store: Map<string, string> = new Map();
  public calls: CallLog[] = [];

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  public getProperty(key: string): string | null {
    this.recordCall("getProperty", [key]);
    return this.store.get(key) ?? null;
  }


 public setProperty(key: string, value: string): this {
    this.recordCall("setProperty", [key, value]);
    this.store.set(key, String(value));
    return this;
  }


  public getProperties(): Record<string, string> {
    this.recordCall("getProperties", []);
    const result: Record<string, string> = {};
    for (const [k, v] of this.store.entries()) {
      result[k] = v;
    }
    return result;
  }

  public setProperties(properties: Record<string, string>, deleteAllOthers: boolean = false): this {
    this.recordCall("setProperties", [properties, deleteAllOthers]);
    if (deleteAllOthers) {
      this.store.clear();
    }
    for (const [k, v] of Object.entries(properties)) {
      this.store.set(k, String(v));
    }
    return this;
  }


 public deleteProperty(key: string): this {
    this.recordCall("deleteProperty", [key]);
    this.store.delete(key);
    return this;
  }


 public deleteAllProperties(): this {
    this.recordCall("deleteAllProperties", []);
    this.store.clear();
    return this;
  }


  public getKeys(): string[] {
    this.recordCall("getKeys", []);
    return Array.from(this.store.keys());
  }

  public reset(): void {
    this.store.clear();
    this.calls = [];
  }
}

export class MockPropertiesService {
  public scriptProperties: MockPropertiesStore = new MockPropertiesStore();
  public userProperties: MockPropertiesStore = new MockPropertiesStore();
  public documentProperties: MockPropertiesStore = new MockPropertiesStore();

  public getScriptProperties(): MockPropertiesStore {
    return this.scriptProperties;
  }


 public getUserProperties(): MockPropertiesStore {
    return this.userProperties;
  }

  public getDocumentProperties(): MockPropertiesStore {
    return this.documentProperties;
  }


 public reset(): void {
    this.scriptProperties.reset();
    this.userProperties.reset();
    this.documentProperties.reset();
  }
}

interface CacheEntry {
  value: string;
  expiresAt: number | null;
}

export class MockCacheStore {
  private store: Map<string, CacheEntry> = new Map();
  public calls: CallLog[] = [];

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }


  public get(key: string): string | null {
    this.recordCall("get", [key]);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }


  public put(key: string, value: string, expirationInSeconds?: number): void {
    this.recordCall("put", [key, value, expirationInSeconds]);
    let expiresAt: number | null = null;
    if (expirationInSeconds !== undefined) {
      if (expirationInSeconds <= 0) {
        this.store.delete(key);
        return;
      }
      expiresAt = Date.now() + expirationInSeconds * 1000;
    }
    this.store.set(key, { value: String(value), expiresAt });
  }


 public remove(key: string): void {
    this.recordCall("remove", [key]);
    this.store.delete(key);
  }


 public removeAll(keys: string[]): void {
    this.recordCall("removeAll", [keys]);
    for (const key of keys) {
      this.store.delete(key);
    }
  }


 public getAll(keys: string[]): Record<string, string> {
    this.recordCall("getAll", [keys]);
    const result: Record<string, string> = {};
    for (const key of keys) {
      const val = this.get(key);
      if (val !== null) {
        result[key] = val;
      }
    }
    return result;
  }


  public putAll(values: Record<string, string>, expirationInSeconds?: number): void {
    this.recordCall("putAll", [values, expirationInSeconds]);
    for (const [k, v] of Object.entries(values)) {
      this.put(k, v, expirationInSeconds);
    }
  }


 public reset(): void {
    this.store.clear();
    this.calls = [];
  }
}

export class MockCacheService {
  public userCache: MockCacheStore = new MockCacheStore();
  public scriptCache: MockCacheStore = new MockCacheStore();
  public documentCache: MockCacheStore = new MockCacheStore();

  public getUserCache(): MockCacheStore {
    return this.userCache;
  }


  public getScriptCache(): MockCacheStore {
    return this.scriptCache;
  }

  public getDocumentCache(): MockCacheStore {
    return this.documentCache;
  }


 public reset(): void {
    this.userCache.reset();
    this.scriptCache.reset();
    this.documentCache.reset();
  }
}

export interface HarnessInstallOptions {
  configOverrides?: Record<string, unknown>;
}

export class GasMockHarness {
  private static instance: GasMockHarness | null = null;
  private static originalGlobals: Map<string, unknown> = new Map();

  public propertiesService: MockPropertiesService = new MockPropertiesService();
  public cacheService: MockCacheService = new MockCacheService();
  public driveState: MockDriveState = new MockDriveState();
  public config: Record<string, unknown> = {};
  private configOverrides: Record<string, unknown> = {};

  private constructor(options?: HarnessInstallOptions) {
    this.configOverrides = options?.configOverrides || {};
    this.resetConfig();
  }

  private resetConfig(): void {
    const defaultDescriptors = Object.getOwnPropertyDescriptors(DEFAULT_CONFIG || {});
    const overrideDescriptors: Record<string, PropertyDescriptor> = {};

    for (const [key, val] of Object.entries(this.configOverrides)) {
      overrideDescriptors[key] = {
        value: val,
        writable: true,
        enumerable: true,
        configurable: true
      };
    }

    this.config = Object.defineProperties({}, {
      ...defaultDescriptors,
      ...overrideDescriptors
    });
  }

  public static install(options?: HarnessInstallOptions): GasMockHarness {
    if (!GasMockHarness.instance) {
      GasMockHarness.instance = new GasMockHarness(options);
    } else {
      if (options?.configOverrides) {
        GasMockHarness.instance.configOverrides = options.configOverrides;
      }
      GasMockHarness.reset();
    }

    const globalsToStub = ["CONFIG", "CacheService", "PropertiesService", "DriveApp"];
    for (const name of globalsToStub) {
      if (!GasMockHarness.originalGlobals.has(name)) {
        GasMockHarness.originalGlobals.set(name, (globalThis as any)[name]);
      }
    }

    (globalThis as any).PropertiesService = GasMockHarness.instance.propertiesService;
    (globalThis as any).CacheService = GasMockHarness.instance.cacheService;
    (globalThis as any).CONFIG = GasMockHarness.instance.config;
    (globalThis as any).DriveApp = new MockDriveApp(GasMockHarness.instance.driveState);

    return GasMockHarness.instance;
  }


 public static reset(): void {
    if (!GasMockHarness.instance) {
      GasMockHarness.install();
    }
    GasMockHarness.instance!.propertiesService.reset();
    GasMockHarness.instance!.cacheService.reset();
    GasMockHarness.instance!.driveState.reset();
    GasMockHarness.instance!.configOverrides = {};
    GasMockHarness.instance!.resetConfig();
    (globalThis as any).CONFIG = GasMockHarness.instance!.config;
  }

  public static uninstall(): void {
    for (const [name, originalValue] of GasMockHarness.originalGlobals.entries()) {
      if (originalValue === undefined) {
        delete (globalThis as any)[name];
      } else {
        (globalThis as any)[name] = originalValue;
      }
    }
    GasMockHarness.originalGlobals.clear();
    GasMockHarness.instance = null;
  }


 public get scriptProperties(): MockPropertiesStore {
    return this.propertiesService.getScriptProperties();
  }


 public get userProperties(): MockPropertiesStore {
    return this.propertiesService.getUserProperties();
  }

  public get documentProperties(): MockPropertiesStore {
    return this.propertiesService.getDocumentProperties();
  }


 public get userCache(): MockCacheStore {
    return this.cacheService.getUserCache();
  }


 public get scriptCache(): MockCacheStore {
    return this.cacheService.getScriptCache();
  }

  public getDriveState(): MockDriveState {
    return this.driveState;
  }

  public get documentCache(): MockCacheStore {
    return this.cacheService.getDocumentCache();
  }
}
