---
name: autonomous-research
description: Iterative Continuous Claude research loop in Pi using Ouros-backed hypothesis tracking, workers, artifacts, and TLDR/bloks support.
allowed-tools: Agent bash cc_ouros cc_tldr cc_bloks cc_create_handoff
---

# Autonomous Research

Use this when the destination is not yet clear and you need iterative, evidence-based exploration.

## Core model

- hypotheses first
- workers research
- Ouros stores state
- artifacts come back into Pi
- loop until confidence is high enough or the user stops

## Artifacts

- `continuum/research/<topic>/research_contract.json`
- `continuum/research/<topic>/findings.md`
- `continuum/research/<topic>/artifacts/*.md`
- `continuum/research/<topic>/reports/*.json`

## Workflow

1. define hypotheses and confidence targets
2. create/reuse Ouros session names
3. spawn worker/oracle agents to research inside Ouros or through external sources
4. update contract confidence and status
5. synthesize findings into artifacts
6. loop if uncertainty remains

Prefer:
- `cc_ouros` for session operations
- `cc_tldr` for codebase-specific structure/impact/context
- `cc_bloks` for recording durable findings

Create a handoff when context is getting tight or when the user wants to pause.
