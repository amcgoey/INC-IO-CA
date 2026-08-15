/**
 * @file WorkflowTriggerMatcher.ts
 * @description Pure Tier 1 matcher evaluating WorkflowSpec against MatcherContext.
 */

import { WorkflowSpec, FieldMatchRule } from '../specs/DocumentTypeSpec';

export interface MatcherContext {
  triggerContext: string;
  fieldValues: Record<string, any>;
}

export class WorkflowTriggerMatcher {
  /**
   * Evaluates if a given WorkflowSpec matches the current context.
   * Evaluates context, fieldMatches (array of FieldMatchRule), and isDefault flags.
   */
  public match(trigger: WorkflowSpec, context: MatcherContext): boolean {
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
   * Finds the best matching WorkflowSpec from a list of triggers.
   * Evaluates context, fieldMatches (array of FieldMatchRule), and isDefault fallback.
   */
  public findMatch(triggers: WorkflowSpec[], context: MatcherContext): WorkflowSpec | null {
    let defaultTrigger: WorkflowSpec | null = null;

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
