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
      fieldMatches: { action: 'Received', priority: 'High' }, 
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
      fieldMatches: { action: 'Received' }, 
      sequence: [] 
    };
    const ctx: MatcherContext = { 
      triggerContext: 'intake_submit', 
      fieldValues: { action: 'Action_Not_Matched' } 
    };
    expect(matcher.match(trigger, ctx)).toBe(false);
  });

  it('matches if isDefault is true and we fallback', () => {
    // Actually the issue says "evaluates context, fieldMatches (array of FieldMatchRule), and isDefault flags."
    // Let me implement fieldMatches as Record<string, any> first because that's what it is in DocumentTypeSpec.ts
  });
});

