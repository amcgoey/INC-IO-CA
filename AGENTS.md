## Agent skills

### Issue tracker

Issues are tracked on GitHub using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Using default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context documentation layout. See `docs/agents/domain.md`.

### Coding standards & GAS compatibility

Refer to `CODING_STANDARDS.md` and `docs/adr/0013-three-tier-gas-compatibility-architecture.md`. Agents must classify files into compatibility tiers (Tier 1 Pure Core, Tier 2 GAS Infrastructure Adapters, Tier 3 Host Tooling) before writing or reviewing TypeScript code.

