/**
 * @file RevisionPrecedenceEngine.test.ts
 * @description Unit tests for RevisionPrecedenceEngine out-of-order submittal evaluation logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseRevision,
  compareRevisions,
  evaluateSubmittalGroup,
  SubmittalEntry
} from '../../src/prototypes/RevisionPrecedenceEngine.js';

describe('RevisionPrecedenceEngine Unit Tests', () => {

  describe('parseRevision', () => {
    it('normalizes numeric revisions (0, 00, 1, 01, R1, V1, V2, Ver 3)', () => {
      assert.strictEqual(parseRevision('0').majorRank, 0);
      assert.strictEqual(parseRevision('00').majorRank, 0);
      assert.strictEqual(parseRevision('1').majorRank, 1);
      assert.strictEqual(parseRevision('2').majorRank, 2);
      assert.strictEqual(parseRevision('3').majorRank, 3);
      assert.strictEqual(parseRevision('R1').majorRank, 1);
      assert.strictEqual(parseRevision('V1').majorRank, 1);
      assert.strictEqual(parseRevision('V2').majorRank, 2);
      assert.strictEqual(parseRevision('V3').majorRank, 3);
      assert.strictEqual(parseRevision('Ver 3').majorRank, 3);
      assert.strictEqual(parseRevision('Rev 2').majorRank, 2);
    });

    it('normalizes alphabetic revisions (A, B, C)', () => {
      assert.strictEqual(parseRevision('A').majorRank, 1);
      assert.strictEqual(parseRevision('B').majorRank, 2);
    });

    it('flags draft revisions correctly', () => {
      const meta = parseRevision('R2-Draft');
      assert.strictEqual(meta.isDraft, true);
      assert.strictEqual(meta.majorRank, 2);
      assert.strictEqual(meta.minorRank, 0.5);
    });
  });

  describe('compareRevisions', () => {
    it('orders numeric revisions lower to higher', () => {
      assert.ok(compareRevisions('00', 'R1') < 0);
      assert.ok(compareRevisions('R1', '00') > 0);
      assert.strictEqual(compareRevisions('R1', '1'), 0);
    });

    it('orders draft revisions before final of same revision number', () => {
      assert.ok(compareRevisions('R1-Draft', 'R1') < 0);
      assert.ok(compareRevisions('00', 'R1-Draft') < 0);
    });
  });

  describe('evaluateSubmittalGroup', () => {
    it('handles normal sequential submittal additions', () => {
      const e1: SubmittalEntry = {
        id: '1', submittalNumber: '03 30 00-001', revision: '00',
        submissionDate: '2026-08-01', contactAbbr: 'GC', action: 'SUBMITTED', status: 'Under Review'
      };
      const r1 = evaluateSubmittalGroup([], e1);
      assert.strictEqual(r1.sortedEntries.length, 1);
      assert.strictEqual(r1.sortedEntries[0].status, 'Under Review');

      const e2: SubmittalEntry = {
        id: '2', submittalNumber: '03 30 00-001', revision: 'R1',
        submissionDate: '2026-08-05', contactAbbr: 'ARCH', action: 'REVISE_RESUBMIT', status: 'Revise & Resubmit'
      };
      const r2 = evaluateSubmittalGroup(r1.sortedEntries, e2);
      assert.strictEqual(r2.sortedEntries.length, 2);
      assert.strictEqual(r2.sortedEntries[0].status, 'Superseded');
      assert.strictEqual(r2.sortedEntries[1].status, 'Revise & Resubmit');
      assert.strictEqual(r2.recalculatedContactChain, 'GC:SUBMITTED -> ARCH:REVISE_RESUBMIT');
    });

    it('handles out-of-order late arrival of an older revision (Rev R1 arrives late after Rev R2 logged)', () => {
      const eR2: SubmittalEntry = {
        id: '2', submittalNumber: '03 30 00-001', revision: 'R2',
        submissionDate: '2026-08-10', contactAbbr: 'SUB', action: 'RESUBMITTED', status: 'Under Review'
      };
      const r1 = evaluateSubmittalGroup([], eR2);
      assert.strictEqual(r1.sortedEntries[0].revision, 'R2');
      assert.strictEqual(r1.sortedEntries[0].status, 'Under Review');

      // Now Rev R1 (date 2026-08-05) arrives late
      const eR1: SubmittalEntry = {
        id: '1', submittalNumber: '03 30 00-001', revision: 'R1',
        submissionDate: '2026-08-05', contactAbbr: 'ARCH', action: 'RETURNED', status: 'Revise & Resubmit'
      };
      const r2 = evaluateSubmittalGroup(r1.sortedEntries, eR1);
      
      assert.strictEqual(r2.sortedEntries.length, 2);
      assert.strictEqual(r2.sortedEntries[0].revision, 'R1');
      assert.strictEqual(r2.sortedEntries[0].status, 'Superseded');
      assert.strictEqual(r2.sortedEntries[1].revision, 'R2');
      assert.strictEqual(r2.sortedEntries[1].status, 'Under Review');
      assert.strictEqual(r2.insertionIndex, 0); // Inserted at row 1 (0-indexed 0)
    });
  });

});
