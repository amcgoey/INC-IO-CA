import { describe, it, expect, beforeEach } from 'vitest';
import { ActionRegistry } from '../../../src/core/workflow/ActionRegistry';

describe('ActionRegistry', () => {
  let registry: ActionRegistry;

  beforeEach(() => {
    registry = new ActionRegistry();
  });

  it('registers and retrieves a valid action', () => {
    const mockAction = { execute: () => {} };
    registry.register('WriteLog', mockAction);
    expect(registry.get('WriteLog')).toBe(mockAction);
  });

  it('throws error when retrieving an unregistered action', () => {
    expect(() => registry.get('UnknownAction')).toThrowError('Action not found for key: UnknownAction');
  });

  it('throws error when registering an invalid action', () => {
    expect(() => registry.register('BadAction', {})).toThrowError('Invalid action provided for key: BadAction');
  });

  it('throws error when registering with empty key', () => {
    expect(() => registry.register('', { execute: () => {} })).toThrowError('Action key cannot be empty');
  });

  it('resets correctly', () => {
    const mockAction = { execute: () => {} };
    registry.register('WriteLog', mockAction);
    registry.reset();
    expect(() => registry.get('WriteLog')).toThrowError();
  });
});
