---
name: bootup
description: Get a project Continuous-Claude-ready in Pi by checking dependencies, assessing readiness, and routing to autonomous, research, or review.
allowed-tools: bash cc_stack_status cc_tldr cc_bloks cc_ouros cc_fastedit Agent
---

# Bootup

You are a dispatcher. Do not implement code directly unless the user explicitly overrides the workflow. Your job is to:

1. Check Continuous Claude Pi dependency status with `cc_stack_status`
2. Ask the user what kind of project/task this is
3. Run readiness assessment scripts when available
4. Route to the right workflow skill

## Questions to ask

Ask the user for:
- project type: new vs existing
- language/framework
- desired starting mode: research, autonomous, or review

If `ask_user_question` is available, prefer it. Otherwise ask plainly in chat.

## Readiness flow

- If the current project contains `scripts/readiness.sh`, run it with `bash`
- If the current project contains `scripts/readiness-fix.sh` and readiness gaps look automatable, run it
- Re-run readiness after fixes
- Summarize:
  - detected stack
  - before/after readiness level
  - highest-risk failures

If readiness scripts are absent, fall back to:
- `cc_tldr structure` on likely source roots
- lightweight inspection of project configs
- a short readiness summary

## Routing

After summarizing readiness, route by invoking the matching workflow:
- `/skill:research` for open-ended exploration
- `/skill:autonomous` for build/plan/execute
- `/skill:review` for code review

If the user says “just start building”, prefer `/skill:autonomous`.
