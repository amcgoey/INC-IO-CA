import { describe, it, expect } from 'vitest';
import { WorkflowTriggerMatcher, MatcherContext } from '../../../src/core/workflow/WorkflowTriggerMatcher';

describe('WorkflowTriggerMatcher', () => {
  const matcher = new WorkflowTriggerMatcher();

  it('matches context exactly', () => {
    const trigger = { context: 'intake_submit', sequence: [] };
    const ctx: MatcherContext = { triggerContext: 'intake_submit', fieldValues: {} };
    expect(matcher.match(trigger, ctx)).toBe(true);
  });

  it('fails if context does not match', () => {
    const trigger = { context: 'intake_submit', sequence: [] };
    const ctx: MatcherContext = { triggerContext: 'other', fieldValues: {} };
    expect(matcher.match(trigger, ctx)).toBe(false);
  });

  it('matches context and fieldValues', () => {
    const trigger = { 
      context: 'intake_submit', 
      fieldMatches: [
        { field: 'action', value: 'Received' },
        { field: 'priority', value: 'High' }
      ], 
      sequence: [] 
    };
    const ctx: MatcherContext = { 
      triggerContext: 'intake_submit', 
      fieldValues: { action: 'Received', priority: 'High', other: 'Ignored' } 
    };
    expect(matcher.match(trigger, ctx)).toBe(true);
  });

  it('fails if fieldValues do not match', () => {
    const trigger = { 
      context: 'intake_submit', 
      fieldMatches: [{ field: 'action', value: 'Received' }], 
      sequence: [] 
    };
    const ctx: MatcherContext = { 
      triggerContext: 'intake_submit', 
      fieldValues: { action: 'Action_Not_Matched' } 
    };
    expect(matcher.match(trigger, ctx)).toBe(false);
  });

  it('matches default trigger when isDefault is true', () => {
    const trigger = { context: 'intake_submit', isDefault: true, sequence: [] };
    const ctx: MatcherContext = { triggerContext: 'intake_submit', fieldValues: {} };
    expect(matcher.match(trigger, ctx)).toBe(true);
  });

  it('findMatch prioritizes exact match over isDefault', () => {
    const defaultTrigger = { context: 'intake_submit', isDefault: true, sequence: ['DefaultAction'] };
    const exactTrigger = { 
      context: 'intake_submit', 
      fieldMatches: [{ field: 'action', value: 'Received' }], 
      sequence: ['ReceivedAction'] 
    };
    const ctx: MatcherContext = { triggerContext: 'intake_submit', fieldValues: { action: 'Received' } };
    const matched = matcher.findMatch([defaultTrigger, exactTrigger], ctx);
    expect(matched).toBe(exactTrigger);
  });

  it('findMatch falls back to isDefault when exact does not match', () => {
    const defaultTrigger = { context: 'intake_submit', isDefault: true, sequence: ['DefaultAction'] };
    const exactTrigger = { 
      context: 'intake_submit', 
      fieldMatches: [{ field: 'action', value: 'Received' }], 
      sequence: ['ReceivedAction'] 
    };
    const ctx: MatcherContext = { triggerContext: 'intake_submit', fieldValues: { action: 'Approved' } };
    const matched = matcher.findMatch([defaultTrigger, exactTrigger], ctx);
    expect(matched).toBe(defaultTrigger);
  });
});
