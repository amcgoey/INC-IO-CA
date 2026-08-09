import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LogDisambiguationScorer,
  LogCandidateMetadata
} from '../../../src/core/log/LogDisambiguationScorer';

export const sampleScorerConfig: DocumentTypeConfig = {
  documentType: 'Submittal',
  rootFolderSearchTerms: ['Submittals'],
  closedRootFolderName: '01 Closed Submittals',
  filenamePrefix: 'SUB',
  logSearchTerms: ['submittal log', 'submittal master log'],
  logSheetName: 'Submittal Arch',
  logParentFolderTerms: ['Logs', 'Submittal Logs'],
  logAdapterKey: 'ArchSubmittalLogAdapter',
  filingAdapterKey: 'SubmittalFilingAdapter'
};

describe('LogDisambiguationScorer (Tier 1 Pure Core)', () => {
  it('scores candidate with manifest match (+50)', () => {
    const candidate: LogCandidateMetadata = {
      id: 'sheet-1',
      title: 'Random Title',
      manifestDocTypes: ['Submittal']
    };

    const result = LogDisambiguationScorer.scoreCandidate(candidate, sampleScorerConfig);
    assert.equal(result.scoreBreakdown.manifestMatch, 50);
    assert.equal(result.score, 50);
  });

  it('scores candidate with logSheetName tab match (+40)', () => {
    const candidate: LogCandidateMetadata = {
      id: 'sheet-2',
      title: 'Random Title',
      sheetTabNames: ['Submittal Arch', 'Sheet1']
    };

    const result = LogDisambiguationScorer.scoreCandidate(candidate, sampleScorerConfig);
    assert.equal(result.scoreBreakdown.sheetTabMatch, 40);
    assert.equal(result.score, 40);
  });

  it('scores candidate with exact primary logSearchTerms title match (+20) and title affirmative term (+10)', () => {
    const candidate: LogCandidateMetadata = {
      id: 'sheet-3',
      title: 'submittal log'
    };

    const result = LogDisambiguationScorer.scoreCandidate(candidate, sampleScorerConfig);
    assert.equal(result.scoreBreakdown.exactTitleMatch, 20);
    assert.equal(result.scoreBreakdown.titleAffirmativeMatch, 10);
    assert.equal(result.score, 30);
  });

  it('scores candidate with parent folder match (+30)', () => {
    const candidate1: LogCandidateMetadata = {
      id: 'sheet-4a',
      title: 'Sheet A',
      parentFolderNames: ['01 Admin']
    };
    const candidate2: LogCandidateMetadata = {
      id: 'sheet-4b',
      title: 'Sheet B',
      parentFolderNames: ['Submittal Logs']
    };

    const result1 = LogDisambiguationScorer.scoreCandidate(candidate1, sampleScorerConfig);
    const result2 = LogDisambiguationScorer.scoreCandidate(candidate2, sampleScorerConfig);
    assert.equal(result1.scoreBreakdown.parentFolderMatch, 30);
    assert.equal(result2.scoreBreakdown.parentFolderMatch, 30);
  });

  it('applies demotion penalty (-30) for non-production keywords (Copy, Backup, Archive, Draft, Underscore delimiters) without false positives', () => {
    const demotionTitles = [
      'Copy of Submittal Log',
      'Submittal Log Backup',
      'Old Submittal Log Bak',
      'Submittal_Log_bak',
      'Submittal_Log_draft',
      'Duplicate Submittal Log',
      'Submittal Log Archive',
      'Archived Submittal Log',
      'Old Submittal Log',
      'Legacy Submittal Log',
      'Submittal Log Draft',
      'Submittal Log WIP',
      'Temp Submittal Log',
      'Test Submittal Log'
    ];

    for (const title of demotionTitles) {
      const candidate: LogCandidateMetadata = {
        id: 'sheet-demo',
        title,
        manifestDocTypes: ['Submittal'],
        sheetTabNames: ['Submittal Arch']
      };

      const result = LogDisambiguationScorer.scoreCandidate(candidate, sampleScorerConfig);
      assert.equal(
        result.scoreBreakdown.demotionPenalty,
        -30,
        `Expected demotion penalty for title: ${title}`
      );
      assert.equal(result.score, 70, `Score mismatch for title: ${title}`);
    }

    // Verify no false positive demotion on titles like "Contest Log"
    const validTitleCandidate: LogCandidateMetadata = {
      id: 'sheet-valid',
      title: 'Contest Log',
      manifestDocTypes: ['Submittal']
    };
    const validResult = LogDisambiguationScorer.scoreCandidate(validTitleCandidate, sampleScorerConfig);
    assert.equal(validResult.scoreBreakdown.demotionPenalty, 0, 'No demotion penalty for Contest Log');
  });

  it('ranks candidates by total score descending', () => {
    const candidates: LogCandidateMetadata[] = [
      {
        id: 'cand-low',
        title: 'Draft Submittal Log',
        manifestDocTypes: []
      },
      {
        id: 'cand-high',
        title: 'Project Submittal Log',
        manifestDocTypes: ['Submittal'],
        sheetTabNames: ['Submittal Arch'],
        parentFolderNames: ['Admin']
      },
      {
        id: 'cand-mid',
        title: 'Submittal Log',
        manifestDocTypes: ['Submittal']
      }
    ];

    const ranked = LogDisambiguationScorer.rankCandidates(candidates, sampleScorerConfig);
    assert.equal(ranked.length, 3);
    assert.equal(ranked[0].candidate.id, 'cand-high');
    assert.equal(ranked[1].candidate.id, 'cand-mid');
    assert.equal(ranked[2].candidate.id, 'cand-low');
  });

  it('breaks ties by lastModifiedDate descending', () => {
    const candidates: LogCandidateMetadata[] = [
      {
        id: 'older-sheet',
        title: 'Submittal Log',
        manifestDocTypes: ['Submittal'],
        lastModifiedDate: '2026-01-01T10:00:00Z'
      },
      {
        id: 'newer-sheet',
        title: 'Submittal Log',
        manifestDocTypes: ['Submittal'],
        lastModifiedDate: '2026-08-01T10:00:00Z'
      },
      {
        id: 'middle-sheet',
        title: 'Submittal Log',
        manifestDocTypes: ['Submittal'],
        lastModifiedDate: new Date('2026-05-01T10:00:00Z')
      }
    ];

    const ranked = LogDisambiguationScorer.rankCandidates(candidates, sampleScorerConfig);
    assert.equal(ranked.length, 3);
    assert.equal(ranked[0].candidate.id, 'newer-sheet');
    assert.equal(ranked[1].candidate.id, 'middle-sheet');
    assert.equal(ranked[2].candidate.id, 'older-sheet');
  });
});
