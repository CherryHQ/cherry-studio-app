# Main-path acceptance report

Template only. Copy for an actual authorized run; replace the example fields and create one result
for every selected case/device pair. Do not treat this template as evidence of execution.

## Run context

- Run ID / time:
- Baseline catalog revision:
- Code target: current checkout / branch / PR; repository, commit and local-change summary:
- Environment and app/client identity:
- Device(s): selected identity, platform, physical/simulator and OS:
- Dataset: caller-selected identifiers and sample locations; no credentials:
- Selected case IDs:
- Execution tool/version:
- Preconditions unavailable:

## Results

| Case ID | Device | Status | Expected outcome reference | Observed outcome | Evidence / reason |
| --- | --- | --- | --- | --- | --- |
| <selected case ID> | <device ID> | incomplete | cases.json entry | Not run | not-run |

Statuses: `passed`, `problem`, `incomplete`. Replace the example with every selected pair, including
cases that could not run. Describe expected-versus-observed behavior without copying the full catalog.

## Problems and incomplete work

For each problem, include the case/device, short reproduction, what appeared, relevant screenshots
or log references and whether its cause is established. Record waiting time for suspected hangs.
List unavailable inputs, missing controls, unsupported viewers and interruptions separately.
A later successful reproduction does not erase the original failure.

## Data and cleanup

- Run-created objects retained or removed:
- Reversible settings restored:
- Restoration or cleanup still needed:
- Existing devices, services and dedicated data preserved:

## Script maintenance

- Draft scripts used:
- Stable steps captured for later replay:
- Authorized replay evidence, if any:
- Scripts needing update:

Automated runs use the e2e report instead (`report.json`, `summary.md` and each failed test's
`trace.md`); this template is for exploratory runs. Do not supplement an automated run with
inferred or manual passes.

## Structured result example

The metadata and results belong to one run. `selectedCaseIds × devices` defines the required result
pairs; retain an `incomplete` entry for anything not executed. The example below is intentionally not
a completed run. Evidence paths are relative to this report's directory.

```json
{
  "schemaVersion": 1,
  "runId": "<run-id>",
  "catalogRevision": "<catalog revision>",
  "target": {
    "kind": "<current | branch | pr>",
    "repository": "<repository>",
    "revision": "<resolved commit>",
    "localChanges": "<summary or none>",
    "appIdentity": "<installed client and code identity>"
  },
  "environment": "<caller-selected environment>",
  "dataset": "<caller-selected dataset reference>",
  "devices": [
    {
      "deviceId": "<selected-device-id>",
      "platform": "<ios | android>",
      "kind": "<simulator | physical>"
    }
  ],
  "selectedCaseIds": ["<selected-case-id>"],
  "results": [
    {
      "runId": "<run-id>",
      "caseId": "<selected-case-id>",
      "deviceId": "<selected-device-id>",
      "status": "incomplete",
      "observed": "Not run.",
      "reason": "not-run",
      "evidence": []
    }
  ]
}
```
