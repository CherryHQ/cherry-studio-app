# Message Detail

Content adapters used by message tools, remote resources, and AI failure details. They compose
CherryUI's `MessagePart.Section` and `SectionBody` inside the existing detail sheet; they never own
a sheet or its open state.

- `MessageDetailSection` supplies a localized, section-scoped copy action. Its `copyText` callback
  resolves the full original text only when pressed and reports clipboard outcomes through toast.
- `MessageDetailText` renders selectable prose or the existing native highlighted code renderer.
  A bounded preview keeps large responses out of native text layout; copy retains the full value.
- `MessageDetailValue` presents invocation arguments as formatted JSON. Human-facing metadata
  continues to use `MessagePart.ValueSection` fact rows.

Arbitrary tool text remains plain text. Only an explicit code language or trusted content adapter
selects richer rendering. Translations and clipboard effects stay here; presentation stays in CherryUI.
