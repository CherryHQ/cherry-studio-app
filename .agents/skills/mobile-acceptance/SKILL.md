---
name: mobile-acceptance
description: Prepare, run, or maintain Cherry Mobile main-path acceptance using the shared benchmark and scenario runbooks. Use when the user requests mobile acceptance, release main-path checks, or reusable acceptance scripts.
---

# Mobile Main-Path Acceptance

Use the repository's [execution instructions](../../../scripts/mobileAcceptance/instructions.md)
and [case catalog](../../../scripts/mobileAcceptance/cases.json). Keep the catalog as the single
source of case IDs, prerequisites and expected outcomes.

## Match the request

- For benchmark or script preparation, create or update the assets without running the app.
- For an actual test request, resolve the code/PR, existing environment, device and dedicated data
  with the initiating user. Ask together only for choices not already supplied.
- For script maintenance, preserve existing product-failure evidence and expected outcomes.

Read only the selected modules' runbooks. Markdown runbooks and the e2e tests remain drafts until
their exact replay scope is validated. The package provides tests, not an environment installer;
see [automated runs](../../../docs/guides/mobile-acceptance.md#automated-runs).

For automated acceptance, prepare the device and Metro, set the documented device variables and run
`pnpm acceptance run`. The tests perform the operations and assertions and remove their data; the runner
records and replays agent goals and writes the report. Read `.e2e/summary.md` and failed tests'
`trace.md`; do not fill untested cases or repair a diverged run through ad hoc UI actions. Improve
the owning test separately, preserving the failed run, then replay when authorized. Only an
explicit exploratory request uses the manual runbooks directly.

## Resolve and execute

A read-only device inventory may help the user choose. It does not select an environment, device
or dataset on the user's behalf. Do not assume a fixed device name, host application, model vendor
or local path. Once the user has supplied the choices and task authorization, do not ask again.

Use the selected tool's documented device capabilities and the repository's applicable ownership
rules. Reuse the caller's compatible app and dedicated data. Missing setup is a reported condition,
not an instruction to build, reinstall, create devices or import a database.

For actual execution, preserve the selected catalog outcomes. The e2e tests own automated runs;
the [scenario runbooks](../../../scripts/mobileAcceptance/scenarios/) support explicitly requested
exploration. Preserve one result per selected
case/device pair, including incomplete cases. Do not silently substitute a normal model picker for
@model, omit a file format, or change expected behavior to obtain a pass.

Use the [report template](../../../scripts/mobileAcceptance/report-template.md). Keep raw credentials
out of shared assets and reports. Never fix application source during acceptance unless a separate
user instruction requests that work.

## Accumulate tests

Turn stable observed steps into e2e tests as described in
[Accumulate tests](../../../scripts/mobileAcceptance/instructions.md#accumulate-tests). Mark tests
verified only after an authorized replay, with the exact case/platform/app/tool scope recorded.
New tests remain drafts until then.

For asset layout and scope, see [Mobile Acceptance](../../../docs/guides/mobile-acceptance.md).
