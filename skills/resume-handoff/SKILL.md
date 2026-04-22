---
name: resume-handoff
description: Resume work from a Continuous Claude Pi handoff by reading the handoff, verifying current state, and continuing the right workflow.
allowed-tools: read grep bash Agent
---

# Resume Handoff

Use when the user wants to continue from a previous handoff.

## Flow

1. Locate the handoff path or latest handoff in the relevant folder
2. Read it fully
3. Verify referenced files/artifacts still exist and current state has not drifted dangerously
4. Present a short synthesis of:
   - original task
   - current state
   - recommended next actions
5. Continue via the appropriate workflow, often `/skill:autonomous`

If the handoff contains a `next_session_prompt`, prefer it as the main continuation seed.
