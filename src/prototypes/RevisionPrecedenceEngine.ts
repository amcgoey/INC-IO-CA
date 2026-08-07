/**
 * @file RevisionPrecedenceEngine.ts
 * @description Pure core logic module for out-of-order revision parsing, precedence evaluation,
 * status transitions, and contact chain recalculation.
 *
 * TIER 1 / PROTOTYPE LOGIC MODULE: Pure JavaScript/TypeScript. Zero I/O or DOM dependencies.
 */

export interface RevisionMeta {
  raw: string;
  normalized: string;
  majorRank: number;
  minorRank: number;
  isDraft: boolean;
  type: 'numeric' | 'alpha' | 'prefixed' | 'draft' | 'unknown';
}

export interface SubmittalEntry {
  id: string;
  submittalNumber: string; // e.g. "03 30 00-001"
  revision: string;
  submissionDate: string; // YYYY-MM-DD
  contactAbbr: string;
  action: string;
  status: string;
  contactHistory?: string;
}

export interface GroupEvaluationResult {
  sortedEntries: SubmittalEntry[];
  activeEntryId: string;
  supersededEntryIds: string[];
  recalculatedContactChain: string;
  insertionIndex: number;
  explanationLog: string[];
}

/**
 * Parses any revision string (e.g., "0", "00", "R1", "Rev 2", "A", "Draft 1", "R2-Draft")
 * into a structured RevisionMeta object with deterministic numeric ranking.
 */
export function parseRevision(revStr: string): RevisionMeta {
  const raw = (revStr || '').trim();
  const upper = raw.toUpperCase();

  if (!raw) {
    return {
      raw: '',
      normalized: '0',
      majorRank: 0,
      minorRank: 0,
      isDraft: false,
      type: 'numeric'
    };
  }

  const isDraft = upper.includes('DRAFT') || (upper.startsWith('D') && /D\d+/.test(upper));

  // Strip 'DRAFT', 'REV', 'REVISION', 'VERSION', 'VER', 'R', 'V', '#', etc.
  let cleaned = upper
    .replace(/DRAFT/g, '')
    .replace(/REVISION\.?/g, '')
    .replace(/REV\.?/g, '')
    .replace(/VERSION\.?/g, '')
    .replace(/VER\.?/g, '')
    .replace(/^[RV#-]/g, '')
    .trim();

  // Match any embedded or standalone integer (e.g. "0", "1", "2", "3", "00", "01", "V1", "v2", "R2")
  const matchNum = cleaned.match(/^(\d+)/) || upper.match(/(?:[RV]|VER|VERSION)?\s*[-#]?\s*(\d+)/i);
  if (matchNum) {
    const major = parseInt(matchNum[1], 10);
    return {
      raw,
      normalized: `${raw}`,
      majorRank: major,
      minorRank: isDraft ? 0.5 : 1.0,
      isDraft,
      type: 'numeric'
    };
  }

  // Match Alphabetic revisions ("A", "B", "C")
  const matchAlpha = cleaned.match(/^([A-Z])$/);
  if (matchAlpha) {
    const code = matchAlpha[1].charCodeAt(0) - 64; // A=1, B=2...
    return {
      raw,
      normalized: raw,
      majorRank: code,
      minorRank: isDraft ? 0.5 : 1.0,
      isDraft,
      type: 'alpha'
    };
  }

  // Fallback for custom or unknown strings
  return {
    raw,
    normalized: raw,
    majorRank: 999,
    minorRank: isDraft ? 0.5 : 1.0,
    isDraft,
    type: 'unknown'
  };
}

/**
 * Compares two revision strings for precedence.
 * Returns negative if revA < revB (revA is older/lower), positive if revA > revB, 0 if equal.
 */
export function compareRevisions(revA: string, revB: string): number {
  const metaA = parseRevision(revA);
  const metaB = parseRevision(revB);

  if (metaA.majorRank !== metaB.majorRank) {
    return metaA.majorRank - metaB.majorRank;
  }

  if (metaA.minorRank !== metaB.minorRank) {
    return metaA.minorRank - metaB.minorRank;
  }

  return 0;
}

/**
 * Evaluates an existing set of submittal log entries for a single submittal group
 * alongside a new incoming submittal entry (which may arrive out of chronological order).
 *
 * Rules Applied:
 * 1. Entries are sorted primarily by Revision Precedence (Ascending), secondary by Submission Date (Ascending).
 * 2. The entry with the HIGHEST non-draft revision precedence (or highest draft if only drafts exist) is assigned ACTIVE status.
 * 3. All entries with lower revision precedence are updated to 'Superseded' / 'Closed'.
 * 4. Contact history chain is re-built across all entries in revision order.
 */
export function evaluateSubmittalGroup(
  existingEntries: SubmittalEntry[],
  incomingEntry: SubmittalEntry
): GroupEvaluationResult {
  const logs: string[] = [];
  logs.push(`Incoming Entry: Rev "${incomingEntry.revision}" (${incomingEntry.submissionDate}) from ${incomingEntry.contactAbbr}`);

  // Combine entries
  const all = [...existingEntries, incomingEntry];

  // Sort entries: primary by Revision Precedence, secondary by Submission Date
  all.sort((a, b) => {
    const revCmp = compareRevisions(a.revision, b.revision);
    if (revCmp !== 0) return revCmp;
    return new Date(a.submissionDate).getTime() - new Date(b.submissionDate).getTime();
  });

  const insertionIndex = all.findIndex(e => e.id === incomingEntry.id);
  logs.push(`Calculated Log Position: Row ${insertionIndex + 1} of ${all.length}`);

  // Determine Active Entry
  // Highest precedence non-draft entry, or last entry if all are drafts
  let activeEntry = all[all.length - 1];
  for (let i = all.length - 1; i >= 0; i--) {
    const meta = parseRevision(all[i].revision);
    if (!meta.isDraft) {
      activeEntry = all[i];
      break;
    }
  }

  logs.push(`Active Highest Revision: Rev "${activeEntry.revision}" (${activeEntry.id})`);

  // Update statuses & compute contact chain
  const supersededIds: string[] = [];
  const contactChainParts: string[] = [];

  const updatedEntries = all.map(entry => {
    contactChainParts.push(`${entry.contactAbbr}:${entry.action || 'REV'}`);

    if (entry.id === activeEntry.id) {
      const meta = parseRevision(entry.revision);
      const activeStatus = meta.isDraft ? 'Drafting' : (entry.status && entry.status !== 'Superseded' ? entry.status : 'Open');
      return {
        ...entry,
        status: activeStatus,
        contactHistory: contactChainParts.join(' -> ')
      };
    } else {
      supersededIds.push(entry.id);
      logs.push(`Marking Rev "${entry.revision}" (${entry.id}) as Superseded`);
      return {
        ...entry,
        status: 'Superseded',
        contactHistory: contactChainParts.join(' -> ')
      };
    }
  });

  return {
    sortedEntries: updatedEntries,
    activeEntryId: activeEntry.id,
    supersededEntryIds: supersededIds,
    recalculatedContactChain: contactChainParts.join(' -> '),
    insertionIndex,
    explanationLog: logs
  };
}
