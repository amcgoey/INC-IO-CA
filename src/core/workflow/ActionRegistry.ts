/**
 * @file ActionRegistry.ts
 * @description Injectable registry for mapping string keys to DocumentAction instances.
 */



export class ActionRegistry {
  private actions = new Map<string, DocumentAction>();

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

export const defaultActionRegistry = new ActionRegistry();

