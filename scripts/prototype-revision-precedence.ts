/**
 * @file prototype-revision-precedence.ts
 * @description Interactive TUI Prototype for driving out-of-order submittal revision evaluation
 * and status precedence logic by hand.
 *
 * TIER 3: Host Tooling / Interactive TUI Harness
 */

import * as readline from 'node:readline';
import {
  parseRevision,
  evaluateSubmittalGroup,
  SubmittalEntry,
  GroupEvaluationResult
} from '../src/prototypes/RevisionPrecedenceEngine.js';

// Global Prototype State
let currentEntries: SubmittalEntry[] = [];
let lastEvaluation: GroupEvaluationResult | null = null;
let eventCounter = 1;

// Color / Formatting helpers using native ANSI codes
const bold = (str: string) => `\x1b[1m${str}\x1b[0m`;
const dim = (str: string) => `\x1b[2m${str}\x1b[0m`;
const green = (str: string) => `\x1b[32m${str}\x1b[0m`;
const yellow = (str: string) => `\x1b[33m${str}\x1b[0m`;
const cyan = (str: string) => `\x1b[36m${str}\x1b[0m`;
const red = (str: string) => `\x1b[31m${str}\x1b[0m`;

function renderFrame() {
  console.clear();

  console.log(bold('========================================================================================'));
  console.log(bold(' PROTOTYPE: Out-of-Order Revision Chaining & Status Precedence Evaluator (Issue #133)'));
  console.log(dim(' Question: How should the log engine evaluate revision precedence (0, 00, R1, Draft)'));
  console.log(dim('           when submittals arrive out of chronological sequence?'));
  console.log(bold('========================================================================================\n'));

  // 1. Current Submittal Log State
  console.log(bold('--- CURRENT SUBMITTAL GROUP LOG STATE (Submittal # 03 30 00-001) ---'));
  if (currentEntries.length === 0) {
    console.log(dim('  (Log is currently empty. Use actions below to simulate incoming submittals.)\n'));
  } else {
    console.log(
      `${bold('Pos').padEnd(5)} | ${bold('Rev').padEnd(8)} | ${bold('Rank').padEnd(8)} | ${bold('Date').padEnd(12)} | ${bold('Contact').padEnd(8)} | ${bold('Status').padEnd(14)} | ${bold('Contact Chain')}`
    );
    console.log(dim('-'.repeat(90)));

    currentEntries.forEach((entry, idx) => {
      const meta = parseRevision(entry.revision);
      const posStr = String(idx + 1).padEnd(5);
      const revStr = entry.revision.padEnd(8);
      const rankStr = `${meta.majorRank}.${meta.minorRank}`.padEnd(8);
      const dateStr = entry.submissionDate.padEnd(12);
      const contactStr = entry.contactAbbr.padEnd(8);
      
      let statusFormatted = entry.status.padEnd(14);
      if (entry.status === 'Superseded') {
        statusFormatted = red(statusFormatted);
      } else if (entry.status === 'Drafting') {
        statusFormatted = yellow(statusFormatted);
      } else {
        statusFormatted = green(statusFormatted);
      }

      const chainStr = dim(entry.contactHistory || '');
      console.log(`${posStr} | ${revStr} | ${rankStr} | ${dateStr} | ${contactStr} | ${statusFormatted} | ${chainStr}`);
    });
    console.log('');
  }

  // 2. Evaluation Insights / Last Event Log
  if (lastEvaluation) {
    console.log(bold('--- LAST EVALUATION INSIGHTS ---'));
    lastEvaluation.explanationLog.forEach(line => {
      console.log(`  ${cyan('▶')} ${line}`);
    });
    console.log(`  ${bold('Active Rev:')} ${green(lastEvaluation.activeEntryId)}`);
    console.log(`  ${bold('Group Chain:')} ${cyan(lastEvaluation.recalculatedContactChain)}`);
    console.log('');
  }

  // 3. Interactive Menu Controls
  console.log(bold('--- SIMULATION ACTIONS ---'));
  console.log(` ${bold('[1]')} Receive Rev 00 ${dim('(Date: 2026-08-01, Normal Initial Submittal)')}`);
  console.log(` ${bold('[2]')} Receive Rev R1 ${dim('(Date: 2026-08-05, Normal Sequential Submittal)')}`);
  console.log(` ${bold('[3]')} ${yellow('SIMULATE OUT-OF-ORDER:')} Receive Rev R2 ${dim('(Date: 2026-08-10, Arrives BEFORE Rev R1)')}`);
  console.log(` ${bold('[4]')} ${yellow('SIMULATE LATE ARRIVAL:')} Receive Rev R1 LATE ${dim('(Date: 2026-08-05, Arrives AFTER Rev R2 is logged)')}`);
  console.log(` ${bold('[5]')} Receive Rev R3-Draft ${dim('(Date: 2026-08-12, Transient Working Draft)')}`);
  console.log(` ${bold('[6]')} Receive Rev R3 Final ${dim('(Date: 2026-08-15, Final Approval)')}`);
  console.log(` ${bold('[7]')} ${cyan('FLEXIBLE FORMAT:')} Receive Plain Integer Rev 1 ${dim('(Date: 2026-08-04, formatted simply as "1")')}`);
  console.log(` ${bold('[8]')} ${cyan('FLEXIBLE FORMAT:')} Receive V-prefixed Rev V2 ${dim('(Date: 2026-08-08, formatted as "V2")')}`);
  console.log(` ${bold('[r]')} Reset Log State`);
  console.log(` ${bold('[q]')} Quit Prototype\n`);
  process.stdout.write(bold('Select an action [1-8, r, q]: '));
}

function handleInput(key: string) {
  const choice = key.trim().toLowerCase();

  switch (choice) {
    case '1': {
      const entry: SubmittalEntry = {
        id: `EVT-${eventCounter++}`,
        submittalNumber: '03 30 00-001',
        revision: '00',
        submissionDate: '2026-08-01',
        contactAbbr: 'GC',
        action: 'SUBMITTED',
        status: 'Under Review'
      };
      lastEvaluation = evaluateSubmittalGroup(currentEntries, entry);
      currentEntries = lastEvaluation.sortedEntries;
      break;
    }
    case '2': {
      const entry: SubmittalEntry = {
        id: `EVT-${eventCounter++}`,
        submittalNumber: '03 30 00-001',
        revision: 'R1',
        submissionDate: '2026-08-05',
        contactAbbr: 'ARCH',
        action: 'REVISE_RESUBMIT',
        status: 'Revise & Resubmit'
      };
      lastEvaluation = evaluateSubmittalGroup(currentEntries, entry);
      currentEntries = lastEvaluation.sortedEntries;
      break;
    }
    case '3': {
      // Simulate Rev R2 arriving first (Out of order)
      const entry: SubmittalEntry = {
        id: `EVT-${eventCounter++}`,
        submittalNumber: '03 30 00-001',
        revision: 'R2',
        submissionDate: '2026-08-10',
        contactAbbr: 'SUB',
        action: 'RESUBMITTED',
        status: 'Under Review'
      };
      lastEvaluation = evaluateSubmittalGroup(currentEntries, entry);
      currentEntries = lastEvaluation.sortedEntries;
      break;
    }
    case '4': {
      // Simulate Rev R1 arriving late (after R2 is already in log)
      const entry: SubmittalEntry = {
        id: `EVT-${eventCounter++}`,
        submittalNumber: '03 30 00-001',
        revision: 'R1',
        submissionDate: '2026-08-05',
        contactAbbr: 'ARCH',
        action: 'RETURNED',
        status: 'Revise & Resubmit'
      };
      lastEvaluation = evaluateSubmittalGroup(currentEntries, entry);
      currentEntries = lastEvaluation.sortedEntries;
      break;
    }
    case '5': {
      const entry: SubmittalEntry = {
        id: `EVT-${eventCounter++}`,
        submittalNumber: '03 30 00-001',
        revision: 'R3-Draft',
        submissionDate: '2026-08-12',
        contactAbbr: 'GC',
        action: 'DRAFT',
        status: 'Drafting'
      };
      lastEvaluation = evaluateSubmittalGroup(currentEntries, entry);
      currentEntries = lastEvaluation.sortedEntries;
      break;
    }
    case '6': {
      const entry: SubmittalEntry = {
        id: `EVT-${eventCounter++}`,
        submittalNumber: '03 30 00-001',
        revision: 'R3',
        submissionDate: '2026-08-15',
        contactAbbr: 'ARCH',
        action: 'APPROVED',
        status: 'Approved'
      };
      lastEvaluation = evaluateSubmittalGroup(currentEntries, entry);
      currentEntries = lastEvaluation.sortedEntries;
      break;
    }
    case '7': {
      // Plain integer format "1"
      const entry: SubmittalEntry = {
        id: `EVT-${eventCounter++}`,
        submittalNumber: '03 30 00-001',
        revision: '1',
        submissionDate: '2026-08-04',
        contactAbbr: 'GC',
        action: 'REVISE_RESUBMIT',
        status: 'Revise & Resubmit'
      };
      lastEvaluation = evaluateSubmittalGroup(currentEntries, entry);
      currentEntries = lastEvaluation.sortedEntries;
      break;
    }
    case '8': {
      // V-prefixed format "V2"
      const entry: SubmittalEntry = {
        id: `EVT-${eventCounter++}`,
        submittalNumber: '03 30 00-001',
        revision: 'V2',
        submissionDate: '2026-08-08',
        contactAbbr: 'SUB',
        action: 'RESUBMITTED',
        status: 'Under Review'
      };
      lastEvaluation = evaluateSubmittalGroup(currentEntries, entry);
      currentEntries = lastEvaluation.sortedEntries;
      break;
    }
    case 'r': {
      currentEntries = [];
      lastEvaluation = null;
      eventCounter = 1;
      break;
    }
    case 'q': {
      console.log('\nExiting Prototype.');
      process.exit(0);
    }
  }

  renderFrame();
}

function start() {
  renderFrame();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', (line) => {
    handleInput(line);
  });
}

start();
