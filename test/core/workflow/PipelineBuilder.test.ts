import { describe, it, expect } from 'vitest';
import { PipelineBuilder } from '../../../src/core/workflow/PipelineBuilder';
import { ActionRegistry } from '../../../src/core/workflow/ActionRegistry';
import { DocumentTypeSpecRegistry } from '../../../src/core/specs/DocumentTypeSpecRegistry';
import { DocumentTypeConfigRegistry } from '../../../src/DocumentTypeConfigRegistry';
import { WorkflowSpec } from '../../../src/core/specs/DocumentTypeSpec';

describe('PipelineBuilder', () => {
  it('builds a pipeline matching specific trigger over default', () => {
    const registry = new ActionRegistry();
    const mockAction1 = { execute: () => {} };
    const mockAction2 = { execute: () => {} };
    registry.register('Action1', mockAction1);
    registry.register('Action2', mockAction2);

    const builder = new PipelineBuilder(registry);

    const workflows: WorkflowSpec[] = [
      { context: 'intake_submit', isDefault: true, sequence: ['Action1'] },
      { context: 'intake_submit', fieldMatches: [{ field: 'role', value: 'admin' }], sequence: ['Action1', 'Action2'] }
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

    const workflows: WorkflowSpec[] = [
      { context: 'intake_submit', isDefault: true, sequence: ['Action1'] },
      { context: 'intake_submit', fieldMatches: [{ field: 'role', value: 'admin' }], sequence: ['Action1', 'Action1'] }
    ];

    const ctx = { triggerContext: 'intake_submit', fieldValues: { role: 'user' } };
    const pipeline = builder.buildPipeline(workflows, ctx);

    expect(pipeline).toEqual([mockAction1]);
  });

  it('returns empty array if no trigger matches', () => {
    const registry = new ActionRegistry();
    const builder = new PipelineBuilder(registry);
    
    const workflows: WorkflowSpec[] = [
      { context: 'other_context', sequence: ['Action1'] }
    ];

    const ctx = { triggerContext: 'intake_submit', fieldValues: {} };
    const pipeline = builder.buildPipeline(workflows, ctx);

    expect(pipeline).toEqual([]);
  });

  it('throws error if workflow sequence references an unknown action', () => {
    const registry = new ActionRegistry();
    const builder = new PipelineBuilder(registry);

    const workflows: WorkflowSpec[] = [
      { context: 'intake_submit', sequence: ['UnknownAction'] }
    ];

    const ctx = { triggerContext: 'intake_submit', fieldValues: {} };
    
    expect(() => builder.buildPipeline(workflows, ctx)).toThrowError('Action not found for key: UnknownAction');
  });

  it('buildAndExecute executes pipeline using injected ActionRegistry', async () => {
    const customRegistry = new ActionRegistry();
    let actionExecuted = false;
    const mockAction = {
      execute: async (context: any) => {
        actionExecuted = true;
        return { ...context, newFileName: 'custom.pdf' };
      }
    };
    customRegistry.register('ReadLog', mockAction);
    customRegistry.register('DualDocumentSubmittalFiling', mockAction);
    customRegistry.register('OutgoingSubmittalFiling', mockAction);
    customRegistry.register('MoveDocument', mockAction);
    customRegistry.register('WriteLog', mockAction);
    customRegistry.register('AnalyzeDocument', mockAction);
    customRegistry.register('DraftEmail', mockAction);

    const input: any = {
      validatedDoc: {
        documentType: 'SUBMITTAL_ARCH',
        action: 'Received',
        disciplineDetails: { discipline: 'SUBMITTAL_ARCH' }
      },
      logFileId: 'ss-123',
      driveFileId: 'drive-123',
      targetFolderId: 'folder-123',
      selectedAction: { action: 'Received', abbr: 'REC', status: 'Under Review' }
    };

    const specRegistry = new DocumentTypeSpecRegistry();
    const configRegistry = new DocumentTypeConfigRegistry(specRegistry);
    const result = await PipelineBuilder.buildAndExecute(input, customRegistry, specRegistry, configRegistry);
    expect(result.success).toBe(true);
    expect(actionExecuted).toBe(true);
  });

  it('buildAndExecute forwards deferredFiling, number, rev, and docType from finalContext to result', async () => {
    const customRegistry = new ActionRegistry();
    const mockFilingAction = {
      execute: async (context: any) => ({
        ...context,
        newFileName: '033000-002 Concrete.pdf',
        number: '002',
        rev: 'A',
        docType: 'SUBMITTAL_ARCH',
        deferredFiling: {
          number: '002',
          title: 'Concrete Submittal',
          rev: 'A',
          docType: 'SUBMITTAL_ARCH'
        }
      })
    };
    customRegistry.register('ReadLog', mockFilingAction);
    customRegistry.register('DualDocumentSubmittalFiling', mockFilingAction);
    customRegistry.register('OutgoingSubmittalFiling', mockFilingAction);
    customRegistry.register('MoveDocument', mockFilingAction);
    customRegistry.register('WriteLog', mockFilingAction);
    customRegistry.register('AnalyzeDocument', mockFilingAction);
    customRegistry.register('DraftEmail', mockFilingAction);

    const input: any = {
      validatedDoc: {
        documentType: 'SUBMITTAL_ARCH',
        action: 'Approved',
        disciplineDetails: { discipline: 'SUBMITTAL_ARCH', number: '002', revision: 'A', title: 'Concrete Submittal' }
      },
      logFileId: 'ss-123',
      driveFileId: 'drive-123',
      targetFolderId: 'folder-123',
      selectedAction: { action: 'Approved', abbr: 'APP', status: 'Closed' }
    };

    const specRegistry = new DocumentTypeSpecRegistry();
    const configRegistry = new DocumentTypeConfigRegistry(specRegistry);
    const result = await PipelineBuilder.buildAndExecute(input, customRegistry, specRegistry, configRegistry);

    expect(result.deferredFiling).toEqual({
      number: '002',
      title: 'Concrete Submittal',
      rev: 'A',
      docType: 'SUBMITTAL_ARCH'
    });
    expect(result.number).toBe('002');
    expect(result.rev).toBe('A');
    expect(result.docType).toBe('SUBMITTAL_ARCH');
  });
});
