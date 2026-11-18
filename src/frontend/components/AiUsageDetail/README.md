# AI Usage Detail

Shared usage presentation for message summaries and individual model calls. This app-level adapter
composes CherryUI's `MessagePart.Detail` and `ModelAvatar`; it does not read usage records or aggregate
measurements.

- `AiUsageDetail` renders the model/provider header, total tokens, request and image counts,
  input/cache and output/reasoning columns, available performance measurements, costs, and timestamp.
  It retains the message detail's medium/large/full sheet sizes and typography. Missing measurements
  stay unavailable; measured zero stays visible. `costDetails` adds call-specific price breakdowns;
  `children` adds caller-owned metadata or query feedback before the timestamp.
- `AiUsageDetailRow` renders compact metadata and breakdown rows with selectable values.

Import from `@/frontend/components/AiUsageDetail`. Message owners supply persisted message summaries
and keep their local/remote query behavior. The usage page maps one ledger entry without introducing
message-wide tool timing or throughput. Currency formatting lives in
`@/frontend/utils/aiUsage`, including the small-positive-charge display rule.
