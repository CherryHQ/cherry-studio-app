# Internal Diagnostic Agent

This module owns Cherry Mobile's internal diagnostic Agent: its definition, fixed read tools,
model execution, evidence delivery, and answer validation. It reuses the isolated Pi memory runtime.
It does not create a user Agent, application conversation, persistent transcript, or global run state.

## Edit The Agent

[diagnosticAgent.json](./diagnosticAgent.json) is the single editable definition:

- `instructions` contains the role, investigation rules, privacy requirements, and answer format.
  Only `{{language}}` and `{{toolCalls}}` are substituted for each run; incident data stays in the
  separately validated input and never becomes instructions.
- `tools` contains the four fixed evidence descriptions. The shared result contract determines
  the supported evidence kinds; callers cannot register or replace tool metadata.
- `reasoningEffort` explicitly requests `none`, matching translation and automatic naming. The
  shared model adapter handles models that cannot disable reasoning.
- `limits` declares the operation deadline, tool/model-call budgets, result size, collected answer
  size, and output-token cap.
- `answer` declares the maximum cause length, advice length, and advice count used by the strict
  answer validator.

The JSON resource is bundled by the existing Metro/TypeScript JSON support. Editing the definition
does not require changes to the execution function or a new resource loader.
The resource declares policy; the diagnostic session and runtime enforce deadlines and budgets.

## Public Boundary

The only implementation export is `createDiagnosticAgent` from this module's root. Bootstrap binds
the existing runtime's `preflightModel`/`open` capabilities and usage recorder once. Each `run` opens
its own memory session, collects its own evidence, and closes its session and joins admitted work
before returning.
ESLint protects the implementation files and definition resource from external deep imports.

[diagnosticSession](../../../../shared/contracts/diagnosticSession.ts) owns the pure interfaces:

- `DiagnosticAgent` exposes `timeoutMs` and `run(request)` without an AI SDK or Pi dependency.
- `DiagnosticAgentRequest` supplies the selected model, language, safe incident/check context,
  scoped fact readers, cancellation signal, and optional evidence observer.
- `DiagnosticFactReader` binds configuration, endpoint, plugin, and log reads to their result types.
  It supplies facts rather than tool names, descriptions, argument schemas, or execution policy.

Frontend callers continue to use `Backend.diagnostics.createSession`. The
[diagnostic service](../../../services/diagnostics/README.md) owns the incident target, configuration
freshness, local data reads, and session admission. It enforces the Agent's declared deadline from
the start of preflight reads, so module extraction does not restart the sixty-second budget.
Closing the sheet or stopping bootstrap aborts and joins that caller-owned session.

## Implementation Owners

- `diagnosticAgentDefinition.ts` reads the resource, renders the two prompt parameters, and defines
  the strict answer validator using the declared bounds.
- `diagnosticAgentTools.ts` binds the closed evidence kinds to this run's readers, validates results,
  enforces result-size limits, and emits evidence only after an actual read succeeds.
- `createDiagnosticAgent.ts` preflights the model, executes the isolated request, handles events,
  parses the final answer, and joins memory-session cleanup and usage recording.

The runtime admits only automatic read tools and enforces the tool/model-call limits before further
execution. The service's fact readers retain their existing privacy projections and fixed targets.
The shared evidence contract remains the owner of data exchanged with the UI; the UI does not read
this Agent definition or parse provider/tool payloads.

Changing a prompt or description is a resource edit. Adding an evidence kind also requires its shared
result shape, a scoped fact reader, and an explicit UI presentation; it does not require exposing Pi
or tool-registration details to feature entry points.
