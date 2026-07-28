# 0009 Three-Tier Email Intake Parsing Architecture

## Context and Problem
Incoming email notifications arrive in various formats — vendor-specific templates (Procore, Autodesk Forma, CMiC Collaborate), semi-structured submittal emails, and unformatted correspondence. Previously, if an email did not match a known vendor-specific template, parsing immediately fell back to empty strings, placing the full parsing burden on manual user entry or AI triage.

## Decision
We implement a **3-tier email intake parsing chain**:
1. **Tier 1 (Vendor Parsers)**: Matches specific vendor templates (Procore, Forma, CMiC) when header/sender markers match.
2. **Tier 2 (Generic Submittal Parser)**: Runs when Tier 1 vendor parsers do not match. Scans subject and body for 6-digit CSI MasterFormat codes (`\d{2}[\s.-]?\d{2}[\s.-]?\d{2}`), submittal numbers, and revisions. Normalizes section codes to 6 contiguous digits (`062000`), pads submittal numbers to 3 digits (`003`), extracts delimiter-based titles (ignoring status noise words like "was submitted"), and sets `action = "Received"` for external senders.
3. **Tier 3 (Unparsed Default Fallback)**: Runs when Tier 1 and Tier 2 both fail, returning clean empty fields.

Crucially, **neither Tier 1 nor Tier 2 forces `discipline` or `driveName`** based solely on CSI MasterFormat numbers. Because FF&E submittals may also reference 6-digit MasterFormat sections, `discipline` and `driveName` are left unassigned by regex parsers to respect the downstream AI Triage assessment.
