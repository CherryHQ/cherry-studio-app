# AgentMenu

`AgentMenu` is the shared choice of which Agent receives content handed over from outside a chat,
such as a file or an Office selection reference. It wraps its trigger in CherryUI `ActionMenu` and
lists Agents by name.

- `accepts` omits Agents that cannot use the content. Documents and selection references need
  standard Agents; minimal Agents accept only text and images.
- `onSelect` receives the chosen Agent. The caller owns the handoff and navigation, usually a new
  draft seeded through `createChatComposerHandoff`.
- With no eligible Agent, the menu offers creating one. A disabled trigger opens no menu.
