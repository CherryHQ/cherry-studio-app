# Message Detail

Content adapters used by message tools, remote resources, and AI failure details. They compose
CherryUI's `MessagePart.Section` and `SectionBody` inside the existing detail sheet; they never own
a sheet or its open state.

- `MessageDetailSection` supplies a localized, section-scoped copy action. Its `copyText` callback
  resolves the full original text only when pressed and reports clipboard outcomes through toast.
- `MessageDetailText` renders complete prose through CherryUI `MessagePart.TextBody`, or `CodeBlock`.
  Short prose keeps its natural height. Long prose uses bounded text blocks in a virtualized scroll
  viewport; native selection stays within one block, while the section action copies the original
  value including its line endings. Ordinary tool results use the same text body.
  Code blocks have one title/copy action and a bounded native scroll viewport; scrolling reaches the full source and
  copying preserves the original text, including trailing newlines. There is no character budget.
  Tool detail sheets mount this content only when opened.
- `MessageDetailValue` presents invocation arguments as formatted JSON. Human-facing metadata
  continues to use `MessagePart.ValueSection` fact rows.

Single code/JSON results use the same content block as arguments and logs. Mixed results retain
the section-wide copy action and each standalone code block's own scoped action; no result blocks
are dropped because earlier content is long. Markdown documents retain their native per-block
menus. These adapters preserve the value they receive; an upstream tool-output limit still belongs
to that tool and its managed output file.

Arbitrary tool text remains plain text. Only an explicit code language or trusted content adapter
selects richer rendering. Translations and clipboard effects stay here; presentation stays in CherryUI.
