/**
 * @file GoogleDriveLogSearchAdapter.ts
 * @description Tier 2 GAS Infrastructure Adapter for disjunctive Drive query formatting, candidate log discovery, and DocumentType-scoped search caching.
 * Governed by ADR 0013 (Three-Tier GAS Compatibility Architecture), ADR 0030 (DocumentType-Aware Log Workbook Disambiguation Engine),
 * and ADR 0044 (Dedicated Adapter Namespace & Directory Architecture).
 */

import type { LogCandidateMetadata, ScoredLogCandidate } from '../../core/log/LogDisambiguationScorer';

import { LogDisambiguationScorer } from '../../core/log/LogDisambiguationScorer';
import { PrefixCacheManager } from '../../core/admin/PrefixCacheManager';

function getLogDisambiguationScorerClass(): any {
  return LogDisambiguationScorer;
}

function getPrefixCacheManagerClass(): any {
  return PrefixCacheManager;
}

/**
 * Formats a disjunctive Google Drive API query string from DocumentType logSearchTerms.
 * Capped and optimized to locate candidate log spreadsheets in Shared Drives per ADR 0030.
 *
 * @param logSearchTerms Array of search terms (e.g. ['submittal log', 'submittal master log'])
 * @returns Disjunctive Drive search query string
 */
export function formatDisjunctiveLogSearchQuery(logSearchTerms: string[]): string {
  const mimeClause = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";

  if (!logSearchTerms || logSearchTerms.length === 0) {
    return mimeClause;
  }

  const titleClauses = logSearchTerms.map((term: string) => {
    const escapedTerm = term.replace(/'/g, "\\'");
    return `title contains '${escapedTerm}'`;
  });

  const disjunctiveTitleQuery = `(${titleClauses.join(' or ')})`;
  return `${disjunctiveTitleQuery} and ${mimeClause}`;
}

/**
 * Formats the DocumentType-Scoped Cache Key per ADR 0030 �2.
 * Key pattern: log_search_<DriveId>_<DocTypeKey> or log_search_<DocTypeKey>
 */
export function getDocumentTypeSearchCacheKey(driveId: string | undefined, docTypeKey: string): string {
  if (driveId && driveId.trim() !== '') {
    return `log_search_${driveId.trim()}_${docTypeKey}`;
  }
  return `log_search_${docTypeKey}`;
}

/**
 * Invalidates DocumentType search cache entries per ADR 0030 �2 using PrefixCacheManager.
 */
export function invalidateLogSearchCache(
  cacheAdapter: CacheAdapter,
  driveId?: string,
  docTypeKey?: string
): void {
  if (!cacheAdapter) return;

  const prefix = driveId && driveId.trim() !== '' ? `log_search_${driveId.trim()}_` : 'log_search_';
  const prefixManager = new (getPrefixCacheManagerClass())(cacheAdapter);

  if (docTypeKey) {
    const key = getDocumentTypeSearchCacheKey(driveId, docTypeKey);
    prefixManager.removeScoped(prefix, key);
  } else {
    prefixManager.invalidatePrefix(prefix);
  }
}

export interface DriveLogSearchFetcherOptions {
  fetchDriveFiles?: (
    query: string,
    maxResults: number,
    driveId?: string
  ) => LogCandidateMetadata[];
  cacheAdapter?: CacheAdapter;
}

export class GoogleDriveLogSearchAdapter {
  private fetchDriveFiles?: (
    query: string,
    maxResults: number,
    driveId?: string
  ) => LogCandidateMetadata[];
  private cacheAdapter?: CacheAdapter;

  constructor(options?: DriveLogSearchFetcherOptions) {
    this.fetchDriveFiles = options?.fetchDriveFiles;
    this.cacheAdapter = options?.cacheAdapter;
  }

  /**
   * Helper encapsulating native GAS DriveApp file metadata mapping.
   */
  private mapGasFileToMetadata(file: GoogleAppsScript.Drive.File): LogCandidateMetadata {
    const parentFolderNames: string[] = [];
    try {
      const parents = file.getParents();
      while (parents.hasNext()) {
        parentFolderNames.push(parents.next().getName());
      }
    } catch (_e) {
      // Ignore parent folder lookup failures gracefully
    }

    let lastModifiedDate: Date | undefined;
    try {
      const lastUpdated = file.getLastUpdated();
      if (lastUpdated) {
        lastModifiedDate = new Date(lastUpdated.getTime());
      }
    } catch (_e) {
      // Ignore date parsing failures
    }

    const baseMeta: LogCandidateMetadata = {
      id: file.getId(),
      title: file.getName(),
      parentFolderNames,
      lastModifiedDate
    };

    return this.enrichCandidateMetadata(baseMeta);
  }

  /**
   * Enriches candidate spreadsheet metadata with sheetTabNames and _Config manifestDocTypes.
   */
  public enrichCandidateMetadata(candidate: LogCandidateMetadata): LogCandidateMetadata {
    if (candidate.sheetTabNames && candidate.sheetTabNames.length > 0 && candidate.manifestDocTypes && candidate.manifestDocTypes.length > 0) {
      return candidate;
    }

    let sheetTabNames = candidate.sheetTabNames ? [...candidate.sheetTabNames] : undefined;
    let manifestDocTypes = candidate.manifestDocTypes ? [...candidate.manifestDocTypes] : undefined;

    try {
      if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.openById) {
        const ss = SpreadsheetApp.openById(candidate.id);
        if (ss) {
          if ((!sheetTabNames || sheetTabNames.length === 0) && typeof ss.getSheets === 'function') {
            sheetTabNames = ss.getSheets().map((s: GoogleAppsScript.Spreadsheet.Sheet) => s.getName());
          }

          if (!manifestDocTypes || manifestDocTypes.length === 0) {
            const configSheet = typeof ss.getSheetByName === 'function' ? ss.getSheetByName('_Config') : null;
            if (configSheet) {
              const types: string[] = [];

              // 1. Check named range Config_DocTypes or _Config_Doc_Types
              if (typeof ss.getRangeByName === 'function') {
                const namedRange = ss.getRangeByName('Config_DocTypes') || ss.getRangeByName('_Config_Doc_Types');
                if (namedRange) {
                  const values = namedRange.getValues();
                  for (const row of values) {
                    const docTypeKey = row && row[0] ? String(row[0]).trim() : '';
                    if (docTypeKey && docTypeKey.toLowerCase() !== 'doctypekey' && !types.includes(docTypeKey)) {
                      types.push(docTypeKey);
                    }
                  }
                }
              }

              // 2. Scan _Config sheet data range
              if (types.length === 0 && typeof configSheet.getDataRange === 'function') {
                const data = configSheet.getDataRange().getValues();
                let inDocTypes = false;
                for (let r = 0; r < data.length; r++) {
                  const firstCol = data[r] && data[r][0] !== undefined ? String(data[r][0]).trim() : '';
                  if (firstCol.toLowerCase() === 'doctypekey') {
                    inDocTypes = true;
                    continue;
                  }
                  if (inDocTypes) {
                    if (!firstCol) {
                      inDocTypes = false;
                    } else {
                      if (!types.includes(firstCol)) {
                        types.push(firstCol);
                      }
                    }
                  }
                }
              }

              // 3. Named ranges matching Config_<DocTypeKey>
              if (types.length === 0 && typeof ss.getNamedRanges === 'function') {
                const nrs = ss.getNamedRanges();
                for (const nr of nrs) {
                  const name = nr.getName();
                  const m = name.match(/^Config_([A-Za-z0-9_]+)$/);
                  if (m && m[1]) {
                    const key = m[1];
                    if (!['Manifest', 'DocTypes', 'Doc_Types'].includes(key) && !key.endsWith('_Fields') && !key.endsWith('_Identity') && !key.endsWith('_Storage') && !key.endsWith('_Workflows')) {
                      if (!types.includes(key)) {
                        types.push(key);
                      }
                    }
                  }
                }
              }

              if (types.length > 0) {
                manifestDocTypes = types;
              }
            }
          }
        }
      }
    } catch (_e) {
      // Ignore inspection errors gracefully
    }

    return {
      ...candidate,
      ...(sheetTabNames ? { sheetTabNames } : {}),
      ...(manifestDocTypes ? { manifestDocTypes } : {})
    };
  }

  /**
   * Searches Drive for candidate log spreadsheets matching config.logSearchTerms,
   * caching results per Shared Drive & DocumentType (ADR 0030 �2),
   * scoring all discovered candidates, and returning top 10 ranked candidates.
   */
  public searchAndScoreCandidates(
    config: DocumentTypeConfig,
    driveId?: string,
    maxResults: number = 10
  ): ScoredLogCandidate[] {
    const cacheKey = getDocumentTypeSearchCacheKey(driveId, config.documentType);

    // 1. Check DocumentType-Scoped Cache if available
    if (this.cacheAdapter) {
      const cachedData = this.cacheAdapter.get(cacheKey);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData) as ScoredLogCandidate[];
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch (_e) {
          // Cache parse failure, fallback to fresh Drive query
        }
      }
    }

    const cappedLimit = Math.min(Math.max(1, maxResults), 10);
    const query = formatDisjunctiveLogSearchQuery(config.logSearchTerms || []);

    let candidates: LogCandidateMetadata[] = [];

    if (this.fetchDriveFiles) {
      candidates = this.fetchDriveFiles(query, cappedLimit, driveId).map((c: LogCandidateMetadata) => this.enrichCandidateMetadata(c));
    } else if (typeof DriveApp !== 'undefined') {
      // Native GAS DriveApp execution fallback with driveId folder scoping if provided
      let searchFiles: GoogleAppsScript.Drive.FileIterator;
      if (driveId && driveId.trim() !== '') {
        try {
          const driveFolder = DriveApp.getFolderById(driveId);
          searchFiles = driveFolder.searchFiles(query);
        } catch (_e) {
          searchFiles = DriveApp.searchFiles(query);
        }
      } else {
        searchFiles = DriveApp.searchFiles(query);
      }

      candidates = [];
      while (searchFiles.hasNext() && candidates.length < cappedLimit) {
        const file = searchFiles.next();
        candidates.push(this.mapGasFileToMetadata(file));
      }
    }

    // 2. Score candidates and rank
    const LogDisambiguationScorerClass = getLogDisambiguationScorerClass();
    const rankedCandidates = LogDisambiguationScorerClass.rankCandidates(candidates, config);
    const topRanked = rankedCandidates.slice(0, cappedLimit);

    // 3. Cache top ranked results with 3600s TTL and PrefixCacheManager tracking (ADR 0030 �2)
    if (this.cacheAdapter) {
      try {
        const prefixManager = new (getPrefixCacheManagerClass())(this.cacheAdapter);
        const prefix = driveId && driveId.trim() !== '' ? `log_search_${driveId.trim()}_` : 'log_search_';
        prefixManager.putScoped(prefix, cacheKey, JSON.stringify(topRanked), 3600);
      } catch (_e) {
        // Non-fatal cache write error
      }
    }

    return topRanked;
  }
}
