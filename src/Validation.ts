/**
 * Pure validation module for raw document form inputs.
 */

function getTrimmed(val?: string): string {
  return (val || "").trim();
}

function isEmpty(val?: string): boolean {
  return getTrimmed(val) === "";
}

function validateDocument(raw: RawDocument, _context?: ValidationContext): ValidationResult {
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
  }

  if (missingFields.length > 0) {
    return {
      status: "error",
      errors: [`Missing required fields: ${missingFields.join(", ")}`]
    };
  }

  const warnings: string[] = [];

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

  return {
    status: "error",
    errors: [`Discipline ${discipline} validation not yet implemented`]
  };
}

declare const module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { validateDocument };
}
