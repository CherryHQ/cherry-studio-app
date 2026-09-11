# Document Export Page

Owns the compact format menu, preview, bounded HTML capture and a single Share action. The default
Markdown preview uses in-memory text and the existing Markdown component without creating a file.
HTML or PNG is generated only after selecting that format. A source may supply one initially checked
option and its alternate document; changing it refreshes only the selected format.

The page claims its sessions from the app-shell handoff, serializes superseded renders and closes
both sessions on route exit. Share materializes the selected format if necessary, persists it to the
file library and opens the system share sheet. Repeated sharing of the current artifact reuses its
saved entry; cancelling the sheet retains the file.

The capture WebView is a controlled, navigation-free surface, separate from the authored-HTML file
viewer. It releases late native files and limits physical pixels before allocation. PNG output is
one bounded image; larger content offers HTML. Native acceptance is still pending.
