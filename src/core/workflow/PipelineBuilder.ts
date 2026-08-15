/// <reference path="../../types.ts" />
/**
 * @file PipelineBuilder.ts
 * @description Builds execution pipelines by scanning WorkflowSpec[] and mapping strings to actions.
 */

import { ActionRegistry, defaultActionRegistry } from './ActionRegistry';
import { WorkflowTriggerMatcher, MatcherContext } from './WorkflowTriggerMatcher';
import { WorkflowTriggerSpec } from '../specs/DocumentTypeSpec';
import { DocumentAction } from '../../types';
import { WorkflowRunner } from './WorkflowRunner';
import { getActionPolicy, getDocumentTitle, buildDirectRowUrl } from './WorkflowPolicy';
import { defaultDocumentTypeSpecRegistry } from '../specs/DocumentTypeSpecRegistry';
import { defaultDocumentTypeConfigRegistry } from '../../DocumentTypeConfigRegistry';

export class PipelineBuilder {
  private registry: ActionRegistry;
  private matcher: WorkflowTriggerMatcher;

  constructor(registry: ActionRegistry) {
    this.registry = registry;
    this.matcher = new WorkflowTriggerMatcher();
  }

  /**
   * Scans workflows, resolves the matching trigger, and maps its sequence to an array of DocumentActions.
   */
  public buildPipeline(workflows: WorkflowTriggerSpec[], context: MatcherContext): DocumentAction[] {
    const matchedTrigger = this.matcher.findMatch(workflows, context);
    if (!matchedTrigger) {
      return [];
    }
    return matchedTrigger.sequence.map(key => this.registry.get(key));
  }

  /**
   * Builds and executes the workflow pipeline for the given DocumentWorkflowInput.
   */
  public static async buildAndExecute(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const registry = defaultActionRegistry;
    const builder = new PipelineBuilder(registry);

    const doc = input.validatedDoc;
    const triggerContext = doc?.action || (input.selectedAction?.action) || 'intake_submit';
    const ctx: MatcherContext = {
      triggerContext,
      fieldValues: {
        ...(doc?.disciplineDetails || {}),
        ...doc,
        action: doc?.action || input.selectedAction?.action || ''
      }
    };

    const docType = doc?.documentType || doc?.disciplineDetails?.discipline || 'SUBMITTAL_ARCH';
    const config = defaultDocumentTypeConfigRegistry.hasConfig(docType)
      ? defaultDocumentTypeConfigRegistry.getConfig(docType)
      : undefined;

    const spec = defaultDocumentTypeSpecRegistry.getSpec(docType);
    const workflows = spec?.workflows || [];

    const actions = builder.buildPipeline(workflows, ctx);

    const policy = getActionPolicy(doc?.action || input.selectedAction?.action || 'Received');

    const initialContext: DocumentActionContext = {
      ...input,
      fileId: input.driveFileId || '',
      document: doc,
      config,
      spreadsheetId: input.logFileId,
      sheetId: input.logSheetId,
      strategy: config?.logStrategy,
      adapters: {
        logRepository: input.logRepository,
        driveFilingRepository: input.driveFilingRepository
      }
    };

    const finalContext = await WorkflowRunner.run(actions, initialContext, policy);

    return {
      success: true,
      action: doc?.action || input.selectedAction?.action || '',
      newFileName: finalContext.newFileName || '',
      url: finalContext.url || finalContext.driveFileUrl || '',
      groupKey: finalContext.groupKey || '',
      previousRowSheetIndex: finalContext.previousRowSheetIndex ?? null,
      revGroupKey: finalContext.revGroupKey || '',
      targetKey: finalContext.targetKey || '',
      fileId: finalContext.fileId || finalContext.driveFileId || initialContext.fileId || '',
      title: finalContext.title || getDocumentTitle(doc) || doc?.title || '',
      projectAbbr: input.projectAbbr || '',
      directRowUrl: finalContext.directRowUrl || (finalContext.rowIndex ? buildDirectRowUrl(input.logFileId, finalContext.rowIndex, input.logSheetId) : ''),
      failedColumns: finalContext.failedColumns || [],
      emptyFallbacks: finalContext.emptyFallbacks || input.emptyFallbacks || [],
      localPath: finalContext.localPath || ''
    };
  }
}
