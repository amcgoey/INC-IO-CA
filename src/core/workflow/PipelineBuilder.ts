/// <reference path="../../types.ts" />
/**
 * @file PipelineBuilder.ts
 * @description Builds execution pipelines by scanning WorkflowSpec[] and mapping strings to actions.
 */

import { ActionRegistry } from './ActionRegistry';
import { WorkflowTriggerMatcher, MatcherContext, resolveWorkflowDirection } from './WorkflowTriggerMatcher';
import { WorkflowSpec } from '../specs/DocumentTypeSpec';
import { DocumentAction } from '../../types';
import { WorkflowRunner } from './WorkflowRunner';
import { getDocumentTitle, buildDirectRowUrl } from './WorkflowPolicy';
import { DocumentTypeSpecRegistry } from '../specs/DocumentTypeSpecRegistry';
import { DocumentTypeConfigRegistry } from '../../DocumentTypeConfigRegistry';

export class PipelineBuilder {
  private registry: ActionRegistry;
  public matcher: WorkflowTriggerMatcher;

  constructor(registry: ActionRegistry) {
    this.registry = registry;
    this.matcher = new WorkflowTriggerMatcher();
  }

  /**
   * Scans workflows, resolves the matching trigger, and maps its sequence to an array of DocumentActions.
   */
  public buildPipeline(workflows: WorkflowSpec[], context: MatcherContext): DocumentAction[] {
    const matchedTrigger = this.matcher.findMatch(workflows, context);
    if (!matchedTrigger) {
      return [];
    }
    return matchedTrigger.sequence.map(key => this.registry.get(key));
  }

  /**
   * Builds and executes the workflow pipeline for the given DocumentWorkflowInput.
   */
  public static async buildAndExecute(
    input: DocumentWorkflowInput,
    registry: ActionRegistry,
    specRegistry: DocumentTypeSpecRegistry,
    configRegistry: DocumentTypeConfigRegistry
  ): Promise<DocumentWorkflowResult> {
    const builder = new PipelineBuilder(registry);

    const doc = input.validatedDoc;
    const actionVal = (input.selectedAction?.action) || doc?.action || '';
    const isIncoming = actionVal.toLowerCase() === 'received' || input.policy?.direction === 'incoming';
    const direction = isIncoming ? 'Incoming' : (actionVal ? 'Outgoing' : undefined);
    const triggerContext = direction || actionVal || 'intake_submit';

    const ctx: MatcherContext = {
      triggerContext,
      hostContext: input.appContext,
      direction,
      fieldValues: {
        ...(doc?.disciplineDetails || {}),
        ...doc,
        action: actionVal
      }
    };

    const disc = String(doc?.disciplineDetails?.discipline || (doc as any)?.discipline || '').toLowerCase();
    const isFfe = disc.includes('ffe') || disc.includes('ff&e') || Boolean(doc?.disciplineDetails?.specTag);

    let docType = isFfe ? 'SUBMITTAL_FFE' : (doc?.documentType || doc?.disciplineDetails?.discipline || 'SUBMITTAL_ARCH');
    if (!isFfe && (docType === 'Submittal' || docType === 'submittal' || !specRegistry.hasSpec(docType))) {
      docType = 'SUBMITTAL_ARCH';
    }

    const config = configRegistry.hasConfig(docType)
      ? configRegistry.getConfig(docType)
      : undefined;

    const spec = specRegistry.getSpec(docType);
    const workflows = spec?.workflows || [];

    const matchedTrigger = builder.matcher.findMatch(workflows, ctx);
    const actions = matchedTrigger ? matchedTrigger.sequence.map(key => registry.get(key)) : [];

    const policy: WorkflowPolicySpec = input.policy || matchedTrigger?.policy || {};

    const initialContext: DocumentActionContext = {
      ...input,
      appContext: input.appContext,
      fileId: input.driveFileId || '',
      document: doc,
      config,
      policy,
      spreadsheetId: input.logFileId,
      sheetId: input.logSheetId,
      strategy: config?.logStrategy,
      adapters: {
        logRepository: input.logRepository || (globalThis as any).defaultLogRepository,
        driveFilingRepository: input.driveFilingRepository || (globalThis as any).defaultDriveFilingRepository,
        pdfDocumentService: input.pdfDocumentService || (globalThis as any).defaultPdfDocumentService,
        ...(input as any).adapters
      }
    };

    const finalContext = await WorkflowRunner.run(actions, initialContext);

    return {
      success: true,
      action: doc?.action || input.selectedAction?.action || '',
      newFileName: finalContext.newFileName || '',
      url: finalContext.url || finalContext.driveFileUrl || '',
      draftUrl: finalContext.draftUrl || '',
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
      localPath: finalContext.localPath || '',
      policy: finalContext.policy || policy,
      notes: finalContext.notes || doc?.notes || ''
    };
  }
}
