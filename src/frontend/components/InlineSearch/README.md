# Inline Search

This module owns the search field a screen keeps in place above its own content, the query behind
it, and the one place that decides how each platform draws it.

## Public Interface

- `InlineSearch`, `InlineSearchProps`, `useInlineSearch`, `InlineSearchOptions`, and
  `InlineSearchState` are exported from `index.ts`.
- Callers should import from `@/frontend/components/InlineSearch`.

## Contract

- The field and the query are separable. `useInlineSearch` owns the query and the filtering;
  `InlineSearch` draws the input. A screen that filters server-side takes the component alone, and a
  screen whose field lives somewhere unusual takes the hook alone.
- The component is placed between the screen's `RouteHeader` and its content. iOS uses the native
  header while the window fits the form column. When the safe window width exceeds that column's
  720-point limit, search becomes a content row aligned with its results. Android always draws a
  content row. The caller and its query stay mounted when this placement changes.
- Mount search with the header, outside the list's loading, error, and empty branches. Data arriving
  or a query returning no matches must not add or remove the native search bar.
- The query is controlled on both platforms. Parent updates, including an initial non-empty value
  and later clears or restores, are synchronized into the native iOS search bar.
- A screen that hides search for a mode, such as multi-select editing, unmounts the component. There
  is no `hidden` prop: unmounting removes the field, including any native header options on iOS.
- Matching is keyword-based, not substring-based, through `@/frontend/utils/search`. `gpt 4o` finds
  `GPT-4o`, and a query may span an item's fields.
- `isFiltering` separates "nothing matched" from "nothing exists yet". Screens need both empty
  states and they do not say the same thing.

## Organization

- `InlineSearch.ios.tsx` chooses placement using the app-shell form-width contract. Narrow windows
  mount `Stack.SearchBar` with `placement="stacked"` and toolbar integration disabled; wide windows
  use `InlineSearchField` inside the page. Headers must reserve their own space above content search.
- `InlineSearchField.tsx` draws CherryUI's `SearchField`; `InlineSearch.android.tsx` always uses it.
  Android's native search bar is a toolbar menu item with platform styling that lands right of the
  screen's own actions.
- `InlineSearch.types.ts` holds the shared controlled props and the semantic `screen` / `embedded`
  placement choice used by the content row.
- `useInlineSearch.ts` holds the query state and the filtering, and nothing about placement.

## Extension Boundary

This is the persistent, in-place search for one screen's own content. Transient single-selection
search that opens its own view belongs to
[Search Page](../../features/search/README.md). The two share their matching rules through
`@/frontend/utils/search` and nothing else — App Search requests may query a server or apply
filters, which this module deliberately does not model.
