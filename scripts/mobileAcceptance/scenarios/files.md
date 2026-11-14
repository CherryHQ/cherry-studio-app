# File preview runbook

Status: draft. Agent-readable steps, not recorded automation; no device validation.
[Cases](../cases.json) own one result per format. [Sample requirements](../fixtures/README.md)
describe suitable caller-provided data and optional bundled examples.

## Inputs

Ask which files and device-accessible locations to use. Keep a mapping from each selected
`files.<format>` case to the actual file, recognizable content marker and MIME type.
A host path alone does not establish device availability. Do not import or replace the user's
dataset without the corresponding instruction.

## Format sweep

For every selected format case:

1. Locate the specified sample in the library and open it using the actual preview entry.
2. Observe recognizable content and exercise the case's basic viewer interaction.
3. Return and verify the library remains usable.
4. Save that case/device result before opening the next format.

Use a second known page for PDF, a second worksheet for XLSX and a second slide for PPTX.
DOCX and RTF need content long enough to scroll. Text/code samples need a known later marker.
Do not substitute raw HTML source for a successful rendered HTML preview.

Record the actual opening path and MIME type; the app's preview classifier uses MIME type.
If preparation converted a sample into another format, do not claim the original format's preview
was exercised. Record the supported fallback when it is the product's actual path for that input.

The `files.doc`, `files.xls`, `files.ppt`, `files.odt`, `files.ods` and `files.odp`
cases use an exposed platform-viewer handoff. Unavailable samples or external viewers are
incomplete with a reason, not proof of an application crash or a successful preview.

## Other entry points

Use one sent attachment for `files.chat-entry` and one caller-approved assistant-produced file
for `files.assistant-entry`. Keep both as separate results. Do not multiply every format by every
entry point or trigger an unrelated assistant tool call just to populate the second case.

## Script capture

The library-to-preview-to-library route may be reusable after observation. Content markers and
format-specific page/sheet/slide controls remain inputs. A screenshot of a viewer shell without
recognizable file content is not a passing result.
