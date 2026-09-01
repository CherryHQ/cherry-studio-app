# App Search

This app-shell module owns the single transient search route.

## When To Use It

Take this route when a screen cannot answer the query itself: results are paginated server-side,
carry filters, or are not the rows the screen already draws. A screen that already holds everything
it can match keeps its search in place with [Inline Search](../inlineSearch/README.md) instead.

The two share their matching rules through `@/frontend/utils/search` and nothing else.

## Contract

- `useAppSearch().open(request)` pushes `/search` and resolves to either `selected` with one item or
  `cancelled`.
- Every entry opens the same route and layout. Business requests adapt their data lookup, matching,
  grouping, input placeholder, labels, optional filter state, filter controls, and result content to
  that view; they do not supply another search screen.
- The route owns the fixed Search title, query input, request cancellation, pagination, result
  presses, filter placement, native-stack entry and exit, and the empty/loading/error states.
- A request that supplies `filter` gives the route one initial value and a controlled component. The
  route owns that value, resets results when it changes, and passes it into every search call. The
  filter component also receives the current query so derived counts stay aligned with its results.
- An empty or whitespace-only query stays in the waiting state: it does not call the request and does
  not render the request's full data set. Results begin only after the user enters a query.
- A result press always closes the route. Back, Android system back, and the iOS pop gesture always
  cancel. The promise resolves only after the native exit transition finishes.
- The caller alone decides what a selected item means. The search route never writes preferences,
  navigates to a business destination, toggles selection, or keeps itself open after a press.

Sessions live in memory and the route's `searchSessionId` param carries only the search-session id;
callbacks, data, and rendered items are never serialized into navigation state. Only one app-search
session can be active. The explicit param name keeps it distinct from an Agent chat `sessionId`.

## Extension Boundary

App Search is the application's one transient single-selection search view. Extend a business
request through its search function, filter control, grouping, and result renderer. Do not add
business-specific route variants or arbitrary full-page render slots. A workflow that needs a
different interaction contract owns a separate feature instead of becoming another App Search mode —
persistent in-place search is [Inline Search](../inlineSearch/README.md), and multi-selection search
belongs to whichever feature needs it.
