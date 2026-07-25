---
name: orchestrate-implement
description: Coordinate subagents implementing tickets (a parent issue and its children, a specific list of issues, or all ready-for-agent issues). Manages resources, runs plan reviews, and enforces an automated subagent post-implementation code review loop with defect classification until clean.
disable-model-invocation: true
---

# Code Implementation Orchestrator

This skill coordinates the development flow of subagents handling issue tickets. The **Orchestrator Agent** coordinates activities, manages the issue queue/frontier, reviews subagent plans, and merges branches, but does **not** write code. **Subagents** perform planning, implementation using `/implement` and `/tdd`, post-implementation `/code-review` (by spawning dedicated review subagents), defect breakdown, and ticket closure.

---

## Orchestrator Agent Process

1. **Map dependencies**: Discover target issues via `gh` CLI (`docs/agents/issue-tracker.md`) and build the Directed Acyclic Graph (DAG) using native GitHub issue dependencies (`issue_dependencies_summary.blocked_by`) or `Blocked by: #XX` headers.
   * *Completion Criterion*: A complete DAG of all scoped issues with identified parent/child and blocking edges.

2. **Identify frontier issues**: Query the DAG for open issues that have no open blockers and no assignees.
   * *Completion Criterion*: A list of unblocked, unassigned frontier issues ready for immediate work.

3. **Manage the queue & spawn subagents**: Assign each frontier issue (`gh issue edit <n> --add-assignee @me`) and spawn subagents using `invoke_subagent` with `Workspace: "share"` (Git worktrees). Direct subagents to spawn separate review subagents when running `/code-review`.
   * *Completion Criterion*: Subagents spawned on isolated Git branches (`ticket-<number>`) for all available frontier slots with strict subagent-spawning directives for code review.

4. **Manage resources & review plans**: Enforce subagent concurrency caps (2–4 active agents). Review subagent implementation plans against `CONTEXT.md` and repository standards. Provide feedback until satisfied, then approve the plan and release the subagent.
   * *Completion Criterion*: Approved plan attached to the GitHub issue as a comment and subagent released for development.

5. **Merge commits once complete**: Once a subagent reports a ticket is defect-free and closed, merge the ticket's feature branch into the target integration branch (`develop`), recalculate the dependency frontier, and repeat.
   * *Completion Criterion*: Ticket branch merged into integration branch, DAG updated, and next frontier queued.

---

## Subagent Process

1. **Implement assigned issue**: Run `/implement` on the assigned ticket using `/tdd`. Refer to `CONTEXT.md` (per `docs/agents/domain.md`), the assigned ticket, and the **parent issue / spec** for surrounding architectural context.
   * *Completion Criterion*: Code changes implemented, tested with `/tdd`, and passing local typechecks (`npm run typecheck`).

2. **Add result artifacts as comments**: Post all result artifacts (implementation plans, post-implementation walkthroughs, and code review reports) as comments directly on the GitHub issue (`gh issue comment <number> --body "..."`), removing any sensitive information (tokens, credentials, internal paths).
   * *Completion Criterion*: Cleaned artifact posted as a comment on the target GitHub issue.

3. **Code Review via Spawned Subagents**: Once implemented, execute `/code-review` by **spawning separate parallel subagents** via `invoke_subagent` (one for Standards review and one for Spec review). **Do NOT perform the code review inline within your own conversation.**
   - **3.1. Add comment**: Collect the reports from both review subagents and post the aggregated two-axis `/code-review` report (Standards & Spec) as a comment on the issue.
   - **3.2. Human review tickets**: If judgement calls (design smells, architectural choices) are needed, create a sub-issue with the `ready-for-human` (or `wayfinder:grilling`) label per `docs/agents/triage-labels.md`.
   - **3.3. Defect classification**: For defects ready for agent implementation (`ready-for-agent`), determine if multiple tickets are needed:
     - **3.3.1. Multiple tickets**: Run `/to-tickets` to publish tracer-bullet subissues on the current ticket.
     - **3.3.2. Single ticket/comment**: Add the defect description and fix task directly as a comment to the issue.
   - **3.4. Implement defects**: Run `/implement` to resolve all direct defects (from comments or subissues).
   * *Completion Criterion*: Parallel review subagents spawned, two-axis review report posted, judgement call tickets created if needed, and direct defects identified and implemented.

4. **Repeat Code Review steps**: Re-run Step 3 (spawning new parallel review subagents for `/code-review`) after implementing defect fixes until the branch is completely defect-free (0 direct defects).
   * *Completion Criterion*: `/code-review` from spawned review subagents returns zero direct defects on both Standards and Spec axes.

5. **Close issue**: Post the final walkthrough comment and close the issue (`gh issue close <number>`) once defect-free and all blocking human review tickets are accounted for.
   * *Completion Criterion*: Issue state updated to `closed` on GitHub with a final walkthrough comment.

---

## Orchestrator Agent Detailed Explanations

### Step 1: Map Dependencies
* **Discovery Modes**:
  - *Parent Issue Mode*: Fetch the parent issue and all sub-issues via `gh api repos/<owner>/<repo>/issues/<number>/sub_issues`.
  - *Custom Group Mode*: Fetch specified issue numbers using `gh issue view <number> --comments`.
  - *Frontier Mode*: Fetch all open issues with label `ready-for-agent` (`gh issue list --label ready-for-agent --state open`).
* **DAG Construction**: Query native GitHub issue dependencies via `gh api`. Read `issue_dependencies_summary.blocked_by`. Fall back to parsing `Blocked by: #XX` lines in issue bodies where native links are absent.

### Step 2: Identify Frontier Issues
* Filter the DAG for open tickets where `blocked_by` count is 0 and no assignee is assigned (`assignees` list is empty).
* Sort tickets by priority or map order. These constitute the active frontier.

### Step 3: Manage Queue & Spawn Subagents
* Claim each frontier issue before spawning (`gh issue edit <n> --add-assignee @me`).
* Spawn a subagent via `invoke_subagent` using the `implement` skill with `Workspace: "share"`. This provisions an isolated Git worktree so subagents work on dedicated branches (`ticket-<number>`) without workspace collisions.
* **Directives to Subagent**: Explicitly instruct the spawned subagent: *"When implementation is complete, you MUST spawn separate parallel subagents to run `/code-review` (Standards and Spec axes). Do NOT perform the code review yourself inline."*

### Step 4: Manage Resources & Review Plans
* **Concurrency Cap**: Maintain 2–4 active subagents maximum to prevent system CPU/memory exhaustion.
* **Concurrent Typechecks & Tests**: Subagents may run `npm run typecheck` (`tsc --noEmit`) and unit tests concurrently within their respective worktrees, as typechecks are read-only and source files are worktree-isolated.
* **Plan Review**: Subagents must submit implementation plans to the orchestrator before editing code. Check plans against `CONTEXT.md` terminology, parent spec constraints, and test seams. Provide feedback if incomplete; once approved, post the plan to the GitHub issue (`gh issue comment <n> --body "..."`) and release the subagent.

### Step 5: Merge Commits Once Complete
* When a subagent closes its ticket, verify that its branch builds clean (`npm run typecheck`) and tests pass.
* Merge the ticket's feature branch into the target integration branch (`develop`).
* Recalculate the DAG, unblock downstream tickets whose dependencies are now closed, and populate the next frontier.

---

## Subagent Detailed Explanations

### Step 1: Implement Assigned Issue
* Check `CONTEXT.md` (per `docs/agents/domain.md`) to align all naming with domain vocabulary.
* Read the assigned ticket body, comments, and the **parent issue / spec** to ensure the vertical slice satisfies the broader system architecture.
* Use `/implement` with `/tdd` to write tests first, make them pass, and refactor while running `npm run typecheck` regularly.

### Step 2: Add Result Artifacts as Comments
* Every major artifact generated during execution—implementation plans, walkthroughs, and `/code-review` reports—must be published as a comment to the GitHub issue using `gh issue comment <number> --body "..."`.
* **Sanitization**: Before posting, scrub all sensitive information, including API tokens, private credentials, local file system user paths, and internal secrets.

### Step 3: Code Review Execution & Defect Routing
* **Mandatory Subagent Spawning for `/code-review`**: You MUST NOT perform code reviews inline within your own context window. Self-review in the same conversation context leads to confirmation bias and missed defects. In strict accordance with `/code-review` (Step 4), you MUST spawn two separate parallel subagents via `invoke_subagent`:
  1. **Standards Subagent**: Evaluates diff against documented repo standards and Fowler code smells.
  2. **Spec Subagent**: Evaluates diff against requirements in the assigned ticket and parent spec.
* **3.1 Code Review Comment**: Collect the outputs from both subagents and post the aggregated two-axis report (Standards & Spec) verbatim as an issue comment (`gh issue comment <number> --body "..."`).
* **3.2 Human Review Tickets**: Identify subjective design smells, architectural ambiguities, or scope trade-offs. Create linked sub-issues labeled `ready-for-human` (or `wayfinder:grilling`) per `docs/agents/triage-labels.md`. Post a reference comment on the parent issue.
* **3.3 Defect Breakdown**:
  - *Multi-ticket defects (3.3.1)*: If defects span multiple distinct components or tracer bullets, run `/to-tickets` to break them into sub-issues attached to the current ticket.
  - *Single-ticket/comment defects (3.3.2)*: If defects are small and localized, write the defect checklist directly into a comment on the current issue.
* **3.4 Implement Defects**: Execute `/implement` on the defect tasks (from subissues or comment checklist) on the ticket branch.

### Step 4: Repeat Code Review Loop Until Defect-Free
* After committing defect fixes, **spawn new parallel subagents** to re-run `/code-review`. Do NOT skip spawning subagents on repeat review loops.
* Post the updated review report as a comment on the issue.
* Repeat the `/code-review` (via subagents) -> fix -> `/code-review` (via subagents) cycle until `/code-review` returns zero direct defects on both Standards and Spec axes.

### Step 5: Close Issue
* Compile a post-implementation walkthrough summarizing changes made, tests run, and verification results.
* Scrub sensitive data and post the walkthrough as a comment on the issue.
* Close the issue on GitHub (`gh issue close <number> --comment "Completed via orchestrate-implement"`).
