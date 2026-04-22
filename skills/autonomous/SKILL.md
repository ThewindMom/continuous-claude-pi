---
name: autonomous
description: Full Continuous Claude-style autonomous SDLC pipeline inside Pi using workers, contracts, TLDR, Ouros, FastEdit, and validation loops.
allowed-tools: Agent bash read write edit cc_tldr cc_bloks cc_ouros cc_fastedit cc_create_handoff
---

# Autonomous

You are the orchestrator. Never become the worker unless the user explicitly asks for a one-shot direct implementation. Keep the main thread focused on:

- scope
- assertions
- milestones
- delegation
- validation
- handoffs
- evolution

## Pipeline

Run all phases:

1. **ASSESS**
2. **PLAN**
3. **PREMORTEM**
4. **PREPARE**
5. **EXECUTE**
6. **VALIDATE**
7. **EVOLVE**

## Artifacts

Default roots:
- `continuum/autonomous/<task-id>/contract.json`
- `continuum/autonomous/<task-id>/plan.md`
- `continuum/autonomous/<task-id>/reports/*.json`
- `continuum/autonomous/<task-id>/validation/*.json`

Use the configured defaults if the extension reports custom roots.

## ASSESS

- Clarify the task outcome
- Classify complexity: patch, feature, multi-feature, greenfield
- Identify if design/UX approval is required
- Use `cc_tldr` for structure/context when codebase understanding is needed

## PLAN

Create a validation-first contract.

Rules:
- one worker step should map to one assertion whenever possible
- milestone gates must be explicit
- assertions should be falsifiable
- define evidence before code changes start

## PREMORTEM

Invoke `/skill:premortem` on the current plan/contract when the work is non-trivial.
If premortem yields BLOCK risks, do not continue until mitigated or explicitly accepted.

## PREPARE

Front-load context for workers. Prefer these sources:
- `cc_bloks` for context, cards, recipes, reports, ack/nack
- `cc_tldr` for structure, context, impact, semantic search
- `cc_ouros` when prior research artifacts or Ouros sessions matter
- project conventions from AGENTS/CLAUDE files and local docs

## EXECUTE

Use the Pi `Agent` tool for worker/oracle delegation.

Recommended worker split:
- **worker** for bounded implementation
- **oracle** for external research / docs / repo study

Give workers:
- one bounded objective
- explicit files or search roots
- verification commands
- artifact/report destination
- which tools to prefer (`cc_fastedit` for existing-file edits, `write` for new files, `cc_tldr` for analysis)

Prefer `cc_fastedit` over plain `edit` for existing-file modifications when feasible.

## VALIDATE

Every milestone must be checked.

Use:
- targeted tests/lint/typecheck via `bash`
- `cc_tldr` (`impact`, `whatbreaks`, `secure`, `smells`, `bugbot`, `health`) where useful
- review workers for cold audit if the change is risky

If validation fails:
- run focused fix loops
- cap repair rounds
- escalate to the user when the trade-off becomes architectural or product-level

## EVOLVE

After successful implementation:
- extract corrections/discoveries
- write back useful knowledge with `cc_bloks`
- recommend stronger deterministic enforcement where possible
- create a handoff with `cc_create_handoff` before risky boundaries or when stopping

## Resume behavior

When resuming existing autonomous work:
- read the latest contract
- inspect latest reports/validation
- continue from the next pending assertion or milestone instead of replanning from scratch
