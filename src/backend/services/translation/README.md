# Text translation

`createTranslationModule` owns read-only AI translation for Skill documents and message reading.
It resolves `feature.translate.model_id`, falling back to `agent.default_model_id` only when the
translation preference is unset. An invalid or removed explicit selection fails without switching
models. The existing model picker owns that preference and retains previous selections.

The frontend supplies the target language explicitly chosen in the translation button's menu.
Generation preserves Markdown, code, links, and identifiers, treats input as data, and runs through
the bound `RuntimeTextGenerator` for the same provider adaptation and OAuth account resolution as
chat. It makes one text-only provider call without a conversation, history, or tools. The request
selects `reasoningEffort: 'none'`; the provider adapter handles models that cannot disable reasoning.
Bootstrap records its invocation usage. An optional callback receives cumulative streaming text.
Usage includes the shared provider-stream first-token, thinking, and completion timing metrics.
Cancellation is passed through and checked before publishing chunks and accepting the final result.
Generation retains its finish reason; translation accepts only normal `stop` completion, rejecting
truncation, filtering, tool requests, and provider errors before consumers can save a success.
Other generation consumers retain their own completion policy. A resolved result is therefore
complete, non-empty and was not cancelled; consumers do not repeat those checks.

Consumers own saved results and presentation; this module never edits documents, messages, or
Agent history. Errors expose closed codes for localized feedback, while diagnostic details remain
in the backend. Provider failures retain normalized codes and HTTP status; backend logs record
diagnostic metadata without source text, response bodies, or credentials.
