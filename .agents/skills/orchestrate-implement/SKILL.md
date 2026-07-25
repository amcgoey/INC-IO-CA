---
name: orchestrate-implement
description: Coordinate subagents implementing tickets (a parent issue and its children, a specific list of issues, or all ready-for-agent issues). Coordinates resources (git branches, worktrees), runs plan reviews, and executes an automated post-implementation code review loop with defect classification until clean.
disable-model-invocation: true
---

# Code Implementation Orchestrator

This skill coordinates the development flow of subagents handling issue tickets. The orchestrator coordinates activities, manages resources, and routes defects, but does **not** write code. The subagents perform the actual planning and implementation.

## Process

### 1. Scope & Ticket Discovery

Identify the set of issues to orchestrate using `gh` CLI commands (per `docs/agents/issue-tracker.md`). Determine the mode based on user input:
- **Parent Issue Mode**: If a parent issue is specified (e.g., `#57`), fetch its details and all its child sub-issues via `gh api`.
- **Custom Group Mode**: If a specific list of issues is provided, fetch all of them using `gh issue view <number> --comments`.
- **Frontier Mode**: If no specific issues are provided, fetch all open issues in the repository marked with the `ready-for-agent` label.

For each issue, retrieve its title, body, existing comments, assignees, and labels.

### 2. Map Dependencies & Identify Frontier

Build a Directed Acyclic Graph (DAG) of the target issues to determine their execution order:
- **Blocking Edges**: Read native GitHub issue dependencies (`issue_dependencies_summary.blocked_by`). As a fallback, check for a `Blocked by: #XX` list at the top of the issue body.
- **Frontier**: Identify the set of open issues that have no open blockers and no assignees. These are the only issues that can be worked on immediately.

### 3. Resource & Queue Management

Because local environment resources are finite and concurrent work must be isolated, coordinate access using the **Resource Protocol**:
- **Concurrency Limit**: Limit active subagents to a manageable number (e.g., 2–4 concurrent subagents) based on CPU and system capacity.
- **Workspace Sharing (Git Worktrees)**: When spawning subagents via `invoke_subagent`, specify `Workspace: "share"`. This creates isolated workspaces using Git worktrees so subagents work on independent branches without colliding.
- **Branch Management**: Direct each subagent to create and work on its dedicated branch (e.g., `ticket-<number>`) within its shared worktree workspace.
- **Concurrent Typechecks & Tests**: Subagents may run `npm run typecheck` (`tsc --noEmit`) and local unit tests concurrently within their respective worktrees without resource locks.

### 4. Spawning Subagents & Plan Review Loop

For each issue on the frontier:
1. Claim the ticket by adding an assignee (`gh issue edit <n> --add-assignee @me`).
2. Spawn a subagent using `invoke_subagent` with the `/implement` skill. Direct the subagent to:
   - Review domain terminology in `CONTEXT.md` (per `docs/agents/domain.md`), the assigned ticket, and the **parent issue / spec** for surrounding context.
   - Formulate an implementation plan.
   - Submit the plan back to the orchestrator for review and wait for approval.
   - Once approved, proceed with `/implement` using appropriate skills (such as `/tdd`).

When a subagent submits an implementation plan, review it thoroughly:
- **Standards & Spec Check**: Verify the plan against `CONTEXT.md`, parent spec/PRD, subissue description, repository coding standards, and test seams.
- **Feedback**: If the plan is incomplete or fails to address requirements, reply to the subagent with revisions. Repeat until satisfied.
- **Approval & Issue Commenting**: Once approved, reply to release the subagent for development, and **attach the approved implementation plan as a comment to the GitHub issue** (`gh issue comment <number> --body "..."`).

### 5. Automated Post-Implementation Code Review Loop

When a subagent completes implementation:
1. **Post Walkthrough as Comment**: Instruct the subagent to produce a post-implementation walkthrough detailing changes and verification results, and **attach the walkthrough as a comment to the GitHub issue** (`gh issue comment <number> --body "..."`).
2. **Execute `/code-review`**: Spawn a separate subagent to run the `/code-review` skill on the ticket's branch against the base integration branch.
3. **Attach Code Review to Issue**: **Post the full `/code-review` findings report (Standards & Spec axes) as a comment to the GitHub issue** (`gh issue comment <number> --body "..."`).
4. **Classify Findings**:
   - **Direct Defects**: Clear bugs, spec omissions, type failures, or broken standards.
   - **Judgement Calls / Human Review**: Subjective design smells, architectural decisions, or questions requiring human clarification or grilling.

### 6. Defect Routing & Human Review Ticket Creation

Based on the `/code-review` findings:
1. **Direct Defects**:
   - Group findings into clean, vertical slices of fix work.
   - Present the drafted defect list to the user for approval.
   - Once approved, publish them as sub-issues to the original issue on GitHub using `gh issue create` with the `ready-for-agent` label.
2. **Judgement Calls / Human Review**:
   - For design smells or architectural decisions needing human evaluation, create sub-issues linked to the parent/original issue with the `ready-for-human` (or `wayfinder:grilling`) label per `docs/agents/triage-labels.md`.
   - Post a comment on the original issue referencing the created human review tickets.
3. **DAG Update**:
   - Link native `blocked_by` dependencies so newly created defect and human review sub-issues block the original ticket.
   - Keep the original ticket's branch unmerged and the issue open.

### 7. Iterative Code Review Loop & Closure

Enforce the loop **repeat `/code-review` until defect free**:
1. Assign subagents to implement approved direct defect tickets (Step 4).
2. After defect fixes are committed to the branch, **re-run `/code-review` (Step 5)** on the updated branch.
3. **Post each updated `/code-review` report as an issue comment**.
4. **Repeat the fix + `/code-review` cycle until `/code-review` yields 0 direct defects.**
5. Once `/code-review` is completely defect-free and all blocking human review tickets (`ready-for-human`) are resolved:
   - Merge the ticket's branch into the main integration branch.
   - Post a final completion comment on the issue.
   - Close the original issue (`gh issue close <number>`).
   - Recalculate the dependency frontier and spawn subagents for any newly unblocked issues.
