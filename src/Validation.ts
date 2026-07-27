/**
 * @file Validation.ts
 * @description Core validation module for submittal form inputs.
 *
 * Enforces required fields, discipline-specific schema rules (Architecture vs FF&E),
 * tag/vendor verification against Tag List options, interactive prompt triggers, and fallback warnings.
 */

/**
 * Returns trimmed string or empty string if nullish.
 *
 * @param val - Target string.
 * @returns Trimmed string.
 */
function getTrimmed(val?: string): string {
  return (val || "").trim();
}

/**
 * Checks if a string value is empty or whitespace-only.
 *
 * @param val - Target string.
 * @returns `true` if empty/whitespace, `false` otherwise.
 */
function isEmpty(val?: string): boolean {
  return getTrimmed(val) === "";
}

/**
 * Validates a raw submittal input dictionary against project discipline requirements and tag/vendor options.
 *
 * @param raw - `RawDocument` key-value dictionary.
 * @param context - Optional `ValidationContext` containing valid FF&E tags/vendors and bypass flags.
 * @returns `ValidationResult` containing status ("success", "error", or "interaction_required"), validated data, errors, or prompts.
 */
function validateDocument(raw: RawDocument, context?: ValidationContext): ValidationResult {
  const rawDoc = FormIntakeParser.parse(raw);
  const discipline = rawDoc.discipline || "Architecture";

  const contactField = context?.listFields?.contact || ListDocumentField.createContactField(context?.contacts || context?.logSettings?.contacts || []);
  const actionField = context?.listFields?.action || ListDocumentField.createActionField(context?.actions || context?.logSettings?.actions || []);

  const resolvedContact = contactField.resolve(rawDoc.contact);
  const resolvedAction = actionField.resolve(rawDoc.action);

  // Validate common required fields
  const missingFields: string[] = [];
  if (isEmpty(rawDoc.date)) missingFields.push("Date");
  if (isEmpty(rawDoc.contact)) missingFields.push("Contact");
  if (isEmpty(rawDoc.action)) missingFields.push("Action");

  if ((resolvedAction.longForm === "Received" || resolvedAction.storedValue === "Received" || rawDoc.action === "Received") && isEmpty(rawDoc.incomingRouting)) {
    missingFields.push("Incoming Routing");
  }

  // Discipline-specific required fields
  if (discipline === "Architecture") {
    if (isEmpty(rawDoc.title)) missingFields.push("Title");
  } else if (discipline === "FF&E") {
    if (isEmpty(rawDoc.specTag)) missingFields.push("Spec Tag");
    if (isEmpty(rawDoc.specTitle)) missingFields.push("Spec Title");
    if (isEmpty(rawDoc.vendor)) missingFields.push("Vendor");
  }

  if (missingFields.length > 0) {
    return {
      status: "error",
      errors: [`Missing required fields: ${missingFields.join(", ")}`],
      missingFields
    };
  }

  const warnings: string[] = [];
  const validTags = context?.ffeTags?.tags || [];
  const validVendors = context?.ffeTags?.vendors || [];

  if (discipline === "Architecture") {
    const sectionVal = getTrimmed(rawDoc.section);
    if (!sectionVal) warnings.push("Section");

    const numberVal = getTrimmed(rawDoc.number);
    if (!numberVal) warnings.push("Number");

    const revisionVal = getTrimmed(rawDoc.revision);
    if (!revisionVal) warnings.push("Revision");

    const archDetails: ArchitectureDetails = {
      discipline: "Architecture",
      section: sectionVal,
      number: numberVal,
      title: getTrimmed(rawDoc.title),
      revision: revisionVal
    };

    const validatedDoc: ValidatedDocument = {
      documentType: getTrimmed(rawDoc.documentType) || "Submittal",
      date: getTrimmed(rawDoc.date),
      contact: resolvedContact.storedValue,
      action: resolvedAction.storedValue,
      contactAbbr: resolvedContact.abbreviation,
      contactLongForm: resolvedContact.longForm,
      actionAbbr: resolvedAction.abbreviation,
      actionLongForm: resolvedAction.longForm,
      listFields: {
        contact: resolvedContact,
        action: resolvedAction
      },
      notes: getTrimmed(rawDoc.notes),
      incomingRouting: getTrimmed(rawDoc.incomingRouting),
      disciplineDetails: archDetails
    };

    return {
      status: "success",
      data: validatedDoc,
      warnings
    };
  }

  if (discipline === "FF&E") {
    const specTag = getTrimmed(rawDoc.specTag);
    const vendor = getTrimmed(rawDoc.vendor);
    const relatedTag = getTrimmed(rawDoc.relatedTag);

    // Related Tags Validation
    if (relatedTag) {
      const inputRelatedTags = relatedTag.split(",").map(t => t.trim()).filter(Boolean);
      const invalidRelatedTags = inputRelatedTags.filter(
        t => !validTags.some(valid => valid.toLowerCase() === t.toLowerCase())
      );
      if (invalidRelatedTags.length > 0) {
        return {
          status: "error",
          errors: [`Invalid Related Tags: ${invalidRelatedTags.join(", ")}. Only valid options from the tag list are accepted.`]
        };
      }
    }

    // Spec Tag & Vendor Exist Validation (with bypass check)
    const bypassTag = !!context?.bypassTagValidation;
    const bypassVendor = !!context?.bypassVendorValidation;

    const tagExists = validTags.some(t => t.toLowerCase() === specTag.toLowerCase());
    if (!tagExists && !bypassTag) {
      return {
        status: "interaction_required",
        interactionType: "ADD_TAG",
        message: `Spec Tag "${specTag}" is not in the Tag List. Would you like to add it?`
      };
    }

    const vendorExists = validVendors.some(v => v.toLowerCase() === vendor.toLowerCase());
    if (!vendorExists && !bypassVendor) {
      return {
        status: "interaction_required",
        interactionType: "ADD_VENDOR",
        message: `Vendor "${vendor}" is not in the Tag List. Would you like to add it?`
      };
    }

    const revisionVal = getTrimmed(rawDoc.revision);
    if (!revisionVal) warnings.push("Revision");

    const ffeDetails: FFEDetails = {
      discipline: "FF&E",
      specTag,
      specTitle: getTrimmed(rawDoc.specTitle),
      vendor,
      revision: revisionVal,
      relatedTag
    };

    const validatedDoc: ValidatedDocument = {
      documentType: getTrimmed(rawDoc.documentType) || "Submittal",
      date: getTrimmed(rawDoc.date),
      contact: resolvedContact.storedValue,
      action: resolvedAction.storedValue,
      contactAbbr: resolvedContact.abbreviation,
      contactLongForm: resolvedContact.longForm,
      actionAbbr: resolvedAction.abbreviation,
      actionLongForm: resolvedAction.longForm,
      listFields: {
        contact: resolvedContact,
        action: resolvedAction
      },
      notes: getTrimmed(rawDoc.notes),
      incomingRouting: getTrimmed(rawDoc.incomingRouting),
      disciplineDetails: ffeDetails
    };

    return {
      status: "success",
      data: validatedDoc,
      warnings
    };
  }

  return {
    status: "error",
    errors: [`Discipline ${discipline} validation not yet implemented`]
  };
}


declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { validateDocument };
}
