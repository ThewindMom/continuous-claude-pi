---
name: research
description: Exploratory research via Ouros sessions, TLDR context, external docs/search, and compact artifact generation.
allowed-tools: bash cc_ouros cc_tldr cc_bloks Agent
---

# Research

Use for open-ended investigation where the answer is not yet known.

## Preferred medium

Ouros should be the memory medium for deeper research when available.
Use Pi context for orchestration and conclusions, not for holding large raw research state.

## Recommended flow

1. define the question precisely
2. pick a session/topic slug
3. use `cc_ouros` to run or resume research work
4. use `cc_tldr` when research requires codebase structure, context, or impact
5. use `cc_bloks` to record durable discoveries
6. write a compact artifact at `continuum/research/<topic>/findings.md`

If the question depends on external docs or web research, use an oracle-style subagent via `Agent` and have it return sourced findings.
