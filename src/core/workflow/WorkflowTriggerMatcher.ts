/**
 * @file WorkflowTriggerMatcher.ts
 * @description Pure Tier 1 matcher evaluating WorkflowTriggerSpec against MatcherContext.
 */

import { WorkflowTriggerSpec, FieldMatchRule } from '../specs/DocumentTypeSpec';

export interface MatcherContext {
  triggerContext: string;
  fieldValues: Record<string, any>;
}

export class WorkflowTriggerMatcher {
  /**
   * Evaluates if a given WorkflowTriggerSpec matches the current context.
   * Evaluates context, fieldMatches (array of FieldMatchRule), and isDefault flags.
   */
  public match(trigger: WorkflowTriggerSpec, context: MatcherContext): boolean {
    if (trigger.context !== context.triggerContext) {
      return false;
    }

    if (trigger.fieldMatches && trigger.fieldMatches.length > 0) {
      for (const rule of trigger.fieldMatches) {
        if (context.fieldValues[rule.field] !== rule.value) {
          return false;
        }
      }
      return true;
    }

    return trigger.isDefault === true || !trigger.fieldMatches;
  }

  /**
   * Finds the best matching WorkflowTriggerSpec from a list of triggers.
   * Evaluates context, fieldMatches (array of FieldMatchRule), and isDefault fallback.
   */
  public findMatch(triggers: WorkflowTriggerSpec[], context: MatcherContext): WorkflowTriggerSpec | null {
    let defaultTrigger: WorkflowTriggerSpec | null = null;

    for (const trigger of triggers) {
      if (trigger.context !== context.triggerContext) {
        continue;
      }

      if (trigger.fieldMatches && trigger.fieldMatches.length > 0) {
        if (this.match(trigger, context)) {
          return trigger;
        }
      } else if (trigger.isDefault) {
        defaultTrigger = trigger;
      } else if (!defaultTrigger) {
        defaultTrigger = trigger;
      }
    }

    return defaultTrigger;
  }
}
