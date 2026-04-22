---
name: premortem
description: Pre-implementation failure analysis using tiger, paper-tiger, and elephant risk classification before major execution begins.
allowed-tools: read grep Agent
---

# Premortem

Use after planning/specification and before significant execution.

Project forward to failure, then reason backward.
For each risk, identify:
- the real assumption
- the root cause
- a falsifiable test
- mitigation
- whether it is a tiger, paper tiger, or elephant

## Decision gate
- **BLOCK** if tiger risks lack mitigation
- **WARN** if risks are acceptable but important
- **PASS** if major failure paths are already constrained

Every risk should include evidence and a disproof test. If you cannot say how the risk could be disproved, it is too vague.
