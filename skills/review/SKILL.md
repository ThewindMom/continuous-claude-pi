---
name: review
description: Structural plus semantic code review in Pi using TLDR analysis, diff inspection, and delegated review workers where useful.
allowed-tools: Agent bash read cc_tldr cc_fastedit
---

# Review

Use for:
- review this code
- review my changes
- review staged work
- pre-merge or pre-push checks

## Review model

Anchor semantic reasoning on deterministic facts.

### Structural fact gathering
Use `cc_tldr` for relevant commands such as:
- `bugbot`
- `impact`
- `whatbreaks`
- `smells`
- `secure`
- `health`
- `cognitive`
- `complexity`

Use `bash` for git diff and narrow file lists.
If the review is large, spawn one or more `Agent` workers to gather structural findings while the main thread stays focused on synthesis.

### Semantic review
Then reason over:
- changed code
- structural findings
- possible regressions
- missing tests
- security risks
- architectural drift

## Output

Prefer this shape:
- verdict
- blocking issues
- warnings
- observations
- suggested next actions

If the fixes are straightforward and user wants action, route into `/skill:autonomous`.
