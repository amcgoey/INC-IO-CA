/**
 * @file ValidationHookRegistry.ts
 * @description Central Tier 1 registry mapping validation hook identifier keys to validation functions.
 * Pure core logic: zero GAS globals, zero Node.js built-in imports.
 */

export type ValidationHookFn = (rawDoc: any, context?: any) => any;

export class ValidationHookRegistry {
  private hooks: Map<string, ValidationHookFn>;

  constructor() {
    this.hooks = new Map<string, ValidationHookFn>();
  }

  /**
   * Registers a validation hook function under a unique key.
   */
  public registerHook(key: string, fn: ValidationHookFn): void {
    if (!key || typeof key !== 'string' || key.trim() === '') {
      throw new Error('Validation hook key must be a non-empty string');
    }
    if (typeof fn !== 'function') {
      throw new Error('Validation hook must be a callable function');
    }
    this.hooks.set(key.trim(), fn);
  }

  /**
   * Retrieves a validation hook function by key.
   */
  public getHook(key: string): ValidationHookFn | undefined {
    if (!key || typeof key !== 'string') return undefined;
    return this.hooks.get(key.trim());
  }

  /**
   * Checks whether a validation hook key is registered.
   */
  public hasHook(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    return this.hooks.has(key.trim());
  }

  /**
   * Removes a registered validation hook by key.
   */
  public removeHook(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    return this.hooks.delete(key.trim());
  }

  /**
   * Clears all registered validation hooks.
   */
  public clearHooks(): void {
    this.hooks.clear();
  }

  /**
   * Returns all registered hook keys.
   */
  public getAllHookKeys(): string[] {
    return Array.from(this.hooks.keys());
  }
}

export const defaultValidationHookRegistry = new ValidationHookRegistry();
