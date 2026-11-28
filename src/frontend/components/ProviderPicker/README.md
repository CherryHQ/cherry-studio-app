# Provider Picker

`ProviderPickerDrawer` owns the shared provider-selection sheet. It follows `ModelPickerDrawer`:
`medium` initially, expanding to `full` when search is focused and retaining that height until
dragged back via the top region or closed, shared `SearchField`, provider avatars,
and the same identity-row spacing and selection mark.

Callers supply provider identities, search text and results, selection,
localized copy and query feedback as children. The picker owns focus and sheet presentation; business filtering,
persistence and whether selection dismisses belong to the caller. A caller can supply configured
providers or historical usage identities without manufacturing live connection settings.
