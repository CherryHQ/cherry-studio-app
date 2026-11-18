# CherryAI entry

`CloudAmdAction` opens the account-scoped AMD browser flow for the chat picker and provider settings.
The UI-free `cloud/nativeIntent` entry recognizes the existing provider return link. A cold link
opens chat. `CloudAmdReturnBridge` handles warm links after navigation is ready and keeps a visible
chat mounted. A browser opened by the app also requests a refresh when the user returns manually.
The bridge reads the current account through Cloud, which owns the status and model catalog.
