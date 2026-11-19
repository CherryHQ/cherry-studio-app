# Chat runbook

Status: draft. Agent-readable steps, not recorded automation; no device validation.
[Cases](../cases.json) own the actions and pass criteria.

`chat.send` and `chat.delete-conversation` are in the [chat test](../tests/chat.e2e.ts); the Agent
create, chat and delete cases are in the [Agent test](../tests/agents.e2e.ts). Do not substitute
these exploratory instructions for other chat cases during an automated run.

## Inputs and transient state

Use the caller-selected in-app Agent, approved model(s), attachment samples and dataset.
Keep the IDs/names of conversations and Agents created in this run. Preserve any model selection
changed on an existing test Agent; do not delete a pre-existing Agent or conversation.

## Sequence

- Exercise `chat.send` on a run-labelled conversation and retain its known phrase for search.
- Use that conversation for `chat.stop`, `chat.retry` and `chat.answer-branches`. A retry may
  provide the alternative needed for branch switching, but each case needs its own observed result.
  If the answer completes before stop can be used, stop was not exercised; do not keep sending
  paid requests automatically.
- Locate the actual @model entry for `chat.at-model`, and the multiple-model flow for
  `chat.multiple-models`. Do not use a normal single-model picker as a substitute. Missing
  controls are reported explicitly.
- Use a run-created message for `chat.fork`; retain the original and fork identities.
  Run `chat.history` and `chat.search` while those conversations still exist.
- Run `chat.attachment-preview`, `chat.attachment-remove` and `chat.attachment-send` on
  caller-approved samples. Removing a draft tile must not be confused with deleting the library
  file. Keep one sent attachment for `files.chat-entry` when selected.
- Exercise `chat.agent-create`, `chat.agent-edit` and `chat.agent-chat` on a run-created
  Agent. Preserve that Agent until all dependent chat work is complete.
- Run `chat.delete-message` on a disposable run-created message. Defer
  `chat.delete-conversation` until history, search, attachment and common relaunch checks no
  longer need that conversation. Likewise defer `chat.agent-delete` until its dependent checks end.

When a selected subset needs fresh disposable content, identify that prerequisite before creating
it. Do not claim setup actions as unselected test passes. Missing prerequisites do not justify
deleting caller-owned data.

## Evidence and capture

Record actual model/Agent identities without credentials. Capture answer selection and continuation,
not merely the branch button being pressed. Stable menu/navigation sequences may later be recorded;
streaming completion, model outputs and dynamic message identifiers require current observations.
