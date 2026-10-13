# Text translation

`createTranslationModule` owns read-only AI translation for Skill documents and message reading.
It resolves `feature.translate.model_id`, falling back to `agent.default_model_id` only when the
translation preference is unset. An invalid or removed explicit selection fails without switching
models. The existing model picker owns that preference and retains previous selections.

The frontend supplies the shared resolved app language. Generation preserves Markdown, code,
links, and identifiers, treats input as data, and runs through `AiService` for provider adaptation
and usage capture. An optional callback receives cumulative streaming text. Cancellation is passed
through and checked before publishing chunks and accepting the final result.
Generation retains its finish reason; translation rejects output cut short by a length limit,
content filter, or provider error before consumers can save it as a success. Other generation
consumers retain their own completion policy. Skill caches from before this completion check are
not reused because their completeness cannot be established.

Consumers own saved results and presentation; this module never edits documents, messages, or
Agent history. Errors expose closed codes for localized feedback, while diagnostic details remain
in the backend.
