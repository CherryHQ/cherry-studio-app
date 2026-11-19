# Common navigation runbook

Status: draft. Agent-readable steps, not recorded automation; no device validation.
Use the case definitions and expected outcomes in [cases.json](../cases.json).

`common.onboarding` and `common.launch` are [automated](../tests/common.e2e.ts);
`common.relaunch-chat` is part of the
[chat test](../tests/chat.e2e.ts). Do not substitute these exploratory instructions for other common
cases during an automated run.

## Inputs

Resolved code target, environment, device, application identity and dataset from the caller.
For relaunch checks, retain a run-created recent conversation and board from the selected modules.
Do not create a new device or switch datasets to satisfy these inputs.

## Sequence

1. Run `common.launch` against the selected app and actual code target. After development hot
   reload, persistence checks need a full app relaunch, not only a JavaScript refresh.
2. Run `common.navigate`, using the visible navigation for the current screen size. Record each
   destination reached; do not infer success from a press alone.
3. Exercise `common.background` during ordinary use, then return to the same app/session.
4. After chat and drawing content exists, fully relaunch once and separately record
   `common.relaunch-chat` and `common.relaunch-board`. The same relaunch can serve both.
   If only one prerequisite exists, the other selected case stays incomplete.

Do not make an unrelated launch failure invalidate results already saved. After an unexpected
exit, retain evidence before reopening to continue independent work.

## Script capture

Stable destination navigation may be recorded after observation. Keep device/session identifiers
as inputs and retain a destination check plus a return check. Relaunch instructions must use the
chosen device tool's current syntax; no command is presumed here.
