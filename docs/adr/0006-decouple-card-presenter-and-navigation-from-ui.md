# 0006-decouple-card-presenter-and-navigation-from-ui.md

Decouple CardService navigation state building, notification toasts, and action response assembly from `UI.ts` into a dedicated `CardPresenter` module.

## Context & Decision

Previously, `UI.ts` mixed visual widget layout generation with navigation response building (`CardService.newActionResponseBuilder`), cache management, and event handler side-effects. Orchestrators like `Process.ts` also directly built `CardService.ActionResponse` navigation payloads (calls to `updateCard` and `pushCard`).

We decided to decouple presentational response mechanics using the following architectural design:

1. **Pure View Layer (`UI.ts`)**: `UI.ts` is restricted to pure card layout rendering (`buildIntakeCard`, `buildSuccessCard`), taking state and flash models and returning `CardService.Card` instances without side-effects.
2. **Dedicated Presenter (`CardPresenter`)**: `CardPresenter` encapsulates all `CardService.ActionResponse` building. It exposes domain-semantic methods (`presentValidationError`, `presentInteractionPrompt`, `presentWorkflowSuccess`, `presentMainCardUpdate`, `presentNotification`) that map validation and workflow outcomes into card navigation updates (`updateCard`, `pushCard`) and notifications.
3. **Dual-Mode Module (`src/CardPresenter.ts`)**: Implements `CardPresenter` with dual CommonJS / Gas global mode support and a `defaultCardPresenter` instance for dependency injection in unit tests and orchestrator calls.

## Consequences

- `UI.ts` becomes a pure visual card layout module, eliminating side-effects and navigation response assembly.
- `Process.ts` and UI event handlers delegate all Apps Script `ActionResponse` assembly to `CardPresenter`.
- Card navigation, flash banners, and toast notifications are unit-testable in isolation from Google Apps Script UI environments.
