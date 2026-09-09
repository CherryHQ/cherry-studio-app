# App Search

This App Shell module owns the in-memory request session and opening action for the transient
`/search` page. Callers supply a search contract; the page owns presentation and route lifecycle.
An optional `loadRecent` callback supplies a bounded recent list before a query is entered; its
items use the same grouping, selection, cancellation, and pagination contract as search results.
