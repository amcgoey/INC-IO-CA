import { describe, it, expect } from 'vitest';
import { PipelineBuilder } from '../../../src/core/workflow/PipelineBuilder';
import { ActionRegistry } from '../../../src/core/workflow/ActionRegistry';
import { WorkflowTriggerSpec } from '../../../src/core/specs/DocumentTypeSpec';

describe('PipelineBuilder', () => {
  it('builds a pipeline matching specific trigger over default', () => {
    const registry = new ActionRegistry();
    const mockAction1 = { execute: () => {} };
    const mockAction2 = { execute: () => {} };
    registry.register('Action1', mockAction1);
    registry.register('Action2', mockAction2);

    const builder = new PipelineBuilder(registry);

    const workflows: WorkflowTriggerSpec[] = [
      { context: 'intake_submit', isDefault: true, sequence: ['Action1'] },
      { context: 'intake_submit', fieldMatches: { role: 'admin' }, sequence: ['Action1', 'Action2'] }
    ];

    const ctx = { triggerContext: 'intake_submit', fieldValues: { role: 'admin' } };
    const pipeline = builder.buildPipeline(workflows, ctx);

    expect(pipeline).toEqual([mockAction1, mockAction2]);
  });

  it('falls back to default trigger if no specific trigger matches', () => {
    const registry = new ActionRegistry();
    const mockAction1 = { execute: () => {} };
    registry.register('Action1', mockAction1);

    const builder = new PipelineBuilder(registry);

    const workflows: WorkflowTriggerSpec[] = [
      { context: 'intake_submit', isDefault: true, sequence: ['Action1'] },
      { context: 'intake_submit', fieldMatches: { role: 'admin' }, sequence: ['Action1', 'Action1'] }
    ];

    const ctx = { triggerContext: 'intake_submit', fieldValues: { role: 'user' } };
    const pipeline = builder.buildPipeline(workflows, ctx);

    expect(pipeline).toEqual([mockAction1]);
  });

  it('returns empty array if no trigger matches', () => {
    const registry = new ActionRegistry();
    const builder = new PipelineBuilder(registry);
    
    const workflows: WorkflowTriggerSpec[] = [
      { context: 'other_context', sequence: ['Action1'] }
    ];

    const ctx = { triggerContext: 'intake_submit', fieldValues: {} };
    const pipeline = builder.buildPipeline(workflows, ctx);

    expect(pipeline).toEqual([]);
  });

  it('throws error if workflow sequence references an unknown action', () => {
    const registry = new ActionRegistry();
    const builder = new PipelineBuilder(registry);

    const workflows: WorkflowTriggerSpec[] = [
      { context: 'intake_submit', sequence: ['UnknownAction'] }
    ];

    const ctx = { triggerContext: 'intake_submit', fieldValues: {} };
    
    expect(() => builder.buildPipeline(workflows, ctx)).toThrowError('Action not found for key: UnknownAction');
  });
});
