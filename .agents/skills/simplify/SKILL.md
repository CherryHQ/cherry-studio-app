---
name: simplify
description: Keep code, tests, documentation, configuration, and other changes as tight, clear, performant, and minimal as possible without weakening behavior. Use during implementation to prevent unnecessary complexity, after behavior is proven to consolidate working changes, before handoff for a full branch audit, and when asked to simplify, tighten, clean up, reduce verbosity, remove complexity, or minimize existing work.
---

# Simplify

Produce the smallest clear implementation that fully satisfies the required behavior. Minimize concepts and moving parts, not line count.

## Cadence

- During construction, apply the priorities locally while discovering behavior. Allow clearly temporary instrumentation or scaffolding when it accelerates learning.
- At convergence, once a logical behavior slice passes, simplify that slice, remove superseded attempts, and rerun focused validation.
- Before handoff or merge, compare the full branch with its merge base and reconcile code, tests, comments, documentation, configuration, and relevant history.

## Workflow

1. Identify the required behavior, invariants, constraints, and non-goals.
2. Inspect the relevant diff and separate it into logical concepts. For a final branch audit, compare the full branch with its merge base and check history for superseded attempts when relevant.
3. Inspect the existing owners, sources of truth, common path, and decision points before adding anything.
4. Choose the design with the fewest necessary concepts and the least work at runtime.
5. When changes are requested, implement directly and reuse existing mechanisms where they fit.
6. Validate behavior with checks proportional to the risk.
7. Review the final code, tests, names, comments, documentation, configuration, and relevant history for anything that no longer earns its complexity.

## Simplification Priorities

- Prefer deletion, reuse, or a direct change over a new abstraction.
- Keep one source of truth; avoid mirrored state, overlapping guards, duplicate registries, and compensating mechanisms.
- Avoid speculative fallbacks, compatibility paths, configuration, parameters, and generic APIs.
- Inline one-use helpers when doing so makes the policy clearer at its decision point.
- Prefer straightforward positive control flow over early-return chains or empty branches.
- On hot paths, minimize allocations, callback recreation, subscriptions, renders, passes, I/O, and native work.
- For prose, remove repetition and keep the shortest wording or example that remains self-sufficient.

## Existing Work

Establish a passing baseline before simplifying working code. Test one questionable concept at a time, rerun the relevant validation, and restore it if behavior or meaningful coverage weakens. Do not restructure several accumulated fix attempts before establishing which changes are causally necessary.

When duplicate or ineffective regression coverage is suspected, deliberately break the claimed invariant and confirm the remaining test fails. Passing tests alone do not prove that every test or implementation concept is necessary.

Do not rewrite branch history without authorization.

## Performance Changes

Name the exact common-path work being removed: allocations, scans, mounts, renders, subscriptions, I/O, or native calls. Control-flow evidence plus regression tests can justify removing work that is structurally unused. Require a benchmark, profile, or repeated repro when an optimization changes semantics or introduces a tradeoff. Do not add complexity for theoretical gains.

## Guardrails

- Preserve correctness, required behavior, type safety, distinct regression coverage, and useful clarity.
- Do not replace clear code with compressed or clever code merely to reduce lines.
- Make scoped, behavior-preserving improvements directly. If the better design requires a sweeping API or architecture change, explain and suggest it instead of expanding the task without approval.
- Leave unrelated and user-authored changes untouched.

Stop when every remaining concept supports a requirement, invariant, clarity, or measured performance need. Report only material simplifications, validation, and unresolved opportunities.
