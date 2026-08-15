/**
 * @file ActionRegistry.ts
 * @description Injectable registry for mapping string keys to DocumentAction instances.
 */

import { WriteLogAction } from '../../WriteLogAction';
import { ReadLogAction } from '../../ReadLogAction';
import { MoveDocumentAction } from './MoveDocumentAction';
import { DuplicateDocumentAction } from './DuplicateDocumentAction';
import { ExtractPagesAction } from './ExtractPagesAction';
import { InsertPagesAction } from '../../InsertPagesAction';
import { RenameDocumentAction } from './WorkflowRunner';
import { defaultTriageDocumentAction } from '../../TriageDocumentAction';
import { defaultAnalyzeDocumentAction } from '../../AnalyzeDocumentAction';

export class ActionRegistry {
  private actions = new Map<string, DocumentAction>();

  public has(key: string): boolean {
    return this.actions.has(key);
  }

  public register(key: string, action: any): void {
    if (!key) throw new Error("Action key cannot be empty");
    if (!action || typeof action.execute !== "function") {
      throw new Error(`Invalid action provided for key: ${key}`);
    }
    this.actions.set(key, action);
  }

  public get(key: string): any {
    if (!this.actions.has(key)) {
      throw new Error(`Action not found for key: ${key}`);
    }
    return this.actions.get(key)!;
  }

  public reset(): void {
    this.actions.clear();
  }
}

export function populateDefaultActionRegistry(registry: ActionRegistry): void {
  registry.register("WriteLog", new WriteLogAction());
  registry.register("ReadLog", new ReadLogAction());
  registry.register("MoveDocument", new MoveDocumentAction());
  registry.register("DuplicateDocument", new DuplicateDocumentAction());
  registry.register("ExtractPages", new ExtractPagesAction());
  registry.register("InsertPages", new InsertPagesAction());
  registry.register("RenameDocument", new RenameDocumentAction());
  if (defaultTriageDocumentAction) registry.register("TriageDocument", defaultTriageDocumentAction);
  if (defaultAnalyzeDocumentAction) registry.register("AnalyzeDocument", defaultAnalyzeDocumentAction);
}

export const defaultActionRegistry = new ActionRegistry();
populateDefaultActionRegistry(defaultActionRegistry);
