# Diagnosis

`DiagnosisSheet` is the shared error-triggered diagnostic surface. The feedback host owns incident
handoff and mounts one full-height CherryUI sheet. Checks, model selection, analysis, and evidence
details replace its content without stacking sheets or creating a settings page.

The mounted sheet owns its cancellable diagnostic session. Opening runs bounded read-only checks;
AI starts only after model selection and an explicit start action beside the data/fee disclosure.
Closing or leaving the source route disposes the session. Feedback receives only the incident and
structured check summary. Settings actions use overlay navigation before leaving the sheet.

The model step uses the shared compact model list and original brand avatars. A single primary
footer action stays in place across steps; report feedback lives in the header, and the model step
groups the fee notice with its expandable data scope.

Evidence arrives as the shared `DiagnosticEvidence` union, with tool-specific validated data or
an explicit size-limit outcome. The detail view formats these facts directly; its exhaustive tool
switch makes a newly added evidence type require a presentation decision. Authentication problems
exclude a provider from model selection, while a model-endpoint problem excludes only that model.
