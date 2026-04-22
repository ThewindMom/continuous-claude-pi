---
description: Run a staged-change review using Continuous Claude Pi review workflow
argument-hint: "[extra focus]"
---
Run the Continuous Claude Pi review workflow against staged changes.
Use git diff for staged files, gather structural analysis with `cc_tldr`, then produce a verdict.
Extra focus: $@
