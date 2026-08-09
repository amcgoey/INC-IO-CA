/**
 * @file LogDisambiguationScorer.ts
 * @description Tier 1 Pure Core candidate log workbook scoring and disambiguation engine.
 * Governed by ADR 0013 (Three-Tier GAS Compatibility Architecture), ADR 0030 (DocumentType-Aware Log Workbook Disambiguation Engine),
 * and ADR 0044 (Dedicated Adapter Namespace & Directory Architecture).
 */

export interface LogCandidateMetadata {
  id: string;
  title: string;
  parentFolderNames?: string[];
  sheetTabNames?: string[];
  manifestDocTypes?: string[];
  lastModifiedDate?: Date | string | number;
}

export interface LogScoreBreakdown {
  manifestMatch: number;
  sheetTabMatch: number;
  exactTitleMatch: number;
  parentFolderMatch: number;
  titleAffirmativeMatch: number;
  demotionPenalty: number;
}

export interface ScoredLogCandidate {
  candidate: LogCandidateMetadata;
  score: number;
  scoreBreakdown: LogScoreBreakdown;
}

const DEFAULT_ADMIN_FOLDER_TERMS = ['1 Admin', '01 Admin', '00 Admin', 'Admin'];
const NON_PRODUCTION_DEMOTION_KEYWORDS = [
  'copy',
  'backup',
  'bak',
  'duplicate',
  'archive',
  'archived',
  'old',
  'legacy',
  'draft',
  'wip',
  'temp',
  'test'
];

export class LogDisambiguationScorer {
  /**
   * Scores a single candidate spreadsheet metadata struct against DocumentTypeConfig rules.
   */
  public static scoreCandidate(
    candidate: LogCandidateMetadata,
    config: DocumentTypeConfig
  ): ScoredLogCandidate {
    const targetDocType = config.documentType;
    const lowerTitle = candidate.title.toLowerCase();

    // 1. Structural Inspection: Manifest Match (+50 pts)
    let manifestMatch = 0;
    if (candidate.manifestDocTypes && candidate.manifestDocTypes.length > 0) {
      const match = candidate.manifestDocTypes.some(
        (dt: string) => dt.trim().toLowerCase() === targetDocType.trim().toLowerCase()
      );
      if (match) {
        manifestMatch = 50;
      }
    }

    // 2. Structural Inspection: Sheet Tab Match (+40 pts)
    let sheetTabMatch = 0;
    if (candidate.sheetTabNames && candidate.sheetTabNames.length > 0 && config.logSheetName) {
      const match = candidate.sheetTabNames.some(
        (tab: string) => tab.trim().toLowerCase() === config.logSheetName.trim().toLowerCase()
      );
      if (match) {
        sheetTabMatch = 40;
      }
    }

    // 3. Structural Inspection: Title matches primary logSearchTerms exactly (+20 pts)
    let exactTitleMatch = 0;
    if (config.logSearchTerms && config.logSearchTerms.length > 0) {
      const match = config.logSearchTerms.some(
        (term: string) => term.trim().toLowerCase() === lowerTitle.trim()
      );
      if (match) {
        exactTitleMatch = 20;
      }
    }

    // 4. Parent Folder Match (+30 pts)
    let parentFolderMatch = 0;
    if (candidate.parentFolderNames && candidate.parentFolderNames.length > 0) {
      const combinedAdminFolderTerms = [
        ...DEFAULT_ADMIN_FOLDER_TERMS,
        ...(config.logParentFolderTerms || [])
      ].map((t: string) => t.trim().toLowerCase());

      const match = candidate.parentFolderNames.some((folderName: string) =>
        combinedAdminFolderTerms.includes(folderName.trim().toLowerCase())
      );
      if (match) {
        parentFolderMatch = 30;
      }
    }

    // 5. Title Affirmative Terms (+10 pts): Title contains "Document" or "Log"
    let titleAffirmativeMatch = 0;
    if (lowerTitle.includes('document') || lowerTitle.includes('log')) {
      titleAffirmativeMatch = 10;
    }

    // 6. Demotion Penalty (-30 pts for Copy, Backup, Bak, Duplicate, Archive, Archived, Old, Legacy, Draft, WIP, Temp, Test)
    // Uses word/token matching split by spaces, underscores, hyphens, or punctuation to prevent false demotions
    let demotionPenalty = 0;
    const titleTokens = lowerTitle.split(/[\s_\-\.\,\/\\]+/);
    const isDemoted = NON_PRODUCTION_DEMOTION_KEYWORDS.some((keyword: string) =>
      titleTokens.includes(keyword)
    );

    if (isDemoted) {
      demotionPenalty = -30;
    }

    const scoreBreakdown: LogScoreBreakdown = {
      manifestMatch,
      sheetTabMatch,
      exactTitleMatch,
      parentFolderMatch,
      titleAffirmativeMatch,
      demotionPenalty
    };

    const totalScore =
      manifestMatch +
      sheetTabMatch +
      exactTitleMatch +
      parentFolderMatch +
      titleAffirmativeMatch +
      demotionPenalty;

    return {
      candidate,
      score: totalScore,
      scoreBreakdown
    };
  }

  /**
   * Ranks an array of candidate spreadsheet structs by total score descending,
   * tie-broken by lastModifiedDate descending, preserving original retrieval order if still tied.
   */
  public static rankCandidates(
    candidates: LogCandidateMetadata[],
    config: DocumentTypeConfig
  ): ScoredLogCandidate[] {
    const scoredCandidates = candidates.map((candidate) =>
      this.scoreCandidate(candidate, config)
    );

    return scoredCandidates.sort((a, b) => {
      // Primary sort: Score descending
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      // Tie-breaker: lastModifiedDate descending
      const dateA = a.candidate.lastModifiedDate ? new Date(a.candidate.lastModifiedDate).getTime() : 0;
      const dateB = b.candidate.lastModifiedDate ? new Date(b.candidate.lastModifiedDate).getTime() : 0;

      const validDateA = isNaN(dateA) ? 0 : dateA;
      const validDateB = isNaN(dateB) ? 0 : dateB;

      if (validDateB !== validDateA) {
        return validDateB - validDateA;
      }

      // Final fallback: preserve original order
      return 0;
    });
  }
}
