# Submittal Logging

Validates and records incoming or outgoing project submittals into the log sheet and Google Drive.

## Language

**RawDocument**:
The untrusted, string-heavy data coming directly from the UI form submission for any document type (Submittals, RFIs, etc).
_Avoid_: FormInput, RawSubmittal

**ValidatedDocument**:
The pristine, trusted data structure produced after the RawDocument passes all business rules. Uses composition to store common fields alongside discipline-specific details.
_Avoid_: NormalizedSubmittal, ValidatedSubmittal

**ArchitectureDetails**:
The pristine, validated data specific to the Architecture discipline (e.g., Section, Number, Title).

**FFEDetails**:
The pristine, validated data specific to the FF&E discipline (e.g., Spec Tag, Vendor, Related Tags).

**ValidationContext**:
The dependencies (like LogSettings, valid tags, valid vendors) passed into the pure validation module from the orchestrator so it can validate without reaching out to external services.

**ValidationResult**:
A discriminated union that represents the three universal outcomes of validating a RawDocument: `success` (with the ValidatedDocument and any non-fatal warnings), `error` (fatal failures), or `interaction_required` (when the UI must prompt the user before continuing).
