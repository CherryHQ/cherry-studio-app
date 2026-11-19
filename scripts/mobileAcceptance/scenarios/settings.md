# Settings runbook

Status: draft. Agent-readable steps, not recorded automation; no device validation.
[Cases](../cases.json) own independent results for the controls.

## Inputs and restoration

Use the caller's dedicated test provider/profile and approved models. Record original reversible
values before mutation, without copying secrets into evidence. Establish how to restore a profile
avatar before replacing it. If restoration is not possible, ask for disposable test data.

Prefer settings checks after chat/drawing checks that depend on shared configuration, or restore
changes before continuing those dependent checks. Capture a product failure even if restoration
later succeeds.

## Sequence

- `settings.provider-edit`: use a reversible field on the dedicated provider and reopen after
  saving. `settings.models-load`: exercise only a real offered load action.
- `settings.model-add`: use the caller's actual valid model definition, recording any run-created
  entry for cleanup. `settings.provider-toggle`: restore its original enabled state.
- `settings.default-chat` and `settings.default-image`: inspect the feature that consumes the
  default and use the selection once. An existing Agent's explicit model override is not evidence
  that a changed global default failed. Restore both defaults.
- For `settings.theme`, `settings.language`, `settings.font-size` and `settings.watermark`,
  change one control at a time, leave/reopen as appropriate and restore its value.
  The watermark case checks saving the setting, not an unrequested image export.
- Use `settings.profile-name` and `settings.profile-avatar` on the approved test profile,
  inspecting the saved result and restoring it.
- `settings.notifications`, `settings.permission-details` and `settings.system-settings`
  exercise the offered control/details/handoff and return. Missing platform controls stay visible
  as incomplete; do not request unrelated permissions or send a notification to fill the gap.
- `settings.privacy` uses a reversible control only, with no diagnostic submission.
- `settings.data-page`, `settings.about` and `settings.info-dialog` cover navigation and
  information dialogs. They do not cover backup replacement, clearing data, migrations or updates.

## Evidence and capture

Record changed/reopened/restored values or visible outcomes per case. Persist restoration problems
in the report even when other cases succeed. Stable navigation may be recorded after observation;
the selected controls and original values remain inputs instead of hard-coded defaults.
