# Main-path acceptance instructions

Status: three main-flow e2e tests and Markdown runbooks for exploration. The tests are drafts
written from the app source and have not been replayed with the e2e runner yet. This
package does not install an environment, start a device, build a client or start Metro.

## Choose the work

- **Prepare or maintain assets:** edit the catalog, runbooks, optional samples or report template.
  Do not start an app, device, model call or acceptance run just because these assets were requested.
- **Run acceptance:** use the initiating user's existing environment and the selected scope.
  Follow the active task's authorization for execution and device actions.

[Cases](./cases.json) are the single source of case IDs, steps, expected outcomes and prerequisites.
Read the selected module's [runbook](./scenarios/) for ordering and product-specific details.
The Markdown runbooks are exploratory instructions. Automated execution uses the
[e2e tests](./tests/), with the supported scopes recorded in the catalog's `scripts` metadata.

## Automated execution

For an automated run, prepare the caller's device and Metro once, then run `pnpm acceptance run` as
documented in [Mobile Acceptance](../../docs/guides/mobile-acceptance.md#automated-runs). The tests
own UI steps and assertions. Each clears the app data and completes onboarding against a local mock
chat service, so automated runs need a disposable device rather than the caller's dedicated data.
The coding agent reads the e2e report and maintains tests when evidence identifies a gap.

Do not convert an untested case, locator failure or unexpected screen into a manual UI task during
that run. A separate authorized exploratory run can discover the missing route and a later
maintenance change can encode it. Keep the first failed report; never overwrite it with the
repaired run or mark a test verified from type checks alone.

The testing agent only performs `agent.act` steps; deterministic assertions decide every result.
A tap that succeeded or a quiet screen is never a pass.

## Resolve the caller's choices

Read the current request and conversation first. Ask together for only the unresolved choices:

| Choice | Record |
| --- | --- |
| Code target | Current code, branch or PR; repository/project directory and exact revision when resolved |
| Environment | Existing app/client and relevant development/test services |
| Device | The caller-selected physical device or simulator, platform and stable identity |
| Data | The caller's dedicated dataset, in-app Agent/model/provider identities and sample-file locations |
| Scope | Selected case IDs; use the full main-path baseline unless the caller limits it |

For example: "Which code or PR, existing environment, test device and dataset should I use?"
Omit any parts already answered. Do not ask the user to type credentials into the report.

If the device is unclear, offer a read-only inventory with name, platform, type and current state.
Discovery supplies candidates; it does not select a device, dataset or environment on the user's
behalf, even when only one candidate is found. Do not infer a test device from its list position.
Once choices and authorization are clear, proceed without another confirmation cycle.

A local configuration file is not required for the user to choose an environment. For automated
runs, pass the resolved device names through the documented environment variables; do not require
the user to hand-author them. A machine caller supplies the same inputs explicitly instead of
relying on an interactive question.

## Bind the actual target

For current code, record the checkout's commit and local-modification summary. Do not label it as
an exact remote PR revision if it includes unrelated local edits. For a PR, resolve its repository
and head commit for this run; do not switch the target if the PR changes during execution.
Use an independent checkout when needed, preserving the user's working changes and following
[Git Workflow](../../docs/guides/git-workflow.md).

Reuse the compatible app and services provided by the caller. A development client must open the
service for the selected checkout; an app merely being installed is not proof that it runs the PR.
Record missing native compatibility evidence, access or dependencies as a concrete blocker.
Do not automatically build, reinstall, import a database or repair the environment.

Use the selected device tool's documented capabilities. When using the repository's existing
agent-device workflow, read [its skill](../../.agents/skills/agent-device/SKILL.md), installed command
help and the applicable ownership/compatibility guidance in
[Parallel Device Testing](../../docs/guides/parallel-device-testing.md). That guide's named workspace
devices, environment variables and snapshot design are not portable prerequisites for this asset
package. Physical-device execution needs a tool that supports the caller's explicitly selected
test device; this package does not implement pairing or physical-device setup.

Use a separate session for the selected task and respect host-wide device ownership. Do not take
over another active owner. Keep operations serial on a device. Release only resources owned by
this run; preserve the caller's device, pre-existing services and dedicated data.

## Prepare the selected cases

This section and the next two apply to exploratory runs; automated runs use the e2e report.

Write a report under a caller-selected location, or
`.local/agent-self-testing/runs/<run-id>/` inside the project. Keep evidence paths relative to the
report directory. Start from [the report template](./report-template.md).

Freeze the selected case IDs and devices. Every selected case/device pair starts as `incomplete`
with reason `not-run`; replace that entry as observations are made. Never omit an unreported case
from the final result. A module is a navigation convenience, not one combined pass.

Resolve each case's `requires` entries from `dataRequirements` and its optional `condition`.
Use [sample requirements](./fixtures/README.md) to ask for missing formats or capabilities.
Bundled samples are optional and are used only when the caller selects them. Files on the host
are not automatically available inside the device library or picker.

Keep a short ledger of run-created conversations, Agents, boards, versions and files. Reuse those
objects across related cases. When a prerequisite case fails, continue independent cases; dependent
cases remain incomplete unless their prerequisites can be met within the selected scope.
Preparation steps do not automatically count as passed test cases.

## Execute and observe

Follow each selected case once through its normal path. Use current UI observations and stable
selectors when available; do not fabricate coordinates or reuse stale element references.
Share navigation and generation across related cases only when each expected outcome is observed
and recorded separately. Do not expand into parameter matrices or output-quality judging.

Absent @model, multiple-model, permission or other requested controls remain explicit gaps.
Do not silently substitute a different operation. Conditional file handlers or retry receipts
that are unavailable remain incomplete with the reason recorded; no failure injection is required.

Use only the requested model calls and caller-approved providers. Do not automatically repeat paid
generation until it passes. Correcting a navigation mistake is different from erasing a product
failure. Never fix app source or change a case's expected result during acceptance.

Preserve the chosen dedicated dataset. Delete only run-created objects after their dependent
checks. Record original reversible setting values and restore them; report any restoration failure.
Do not submit diagnostics, clear app data, restore a backup or download an app update as part of
these cases. Ask for a suitable disposable input if an operation cannot preserve the caller's data.

## Report truthfully

- `passed`: the action and expected visible outcome were actually observed, with evidence.
- `problem`: an established product failure; include reproduction steps and the observed outcome.
- `incomplete`: not executed, unavailable input/capability, interrupted work or unresolved cause.

Successful clicks, a quiet screen, a zero process exit or syntactically valid output are insufficient
evidence of a pass. Use targeted observations and screenshots for visual claims when available.
On failure, retain a screenshot and relevant log window when accessible; explain unavailable evidence.

Unexpected termination is suspected crash until supported by process/crash evidence. Record fatal
UI errors as observed, and include elapsed waiting time for a suspected hang. A model-service error,
missing selector or timeout alone does not establish an app crash.

Persist each completed result before moving on. Cancellation or later failure leaves remaining
cases incomplete and preserves earlier observations. The final report lists omitted work, unresolved
conditions and any restoration still needed. Do not produce a numerical overall score.

## Accumulate tests

Turn observed stable steps into an e2e test under [tests](./tests/), titled with its case ID.
Use `agent.act` for navigation goals and follow every goal with a locator assertion, so the runner
records it for replay. Use `screen` actions for exact values and assert outcomes with locators,
never with the agent. Prefer `testID`s and accessible names from the source.

Keep new tests `draft` in the catalog's `scripts` metadata until an authorized replay passes.
Record exact case IDs, platform, app revision, tool versions and a reviewed evidence reference.
Validation applies only to that stated scope. Set the case's `automation` to its test file.
Keep original failure evidence after a repair. Do not commit credentials, private device
identifiers or unreviewed run data.
