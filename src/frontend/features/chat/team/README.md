# Team Chat

The route imports only `TeamChatScreen` from this public boundary. It composes the existing
header, Agent picker, workspace, interaction controls and composer around `Backend.teamAgent`.
The app-shell `conversation/team` boundary supplies the catalog, focused foreground observation and
resource hooks, and message projection shared by the sidebar and this page; the backend owns
submission settlement.

The composer retains text until confirmed admission, keeps drafts in Team memory and offers an
explicit duplicate warning for uncertain sends. Remote details are readonly. No Team ID is passed
to the local Agent editor, local chat persistence, attachment tools or desktop recovery journal.

See [Team Agent](../../../../../docs/references/team-agent.md).
