---
name: diagnose-fix-loop
description: Iterative diagnose-and-fix workflow that repeatedly uses the diagnose skill to find a proven problem, plan the smallest credible improvement, implement it, re-diagnose, and continue until no useful fix remains or user intervention is required. Requires the diagnose skill; selected installs must also install diagnose. Use when asked to keep debugging, fix and verify, iterate until satisfied, improve after diagnosis, or run a diagnosis/fix/verification loop.
---

# Diagnose Fix Loop

Use this skill to drive a complete improvement loop, not a single debugging pass.

Before starting, load and follow `$diagnose`. Treat `$diagnose` as the evidence engine for each pass; this skill only adds the outer loop that plans, implements, re-runs diagnosis, and decides whether to continue.

This skill owns planning and implementation after `$diagnose` proves the cause.

Selected installs do not install dependencies automatically. If `$diagnose` is not installed or available, stop before making changes. Tell the user to install it with:

```bash
npx skills add LegendApp/legend-skills --skill diagnose
```

Then ask them to retry after installation.

## Loop

1. State the target outcome.
   Anchor the loop to the user's symptom, performance goal, failing test, UX defect, regression, or code quality concern. If the user gave no concrete anchor, create the fastest observable feedback loop first.

2. Run a `$diagnose` pass.
   Complete the evidence loop and record the exact validation signal that will be re-run after the fix. Proceed only when `$diagnose` reports **Proven — 100%**. If it reports **Incomplete**, stop and report the missing evidence.
   If the user asked for delegation, use it only for bounded evidence collection inside this pass; keep bottleneck ranking, fix selection, code edits, and final interpretation in the main loop.

3. Make a ranked fix plan.
   Prefer one smallest credible fix at a time. The plan must include:
   - what evidence supports the change
   - what file or boundary will change
   - what validation should improve
   - what would make the plan wrong

4. Implement only the top plan item.
   Keep the edit scoped to the proven fault line. Avoid stacking speculative cleanup, broad refactors, or adjacent improvements unless the diagnosis showed they are part of the same fault.

5. Verify with the original signal.
   Re-run the reproduction path or measurement from step 2, then focused regression coverage, then broader checks when the touched surface warrants them.

6. Re-run `$diagnose`.
   Diagnose the new state from evidence, not from the intent of the change. Look for:
   - the original symptom still failing
   - a nearby remaining fault
   - a regression introduced by the fix
   - a stronger next bottleneck revealed by the first fix
   - missing coverage at the real seam

7. Decide whether to continue.
   Continue when evidence identifies a credible next fix and the next action is safe to take. Each new iteration should have a sharper target than the previous one.

## Iteration Discipline

Keep a short running log while working:

- iteration number
- current evidence
- chosen fix
- validation result
- next remaining issue or stop reason

If an experiment fails, revert it unless it is independently useful and intentionally kept. Do not count a failed experiment as progress unless it narrowed the diagnosis.

If two iterations produce no measurable improvement and no sharper evidence, pause implementation and re-diagnose the feedback loop itself before making more edits.

## Stop Rules

Stop only when one of these is true:

- `$diagnose` cannot build or run a credible feedback loop with available code, tools, or artifacts
- the next action requires user input, inaccessible external state, credentials, production access, or a destructive operation
- the user requested read-only diagnosis and the next useful step would edit files
- validation is clean and a fresh `$diagnose` pass finds no remaining credible fault to fix
- remaining improvements are speculative, cosmetic, or outside the user's target outcome

When stopping, report the final state, the validation evidence, remaining known risk, and the smallest user action or artifact needed if work is blocked.
