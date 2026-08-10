import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FakeCacheAdapter } from '../../harness/fakes/FakeCacheAdapter';
import { sampleScorerConfig } from '../../core/logging/LogDisambiguationScorer.test';
import {
  formatDisjunctiveLogSearchQuery,
  getDocumentTypeSearchCacheKey,
  invalidateLogSearchCache,
  GoogleDriveLogSearchAdapter
} from '../../../src/adapters/gas/GoogleDriveLogSearchAdapter';

describe('GoogleDriveLogSearchAdapter (Tier 2 GAS Adapter)', () => {
  describe('formatDisjunctiveLogSearchQuery', () => {
    it('formats standardized document log search terms into disjunctive query', () => {
      const terms = ['document log', 'inc document log', 'submittal log'];
      const query = formatDisjunctiveLogSearchQuery(terms);
      assert.equal(
        query,
        "(title contains 'document log' or title contains 'inc document log' or title contains 'submittal log') and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
      );
    });

    it('formats multiple search terms into disjunctive OR clause query', () => {
      const terms = ['submittal log', 'submittal master log'];
      const query = formatDisjunctiveLogSearchQuery(terms);
      assert.equal(
        query,
        "(title contains 'submittal log' or title contains 'submittal master log') and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
      );
    });

    it('formats single search term wrapping in title contains clause', () => {
      const terms = ['rfi log'];
      const query = formatDisjunctiveLogSearchQuery(terms);
      assert.equal(
        query,
        "(title contains 'rfi log') and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
      );
    });

    it('handles empty terms array by searching for non-trashed spreadsheets', () => {
      const query = formatDisjunctiveLogSearchQuery([]);
      assert.equal(
        query,
        "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
      );
    });

    it('escapes single quotes in search terms to prevent injection', () => {
      const terms = ["builder's log"];
      const query = formatDisjunctiveLogSearchQuery(terms);
      assert.equal(
        query,
        "(title contains 'builder\\'s log') and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
      );
    });
  });

  describe('getDocumentTypeSearchCacheKey & invalidateLogSearchCache', () => {
    it('formats cache key with DriveId and DocTypeKey per ADR 0030 �2', () => {
      const key1 = getDocumentTypeSearchCacheKey('0A123', 'Submittal');
      const key2 = getDocumentTypeSearchCacheKey(undefined, 'Submittal');
      assert.equal(key1, 'log_search_0A123_Submittal');
      assert.equal(key2, 'log_search_Submittal');
    });

    it('invalidates target cache keys', () => {
      const cacheAdapter = new FakeCacheAdapter();
      const key = getDocumentTypeSearchCacheKey('0A123', 'Submittal');
      cacheAdapter.put(key, 'test-data', 3600);
      assert.ok(cacheAdapter.get(key));

      invalidateLogSearchCache(cacheAdapter, '0A123', 'Submittal');
      assert.equal(cacheAdapter.get(key), null);
    });
  });

  describe('GoogleDriveLogSearchAdapter execution & capping', () => {
    it('correctly ranks candidate workbooks matching standardized document log search terms', () => {
      const mockDriveFiles = [
        {
          id: 'file-doc-log',
          title: 'PROJ Document Log',
          manifestDocTypes: ['Submittal'],
          lastModifiedDate: new Date(2026, 0, 10)
        },
        {
          id: 'file-other',
          title: 'Unrelated File',
          manifestDocTypes: []
        }
      ];

      const adapter = new GoogleDriveLogSearchAdapter({
        fetchDriveFiles: () => mockDriveFiles
      });

      const config = {
        documentType: 'Submittal',
        logSearchTerms: ['document log', 'inc document log', 'submittal log']
      } as any;

      const ranked = adapter.searchAndScoreCandidates(config, undefined, 10);
      assert.equal(ranked.length, 2);
      assert.equal(ranked[0].candidate.id, 'file-doc-log');
      assert.ok(ranked[0].score > 0, 'Document log candidate should score positively');
    });

    it('scores pool of candidate files and limits discovery to top 10 ranked candidates', () => {
      const mockDriveFiles = Array.from({ length: 15 }, (_, i) => ({
        id: `file-${i + 1}`,
        title: i < 5 ? `Copy of Submittal Log ${i + 1}` : `Project Submittal Log ${i + 1}`,
        manifestDocTypes: ['Submittal'],
        lastModifiedDate: new Date(2026, 0, i + 1)
      }));

      const adapter = new GoogleDriveLogSearchAdapter({
        fetchDriveFiles: (_query: string, maxResults: number) => {
          assert.equal(maxResults, 10, 'Expected maxResults limit of 10');
          return mockDriveFiles;
        }
      });

      const ranked = adapter.searchAndScoreCandidates(sampleScorerConfig, 'drive-123', 10);
      assert.equal(ranked.length, 10, 'Result candidate list must be capped at 10');
      assert.ok(!ranked[0].candidate.title.startsWith('Copy of'), 'Top ranked sheet must not be a demoted copy sheet');
    });

    it('uses CacheAdapter for DocumentType-scoped search caching with 3600s TTL', () => {
      const cacheAdapter = new FakeCacheAdapter();
      let fetchCount = 0;

      const mockDriveFiles = [
        {
          id: 'file-cached-1',
          title: 'Submittal Log Master',
          manifestDocTypes: ['Submittal']
        }
      ];

      const adapter = new GoogleDriveLogSearchAdapter({
        cacheAdapter,
        fetchDriveFiles: () => {
          fetchCount++;
          return mockDriveFiles;
        }
      });

      // First call - Cache miss, fetches from drive & caches with 3600s TTL
      const res1 = adapter.searchAndScoreCandidates(sampleScorerConfig, 'drive-abc', 10);
      assert.equal(fetchCount, 1);
      assert.equal(res1.length, 1);
      assert.equal(res1[0].candidate.id, 'file-cached-1');

      // Verify cached value exists in cacheAdapter
      const cacheKey = getDocumentTypeSearchCacheKey('drive-abc', 'Submittal');
      assert.ok(cacheAdapter.get(cacheKey));

      // Second call - Cache hit, returns cached without calling fetchDriveFiles
      const res2 = adapter.searchAndScoreCandidates(sampleScorerConfig, 'drive-abc', 10);
      assert.equal(fetchCount, 1, 'Expected fetchDriveFiles not to be called on cache hit');
      assert.equal(res2.length, 1);
      assert.equal(res2[0].candidate.id, 'file-cached-1');
    });
  });
});
