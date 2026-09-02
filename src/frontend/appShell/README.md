# App Shell

This directory owns frontend infrastructure that applies across the application rather than one
page.

- `header/` owns the app-wide main and route header adapters.
- `navigation/` owns Expo Router and React Navigation integration shared by routes and pages.
- `sidebar/` owns the drawer's navigation surface.
- `search/` owns the cross-page request session that opens the transient search page.
- `backgroundActivity/` owns platform Live Activity factories registered during bootstrap.
- `startup/` owns the frontend startup cover, readiness reporting, and handoff lifecycle.

App Shell modules expose deliberate public roots and may depend on shared frontend components,
data, hooks, and utilities. They must not import page-private code.
