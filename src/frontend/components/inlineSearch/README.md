# Inline Search

This module owns the search field a screen keeps in place above its own content, the query behind
it, and the one place that decides how each platform draws it.

## Public Interface

- `InlineSearch`, `InlineSearchProps`, `useInlineSearch`, `InlineSearchOptions`, and
  `InlineSearchState` are exported from `index.ts`.
- Callers should import from `@/frontend/components/inlineSearch`.

## Contract

- The field and the query are separable. `useInlineSearch` owns the query and the filtering;
  `InlineSearch` draws the input. A screen that filters server-side takes the component alone, and a
  screen whose field lives somewhere unusual takes the hook alone.
- The component is placed between the screen's `RouteHeader` and its content. iOS renders nothing
  there — the field lives in the native header — while Android draws a real row, so both platforms
  read the same at the call site.
- A screen that hides search for a mode, such as multi-select editing, unmounts the component. There
  is no `hidden` prop: unmounting is what removes the native header options on iOS, and it is what
  makes iOS drop the text UIKit is holding.
- Matching is keyword-based, not substring-based, through `@/frontend/utils/search`. `gpt 4o` finds
  `GPT-4o`, and a query may span an item's fields.
- `isFiltering` separates "nothing matched" from "nothing exists yet". Screens need both empty
  states and they do not say the same thing.

## Organization

- `InlineSearch.ios.tsx` mounts `Stack.SearchBar` with `placement="stacked"`, giving the field its
  own row under the title.
- `InlineSearch.android.tsx` draws CherryUI's `SearchField` in that same position. Android's native
  search bar exists, but it is a toolbar menu item with platform styling that lands right of the
  screen's own actions; drawing the field keeps both platforms aligned.
- `InlineSearch.types.ts` holds the shared props, including why `value` binds on Android and only
  seeds the initial mount on iOS.
- `useInlineSearch.ts` holds the query state and the filtering, and nothing about placement.

## Extension Boundary

This is the persistent, in-place search for one screen's own content. Transient single-selection
search that opens its own view belongs to [App Search](../appSearch/README.md). The two share their
matching rules through `@/frontend/utils/search` and nothing else — App Search requests may query a
server or apply filters, which this module deliberately does not model.
