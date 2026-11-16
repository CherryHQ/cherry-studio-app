# Diagnosis

`DiagnosisSheet` is the shared error-triggered diagnostic surface. The feedback host owns incident
handoff and mounts one full-height CherryUI sheet. Checks, model selection, analysis, and local
check details replace its content without stacking sheets or creating a settings page.

The mounted sheet owns its cancellable diagnostic session. Opening runs bounded read-only checks;
AI starts only after model selection and an explicit start action beside the data/fee disclosure.
Closing or leaving the source route disposes the session. Feedback receives only the incident and
structured check summary. Settings actions use overlay navigation before leaving the sheet.

The model step uses the shared compact model list and original brand avatars. A single primary
footer action stays in place across steps; report feedback lives in the header, and the model step
groups the fee notice with its expandable data scope.

Analysis shows the complete cause and all advice directly. One evidence list contains the local
check snapshot and the AI's collected evidence; each entry expands in place with an eight-point
gap. Local check statuses remain separate from later tool observations, rather than assuming that
two checks at different times are interchangeable. Model attribution is one quiet line below the
content.

Evidence arrives as the shared `DiagnosticEvidence` union, with tool-specific validated data or
an explicit size-limit outcome. Each entry formats these facts directly and offers full raw-data
copy through `MessageDetail`, without nested raw-data disclosures. Native row presses own toggling;
selectable fact values and the copy button stay outside that press target. The exhaustive tool
switch makes a newly added evidence type require a presentation decision. Authentication problems
exclude a provider from model selection, while a model-endpoint problem excludes only that model.
