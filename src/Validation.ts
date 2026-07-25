/**
 * Pure validation module for raw document form inputs.
 */

function validateDocument(raw: RawDocument, context?: ValidationContext): ValidationResult {
  const disc = raw.discipline || "Architecture";

  // Validate required fields
  const missingFields: string[] = [];
  if (!raw.date || !raw.date.trim()) missingFields.push("Date");
  if (!raw.contact || !raw.contact.trim()) missingFields.push("Contact");
  if (!raw.action || !raw.action.trim()) missingFields.push("Action");

  if (raw.action === "Received" && (!raw.incomingRouting || !raw.incomingRouting.trim())) {
    missingFields.push("Incoming Routing");
  }

  if (disc === "Architecture") {
    if (!raw.title || !raw.title.trim()) missingFields.push("Title");
  } else {
    if (!raw.specTag || !raw.specTag.trim()) missingFields.push("Spec Tag");
    if (!raw.specTitle || !raw.specTitle.trim()) missingFields.push("Spec Title");
    if (!raw.vendor || !raw.vendor.trim()) missingFields.push("Vendor");
  }

  if (missingFields.length > 0) {
    return {
      status: "error",
      errors: [`Missing required fields: ${missingFields.join(", ")}`]
    };
  }

  const warnings: string[] = [];

  if (disc === "Architecture") {
    let sectionVal = (raw.section || "").trim();
    if (!sectionVal) warnings.push("Section");

    let numberVal = (raw.number || "").trim();
    if (!numberVal) warnings.push("Number");

    let revisionVal = (raw.revision || "").trim();
    if (!revisionVal) warnings.push("Revision");

    const archDetails: ArchitectureDetails = {
      discipline: "Architecture",
      section: sectionVal,
      number: numberVal,
      title: (raw.title || "").trim(),
      revision: revisionVal
    };

    const validatedDoc: ValidatedDocument = {
      documentType: "Submittal",
      date: (raw.date || "").trim(),
      contact: (raw.contact || "").trim(),
      action: (raw.action || "").trim(),
      notes: (raw.notes || "").trim(),
      incomingRouting: (raw.incomingRouting || "").trim(),
      disciplineDetails: archDetails
    };

    return {
      status: "success",
      data: validatedDoc,
      warnings
    };
  }

  return {
    status: "error",
    errors: [`Discipline ${disc} validation not yet implemented`]
  };
}

declare const module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { validateDocument };
}

