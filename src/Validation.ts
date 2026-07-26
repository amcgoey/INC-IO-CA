/**
 * Pure validation module for raw document form inputs.
 */

function getTrimmed(val?: string): string {
  return (val || "").trim();
}

function isEmpty(val?: string): boolean {
  return getTrimmed(val) === "";
}

function validateDocument(raw: RawDocument, context?: ValidationContext): ValidationResult {
  const discipline = getTrimmed(raw.discipline) || "Architecture";

  // Validate common required fields
  const missingFields: string[] = [];
  if (isEmpty(raw.date)) missingFields.push("Date");
  if (isEmpty(raw.contact)) missingFields.push("Contact");
  if (isEmpty(raw.action)) missingFields.push("Action");

  if (getTrimmed(raw.action) === "Received" && isEmpty(raw.incomingRouting)) {
    missingFields.push("Incoming Routing");
  }

  // Discipline-specific required fields
  if (discipline === "Architecture") {
    if (isEmpty(raw.title)) missingFields.push("Title");
  } else if (discipline === "FF&E") {
    if (isEmpty(raw.specTag)) missingFields.push("Spec Tag");
    if (isEmpty(raw.specTitle)) missingFields.push("Spec Title");
    if (isEmpty(raw.vendor)) missingFields.push("Vendor");
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
    const sectionVal = getTrimmed(raw.section);
    if (!sectionVal) warnings.push("Section");

    const numberVal = getTrimmed(raw.number);
    if (!numberVal) warnings.push("Number");

    const revisionVal = getTrimmed(raw.revision);
    if (!revisionVal) warnings.push("Revision");

    const archDetails: ArchitectureDetails = {
      discipline: "Architecture",
      section: sectionVal,
      number: numberVal,
      title: getTrimmed(raw.title),
      revision: revisionVal
    };

    const validatedDoc: ValidatedDocument = {
      documentType: getTrimmed(raw.documentType) || "Submittal",
      date: getTrimmed(raw.date),
      contact: getTrimmed(raw.contact),
      action: getTrimmed(raw.action),
      notes: getTrimmed(raw.notes),
      incomingRouting: getTrimmed(raw.incomingRouting),
      disciplineDetails: archDetails
    };

    return {
      status: "success",
      data: validatedDoc,
      warnings
    };
  }

  if (discipline === "FF&E") {
    const specTag = getTrimmed(raw.specTag);
    const vendor = getTrimmed(raw.vendor);
    const relatedTag = getTrimmed(raw.relatedTag);

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

    const revisionVal = getTrimmed(raw.revision);
    if (!revisionVal) warnings.push("Revision");

    const ffeDetails: FFEDetails = {
      discipline: "FF&E",
      specTag,
      specTitle: getTrimmed(raw.specTitle),
      vendor,
      revision: revisionVal,
      relatedTag
    };

    const validatedDoc: ValidatedDocument = {
      documentType: getTrimmed(raw.documentType) || "Submittal",
      date: getTrimmed(raw.date),
      contact: getTrimmed(raw.contact),
      action: getTrimmed(raw.action),
      notes: getTrimmed(raw.notes),
      incomingRouting: getTrimmed(raw.incomingRouting),
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
