/**
 * @file WorkflowTriggerMatcher.ts
 * @description Pure Tier 1 matcher evaluating WorkflowSpec against MatcherContext with direction-driven resolution.
 * Zero GAS globals, zero Node.js built-in imports (ADR-0013).
 */

import { WorkflowSpec, FieldMatchRule } from '../specs/DocumentTypeSpec';

export interface MatcherContext {
  triggerContext?: string;
  hostContext?: string;
  direction?: 'Incoming' | 'Outgoing' | string;
  fieldValues?: Record<string, any>;
  [key: string]: any;
}

export function resolveWorkflowDirection(context: MatcherContext): string | undefined {
  if (context.direction) {
    const dirLower = context.direction.toLowerCase();
    return dirLower === 'incoming' ? 'Incoming' : (dirLower === 'outgoing' ? 'Outgoing' : context.direction);
  }

  const actionVal = context.fieldValues?.action || (
    context.triggerContext &&
    context.triggerContext !== 'GoogleDrive' &&
    context.triggerContext !== 'Gmail' &&
    context.triggerContext !== 'GoogleSheets' &&
    context.triggerContext !== 'intake_submit'
      ? context.triggerContext
      : undefined
  );

  if (actionVal) {
    return actionVal.toLowerCase() === 'received' ? 'Incoming' : 'Outgoing';
  }

  if (context.triggerContext === 'Incoming' || context.triggerContext === 'Outgoing') {
    return context.triggerContext;
  }

  return undefined;
}

export class WorkflowTriggerMatcher {
  /**
   * Evaluates if a given WorkflowSpec matches the current context.
   * Evaluates context, direction, hostContext, fieldMatches, and isDefault fallback.
   */
  public match(trigger: WorkflowSpec, context: MatcherContext): boolean {
    const direction = resolveWorkflowDirection(context);

    const isContextMatch =
      trigger.context === context.triggerContext ||
      (direction !== undefined && trigger.context.toLowerCase() === direction.toLowerCase()) ||
      (context.hostContext !== undefined && trigger.context === context.hostContext);

    if (!isContextMatch && !trigger.isDefault) {
      return false;
    }

    if (trigger.fieldMatches && trigger.fieldMatches.length > 0) {
      for (const rule of trigger.fieldMatches) {
        if (!context.fieldValues || context.fieldValues[rule.field] !== rule.value) {
          return false;
        }
      }
      return true;
    }

    return isContextMatch || trigger.isDefault === true;
  }

  /**
   * Finds the best matching WorkflowSpec from a list of triggers.
   * Evaluates direction, hostContext, fieldMatches, and isDefault fallback.
   */
  public findMatch(triggers: WorkflowSpec[], context: MatcherContext): WorkflowSpec | null {
    let defaultTrigger: WorkflowSpec | null = null;
    let contextDefaultTrigger: WorkflowSpec | null = null;
    const direction = resolveWorkflowDirection(context);

    for (const trigger of triggers) {
      const isContextMatch =
        trigger.context === context.triggerContext ||
        (direction !== undefined && trigger.context.toLowerCase() === direction.toLowerCase()) ||
        (context.hostContext !== undefined && trigger.context === context.hostContext);

      if (trigger.isDefault && !defaultTrigger) {
        defaultTrigger = trigger;
      }

      if (!isContextMatch) {
        continue;
      }

      if (trigger.fieldMatches && trigger.fieldMatches.length > 0) {
        if (this.match(trigger, context)) {
          return trigger;
        }
      } else if (trigger.isDefault) {
        contextDefaultTrigger = trigger;
      } else if (!contextDefaultTrigger) {
        contextDefaultTrigger = trigger;
      }
    }

    return contextDefaultTrigger || defaultTrigger;
  }
}
