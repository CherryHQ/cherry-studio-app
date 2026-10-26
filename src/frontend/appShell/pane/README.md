# File Pane

In medium and expanded windows (see [layout](../layout/README.md)), the sidebar's Files destination
and every file preview open in a pane beside the current chat instead of covering it.

- `FilePaneProvider` sits in the drawer layout so the sidebar and chat share one pane state:
  whether it is open and which file it previews. It is available only for the local chat source,
  outside compact windows or where a fold runs across the window. Routes pushed over the drawer have no provider and keep opening
  their own pages.
- `FilePaneHost` lays the pane out beside the chat stack in the `(chat)` layout, which composes the
  library and viewer pages. It reads the complete native layout snapshot and splits with `resolvePaneSplit`,
  so on a foldable the pane and chat meet at the fold, side by side or stacked. Stacked, the
  keyboard fills the half below the fold, so while the chat is typed into, the pane fades aside and
  the chat takes the window. A preview replaces the list in place and returns to it. The pane stays
  mounted once opened, so closing it or narrowing the window keeps the list's mode, folder, filter,
  and scroll position. A hidden pane stays laid out but transparent: `display: none` would remove
  its native views on iOS, losing their scroll and document state.
- Pages in the pane receive `PaneChromeProvider`: their headers and selection toolbars render inline
  and lead with the pane's close or back action.
- A preview's header also offers Expand reading. The preview then fills the chat's space while the
  chat stays mounted behind it, and Back to chat takes the expand button's place. Leaving the
  preview or closing the pane always returns the chat beside it. Android back first returns an
  expanded preview, then leaves the preview, then the pane.
- `useFilePane` lets openers choose the pane. `useOpenFileEntry` is the only file opener that does.
  Callers outside the routes import it from `@/frontend/appShell/pane/state`, which leaves out the
  host and its Reanimated dependency.

## Fold transitions

The shell commits discrete layouts from complete snapshots. It does not animate the divider or
follow hinge angles. These transitions use the [motion contract](../../../../DESIGN.md):

| Transition and purpose | Trigger and owner | Interruption | Reduced motion |
| --- | --- | --- | --- |
| Inner/outer display: keep the current content available | The system switches displays; the shell applies the latest complete snapshot without navigation or split animation | A newer snapshot replaces the old one; a stale snapshot keeps the pane as the last current one showed it | Unchanged; no custom animation |
| Rotation: fit the pane and chat to the new window | The system rotates; the shell commits a row or column split | The latest snapshot wins | Unchanged |
| Flat/partly folded: meet the reserved division region | The shell changes the split once when the active fold changes | Reversal commits the new split immediately | Unchanged |
| Keyboard yielding: replace the upper pane with chat content | In a stacked split, typing below the fold removes the spacer immediately and fades the pane out with `duration.fast` (200 ms) and `easing.settle`; the pane owns opacity | Reverse from the current opacity; stale completion callbacks cannot restore space | Set final opacity and space immediately |
| Pane open/close and expanded reading: keep existing direct navigation | User actions remain immediate; the pane owns presentation | The latest action wins | Unchanged |

When the keyboard closes, the pane fades in above the full-height chat before restoring its spacer.
The chat's return below the fold is covered by the pane. Yielding disables pointer events at once.
Closing, availability changes, rotation, and stale snapshots cancel fades and settle immediately.
The pane remains mounted and laid out while hidden.

When a current layout changes availability from true to false, an open preview stays on screen
only if the last touch was in the pane: the provider marks it carried and expands it over the chat,
which keeps the narrow window's full width underneath. Nothing navigates, so the preview keeps its
mounted viewer and reading position, and the outer display never shows the chat first. Touches are
recorded per region, including document scrolling, without publishing a new pane state. A user's
Expand reading action also selects the file pane. A list-only pane, a closed pane, a remote source,
or a last touch in chat stays in chat.

While carried, the header keeps only Back, which returns to the chat like a phone's file page, as
does Android back; neither clears the file. The pane pads its own edges for the host's safe areas,
including the trailing one when stacked or covering the chat, such as an outer display's status bar,
and gives the pages inside it no side insets to pad again. When
the pane becomes available again, a still-carried preview returns beside the chat with the expanded
state it had before narrowing.

The message list owns reading continuity. Width changes restore its last observed message and
row offset through the existing anchor mechanism; height-only keyboard changes keep the existing
behavior. A user drag or dataset switch invalidates pending restoration. Following mode continues
to keep the live edge at the bottom.
