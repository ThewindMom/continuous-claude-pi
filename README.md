# continuous-claude-pi

Pi-native port of **ContinuousClaude v4.7**.

This package is designed to let a Pi user access the practical value of ContinuousClaude inside Pi:

- Continuous-Claude-style workflow skills
- TLDR-assisted read guidance and structural analysis
- post-edit diagnostics
- handoffs before compaction
- worker/oracle-oriented autonomous orchestration
- Ouros-backed research loops
- FastEdit/Bloks/Ouros/TLDR-aware helper tools
- migration away from RustDex in favor of TLDR

## Status

Early v0.1 implementation scaffold.

What already exists in this package:
- extension entrypoint with dependency checks
- TLDR wrapper tool: `cc_tldr`
- generic wrappers for `bloks`, `ouros`, `fastedit`
- read-assist hook for large code reads
- post-edit diagnostics hook
- pre-compact handoff generation
- setup/migration/status commands
- ContinuousClaude-inspired workflow skills
- optional worker/oracle markdown agents for install/sync

## Install

Planned target install:

```bash
pi install git:github.com/ThewindMom/continuous-claude-pi
```

For local testing from a checkout:

```bash
pi install ./continuous-claude-pi
```

## Required dependencies

Intended v1 experience expects these on `PATH`:

- `tldr` from [`tldr-code`](https://github.com/parcadei/tldr-code)
- `bloks`
- `ouros`
- `fastedit`

### Important TLDR note

Semantic search in `tldr-code` requires semantic support at install time.
Per the upstream README, prebuilt binaries usually omit that feature.

`continuous-claude-pi` now treats semantic search as a **recommended enhancement**, not a hard blocker:
- core TLDR workflows still work with the standard release binary
- `tldr semantic` / `tldr similar` need a custom semantic-enabled build

## Optional / soft-warning capabilities

These do **not** block package startup in v1, but some research flows will be degraded without them:

- `EXA_API_KEY`
- `NIA_API_KEY`

## Commands

### User-facing commands

- `/cc-check-deps` — check dependency availability
- `/cc-status` — show dependency + config status
- `/cc-setup` — ensure config + migrate RustDex references
- `/cc-migrate-rustdex` — remove `pi-rustdex` entries from Pi settings
- `/cc-create-handoff [description]` — create a handoff for the current session
- `/cc-install-agents` — install bundled worker/oracle markdown agents into `~/.pi/agent/agents`

### Custom tools exposed to the model

- `cc_stack_status`
- `cc_tldr`
- `cc_bloks`
- `cc_ouros`
- `cc_fastedit`
- `cc_create_handoff`
- `cc_session_query`

## Workflow surface

### Skills

- `/skill:bootup`
- `/skill:autonomous`
- `/skill:autonomous-research`
- `/skill:research`
- `/skill:review`
- `/skill:premortem`
- `/skill:create-handoff`
- `/skill:resume-handoff`
- `/skill:upgrade-harness`

### Prompt shortcuts

- `/review-staged`
- `/autonomous-fix <task>`
- `/resume-latest-handoff`

## Storage conventions

By default the package keeps ContinuousClaude-style roots:

- `continuum/`
- `thoughts/shared/`

These are configurable through the package config file.

## Config

Global config file:

```text
~/.pi/agent/continuous-claude-pi.json
```

Optional project override:

```text
.pi/continuous-claude-pi.json
```

Current defaults include:
- continuum root
- thoughts/shared root
- context warning thresholds
- read-assist line limits
- diagnostics enablement
- FastEdit enablement
- auto-rollover enablement, threshold, and cooldown

## RustDex migration

This package is designed to replace RustDex with TLDR.

Use:

```bash
/cc-migrate-rustdex
```

or

```bash
/cc-setup
```

The migration helper updates Pi settings files and removes `pi-rustdex` package references.

## Coexistence with Pi-native strengths

This package is designed to coexist with:

- `pi-fff` for fast fuzzy/text search
- Serena for exact symbol-aware edits and refactors
- pi-vcc for deterministic compaction + recall
- condensed-milk for output/context compression

Recommended mental model:
- `pi-fff` finds text/files fast
- Serena performs exact symbol-aware edits
- TLDR provides structural/semantic/impact analysis
- Continuous Claude Pi orchestrates the higher-level workflow

## Automatic handoff rollover

This package can now roll into a fresh Pi session automatically.

Flow:
- current session crosses the configured auto-rollover threshold
- extension writes a handoff automatically
- extension opens a fresh session directly
- new session is seeded with the handoff prompt plus parent-session reference
- resumed work can inspect the prior session with `cc_session_query`

Default auto-rollover config:
- enabled: `true`
- threshold: `64000` tokens
- cooldown: `60000` ms

## Validation plan

Later validation should include running Pi interactively with this package installed and verifying:

- dependency checks
- large-file read assistance
- post-edit diagnostics
- handoff creation before compaction
- `/skill:autonomous` orchestration behavior
- `/skill:research` and `/skill:autonomous-research` using Ouros-backed flows
- FastEdit/Bloks/Ouros/TLDR tool wrappers in real sessions

## License

MIT for this package.

Note: external dependencies such as `tldr-code` have their own licenses and are not bundled here.
