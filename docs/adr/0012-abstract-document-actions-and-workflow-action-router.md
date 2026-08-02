# 0012-abstract-document-actions-and-workflow-action-router.md

Uniform `DocumentAction` context pipeline contract, fail-fast guard validation, and declarative `WorkflowActionRouter`.

## Context & Decision

Prior to this specification, workflow actions varied between operating directly on context objects and taking standalone custom parameter structs (e.g. `ReadLogInput`, `WriteLogInput`, `AnalyzeDocumentInput`). This forced orchestrator modules to map parameters between steps manually and prevented `WorkflowRunner` from executing action chains generically. Additionally, action sequence rules were embedded directly in workflow methods.

We decided to standardize action interfaces and sequence routing with the following contracts:
1. **Uniform Context Pipeline Interface**: All primitive and complex workflow actions implement `DocumentAction<TDoc>` with signature `execute(context: DocumentActionContext<TDoc>): Promise<DocumentActionContext<TDoc>>`. Actions consume input state, resolve required adapters via `context.adapters`, execute business logic, and return updated context payloads.
2. **Fail-Fast Early Guard Validation**: Actions validate required context fields (`validatedDoc`, `blob`, `targetFolderId`) and adapter availability (`context.adapters.*`) at the start of `execute()`. If any requirement is missing, a descriptive domain error is thrown immediately to halt pipeline execution cleanly.
3. **`WorkflowActionRouter`**: Sequence resolution is centralized in `WorkflowActionRouter.getSequence(documentType, direction)`, returning pre-configured arrays of `DocumentAction` instances to `WorkflowRunner.run()`.

## Consequences

- `WorkflowRunner` can execute any sequence of workflow actions without custom step wrapper boilerplate.
- Step prerequisites are guarded up front, preventing invalid states from reaching external storage or filing APIs.
- Action pipeline sequences per document type and direction are centrally declared and independently testable.
