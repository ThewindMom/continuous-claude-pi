---
name: upgrade-harness
description: Extend the Continuous Claude Pi research harness or wrapper scripts for new external functions, bridge behavior, security rules, or dependency integrations.
allowed-tools: read edit write bash cc_ouros
---

# Upgrade Harness

Use when adding new external capabilities to the research/runtime bridge layer.

Typical cases:
- new Ouros helper command
- new research bridge
- new FastEdit/TLDR helper behavior
- new dependency integration

## Process

1. understand the new capability and security constraints
2. inspect existing wrappers and patterns
3. implement minimal safe bridge logic
4. test the happy path and failure path
5. update docs and examples

Prefer deny-by-default security behavior for any command, path, or network-sensitive integration.
