# Validation checklist

## Static checks

```bash
npm run typecheck
./scripts/check-deps.sh
```

## Manual Pi validation

1. Install locally with `pi install ./continuous-claude-pi`
2. Run `/cc-check-deps`
3. Run `/cc-setup`
4. Open a large source file with `read` and confirm TLDR read assist appears
5. Perform an edit/write and confirm diagnostics are appended when TLDR diagnostics is available
6. Run `/cc-create-handoff` and inspect generated file
7. Trigger `/compact` and confirm an automatic handoff is written before compaction
8. Invoke `/skill:autonomous`, `/skill:research`, and `/skill:review`
9. Confirm `cc_tldr`, `cc_bloks`, `cc_ouros`, and `cc_fastedit` tools are visible to the model
10. Confirm coexistence with pi-fff, Serena, pi-vcc, and condensed-milk
