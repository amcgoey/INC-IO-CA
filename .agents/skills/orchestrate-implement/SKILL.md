---
name: orchestrate-implement
description: Coordinate subagents implementing tickets (a parent issue and its children, a specific list of issues, or all ready-for-agent issues). Coordinates resources (git branches, worktrees), runs plan reviews, and executes an automated post-implementation code review loop with defect classification.
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
- **Concurrent Typechecks & Tests**: Subagents may run `npm run typecheck` (`tsc --noEmit`) and local unit tests concurrently within their respective worktrees without resource locks, as typechecking is read-only and worktrees isolate source files.

### 4. Spawning Subagents & Plan Review Loop

For each issue on the frontier:
1. Claim the ticket by adding an assignee (`gh issue edit <n> --add-assignee @me`).
2. Spawn a subagent using `invoke_subagent` with the `implement` skill. Direct the subagent to:
   - Review domain terminology in `CONTEXT.md` (per `docs/agents/domain.md`), parent spec (if applicable), and assigned ticket + comments.
   - Formulate an implementation plan.
   - Submit the plan back to the orchestrator for review and wait for approval.
   - Once approved, proceed with implementation using appropriate skills (such as `/tdd` and `/implement`).

When a subagent submits an implementation plan, review it thoroughly:
- **Standards & Spec Check**: Verify the plan against `CONTEXT.md`, parent spec/PRD, subissue description, repository coding standards, and test seams.
- **Feedback**: If the plan is incomplete or fails to address requirements, reply to the subagent with revisions. Repeat until satisfied.
- **Approval**: Once approved, reply to release the subagent for development, and **attach the approved plan as a comment to the issue on GitHub** (`gh issue comment <number> --body "..."`).

### 5. Automated Post-Implementation Code Review

When a subagent reports completion of implementation, do **not** merge the branch or close the ticket immediately:
1. Spawn a separate subagent to run the `/code-review` skill on the ticket's branch against the base integration branch.
2. When `/code-review` returns its two-axis report (**Standards** and **Spec**), classify findings into:
   - **Direct Defects**: Clear errors, missing spec requirements, failing types, or bugs.
   - **Judgement Calls / Human Review**: Design smells, subjective decisions, or potential issues requiring developer clarification or grilling.

### 6. Defect Routing & DAG Updating

Based on the code review classification:
1. **Direct Defects**:
   - Group findings into clean, vertical slices of work.
   - Present the drafted list of defect tickets to the user for approval.
   - Once approved, publish them as sub-issues to the original issue on GitHub using `gh issue create` with the `ready-for-agent` label.
2. **Judgement Calls**:
   - Create sub-issues linked to the original issue and apply `ready-for-human` (or `wayfinder:grilling`) per `docs/agents/triage-labels.md`. These tickets are held for interactive grilling sessions and are not worked on by AFK agents.
3. **DAG Update**:
   - Update the active dependency graph by linking native `blocked_by` dependencies so newly created sub-issues block the original ticket.
   - Keep the original ticket's branch unmerged and issue open.
   - Downstream tickets dependent on the original ticket remain blocked.
   - Independent frontier tickets continue parallel implementation.

### 7. Defect Resolution & Closure

For direct defect tickets:
1. Direct the assigned subagent to branch off the original ticket's branch to build upon the existing implementation.
2. Process each defect ticket through the subagent plan review and implementation flow (Step 4).
3. Once all blocking sub-issues (direct defects and human review tickets) are resolved and closed:
   - Merge the ticket's branch into the main integration branch.
   - Post the final walkthrough as a comment on the original issue.
   - Close the original issue (`gh issue close <number>`).
   - Recalculate the dependency frontier and spawn subagents for any newly unblocked issues.
