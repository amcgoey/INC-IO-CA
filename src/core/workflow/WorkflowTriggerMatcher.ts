/**
 * @file WorkflowTriggerMatcher.ts
 * @description Pure Tier 1 matcher evaluating WorkflowTriggerSpec against MatcherContext.
 */

import { WorkflowTriggerSpec } from '../specs/DocumentTypeSpec';



export interface MatcherContext {
  triggerContext: string;
  fieldValues: Record<string, any>;
}

export class WorkflowTriggerMatcher {
  /**
   * Evaluates if a given WorkflowTriggerSpec matches the current context.
   */
  public match(trigger: WorkflowTriggerSpec, context: MatcherContext): boolean {
    if (trigger.context !== context.triggerContext) {
      return false;
    }

    if (trigger.fieldMatches) {
      for (const [key, expectedValue] of Object.entries(trigger.fieldMatches)) {
        if (context.fieldValues[key] !== expectedValue) {
          return false;
        }
      }
    }

    return true;
  }
}

