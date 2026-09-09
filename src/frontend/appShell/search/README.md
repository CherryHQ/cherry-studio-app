# App Search

This App Shell module owns the in-memory request session and opening action for the transient
`/search` page. Callers supply a search contract; the page owns presentation and route lifecycle.
An optional `loadRecent` callback supplies a bounded recent list before a query is entered; its
items use the same grouping, selection, cancellation, and pagination contract as search results.

Expensive sources can opt into `debounceMs`; the route updates input text immediately and delays
only nonempty queries. `AppSearchGroup.nextCursor` enables an explicit continuation below that
group. The route passes `groupKey` and its cursor to the request and merges only the returned
groups, preserving other groups and their cursors. An empty group with a cursor remains actionable
as "Continue searching". Page-level `nextCursor` keeps automatic pagination for existing sources.
