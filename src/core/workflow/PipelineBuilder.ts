/**
 * @file PipelineBuilder.ts
 * @description Builds execution pipelines by scanning WorkflowSpec[] and mapping strings to actions.
 */

import { ActionRegistry } from './ActionRegistry';
import { WorkflowTriggerMatcher, MatcherContext } from './WorkflowTriggerMatcher';
import { WorkflowTriggerSpec } from '../specs/DocumentTypeSpec';



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
    let defaultTrigger: WorkflowTriggerSpec | null = null;

    // Prioritize exact match without isDefault
    for (const trigger of workflows) {
      if (this.matcher.match(trigger, context)) {
        if (!trigger.isDefault) {
          return trigger.sequence.map(key => this.registry.get(key));
        } else {
          defaultTrigger = trigger;
        }
      }
    }

    // Fall back to isDefault trigger if present
    if (defaultTrigger) {
      return defaultTrigger.sequence.map(key => this.registry.get(key));
    }

    return [];
  }
}

