import { describe, it, expect, beforeEach } from 'vitest';
import {
  ValidationHookRegistry,
  defaultValidationHookRegistry,
  type ValidationHookFn,
} from '../../../src/core/specs/ValidationHookRegistry';

describe('ValidationHookRegistry', () => {
  let registry: ValidationHookRegistry;

  beforeEach(() => {
    registry = new ValidationHookRegistry();
  });

  it('should register and retrieve a validation hook by key', () => {
    const dummyHook: ValidationHookFn = (rawDoc) => {
      return { status: 'success', rawDoc };
    };

    registry.registerHook('ArchStrategyValidationHook', dummyHook);

    expect(registry.hasHook('ArchStrategyValidationHook')).toBe(true);
    expect(registry.getHook('ArchStrategyValidationHook')).toBe(dummyHook);
  });

  it('should return undefined and false for unregistered hook keys', () => {
    expect(registry.hasHook('NonExistentHook')).toBe(false);
    expect(registry.getHook('NonExistentHook')).toBeUndefined();
  });

  it('should throw or reject invalid hook registration arguments', () => {
    expect(() => registry.registerHook('', (() => {}) as any)).toThrow();
    expect(() => registry.registerHook('Test', null as any)).toThrow();
  });

  it('should allow removing a registered hook', () => {
    const dummyHook: ValidationHookFn = () => {};
    registry.registerHook('HookToRemove', dummyHook);
    expect(registry.hasHook('HookToRemove')).toBe(true);

    const removed = registry.removeHook('HookToRemove');
    expect(removed).toBe(true);
    expect(registry.hasHook('HookToRemove')).toBe(false);
  });

  it('should return all registered hook keys and support clearHooks', () => {
    registry.registerHook('Hook1', () => {});
    registry.registerHook('Hook2', () => {});

    expect(registry.getAllHookKeys()).toEqual(['Hook1', 'Hook2']);

    registry.clearHooks();
    expect(registry.getAllHookKeys()).toEqual([]);
  });

  it('should export a default singleton registry instance', () => {
    expect(defaultValidationHookRegistry).toBeInstanceOf(ValidationHookRegistry);
  });
});
