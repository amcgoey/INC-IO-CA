/// <reference path="../../types.ts" />
/**
 * @file PipelineBuilder.ts
 * @description Builds execution pipelines by scanning WorkflowSpec[] and mapping strings to actions.
 */

import { ActionRegistry, defaultActionRegistry } from './ActionRegistry';
import { WorkflowTriggerMatcher, MatcherContext } from './WorkflowTriggerMatcher';
import { WorkflowTriggerSpec } from '../specs/DocumentTypeSpec';
import { DocumentAction } from '../../types';
import { WorkflowRunner, RenameDocumentAction } from './WorkflowRunner';
import { getActionPolicy, getDocumentTitle, buildDirectRowUrl } from './WorkflowPolicy';
import { defaultDocumentTypeSpecRegistry } from '../specs/DocumentTypeSpecRegistry';
import { WriteLogAction } from '../../WriteLogAction';
import { ReadLogAction } from '../../ReadLogAction';
import { MoveDocumentAction } from './MoveDocumentAction';
import { DuplicateDocumentAction } from './DuplicateDocumentAction';
import { ExtractPagesAction } from './ExtractPagesAction';
import { InsertPagesAction } from '../../InsertPagesAction';
import { defaultTriageDocumentAction } from '../../TriageDocumentAction';
import { defaultAnalyzeDocumentAction } from '../../AnalyzeDocumentAction';

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
   * Ensures standard core actions are registered on the provided registry.
   */
  public static ensureStandardActions(registry: ActionRegistry): void {
    if (!registry.has('WriteLog')) registry.register('WriteLog', new WriteLogAction());
    if (!registry.has('ReadLog')) registry.register('ReadLog', new ReadLogAction());
    if (!registry.has('MoveDocument')) registry.register('MoveDocument', new MoveDocumentAction());
    if (!registry.has('DuplicateDocument')) registry.register('DuplicateDocument', new DuplicateDocumentAction());
    if (!registry.has('ExtractPages')) registry.register('ExtractPages', new ExtractPagesAction());
    if (!registry.has('InsertPages')) registry.register('InsertPages', new InsertPagesAction());
    if (!registry.has('RenameDocument')) registry.register('RenameDocument', new RenameDocumentAction());
    if (!registry.has('TriageDocument') && defaultTriageDocumentAction) {
      registry.register('TriageDocument', defaultTriageDocumentAction);
    }
    if (!registry.has('AnalyzeDocument') && defaultAnalyzeDocumentAction) {
      registry.register('AnalyzeDocument', defaultAnalyzeDocumentAction);
    }
  }

  /**
   * Builds and executes the workflow pipeline for the given DocumentWorkflowInput.
   */
  public static async buildAndExecute(input: DocumentWorkflowInput): Promise<DocumentWorkflowResult> {
    const registry = (globalThis as any).actionRegistry || defaultActionRegistry;
    PipelineBuilder.ensureStandardActions(registry);

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

    const configRegistry = (globalThis as any).defaultDocumentTypeConfigRegistry || (typeof defaultDocumentTypeConfigRegistry !== 'undefined' ? defaultDocumentTypeConfigRegistry : null);
    const docType = doc?.documentType || doc?.disciplineDetails?.discipline;
    const config = (configRegistry && docType && configRegistry.hasConfig(docType))
      ? configRegistry.getConfig(docType)
      : null;

    let workflows = config?.logStrategy?.spec?.workflows || [];
    if (!workflows || workflows.length === 0) {
      const spec = defaultDocumentTypeSpecRegistry.getSpec(docType || 'SUBMITTAL_ARCH');
      workflows = spec?.workflows || [];
    }

    let actions = builder.buildPipeline(workflows, ctx);
    if (actions.length === 0) {
      if (registry.has('WriteLog')) {
        actions = [registry.get('WriteLog')];
      }
    }

    const policy = getActionPolicy(doc?.action || input.selectedAction?.action || 'Received');

    const initialContext: DocumentActionContext = {
      ...input,
      fileId: input.driveFileId || '',
      document: doc,
      config: config || undefined,
      spreadsheetId: input.logFileId,
      sheetId: input.logSheetId,
      strategy: config?.logStrategy,
      policy,
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
