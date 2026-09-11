# Document Export Page

Owns the compact format menu, preview, bounded HTML capture and a single Share action. Image is the
default format. The Markdown preview reads the frozen in-memory document without creating a file.
It renders leaf prose with the existing Markdown component and composes the actual CherryUI
`MessagePart.Process` and `MessagePart.Reasoning` components for disclosures. Both start collapsed
and retain independent toggles; the source snapshot has no live chat reads.
HTML or WebP is generated when that format is selected, including the initial image preview. A source
may supply one initially unchecked option and its alternate document; changing it refreshes only the
selected format.

HTML and WebP receive the same resolved semantic colors and accessibility typography scale as the
native chat components. Their content owns its 16-point gutters; the preview does not add another
inset or scale a narrower HTML viewport to fill the screen. Message presentation follows the source's
bubble/message hints, while ordinary documents retain their document headings.

Process/reasoning hints also preserve the two disclosure levels in HTML. Both start collapsed;
only HTML and the native preview can expand them. WebP captures the collapsed summaries. Markdown
files retain nested `<details>` markup for readers that support it instead of flattening thinking
into ordinary headings and body text.

The page claims its sessions from the app-shell handoff, serializes superseded renders and closes
both sessions on route exit. Share materializes the selected format if necessary, persists it to the
file library and opens the system share sheet. Repeated sharing of the current artifact reuses its
saved entry; cancelling the sheet retains the file.

The capture WebView is a controlled, navigation-free surface, separate from the authored-HTML file
viewer. It releases late native files and limits physical pixels before allocation. WebP output is
one bounded image; larger content offers HTML. Native acceptance is still pending.
