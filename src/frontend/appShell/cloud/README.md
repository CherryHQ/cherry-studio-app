# CherryAI entry

`useCloudAmdModelAction` shows the account-scoped AMD action when a model row is pressed in the chat
picker or provider settings. The App requests a browser entry on confirmation. These surfaces
derive read-only model identities from the current Cloud catalog with `toCloudModelPreview`.
The UI-free `cloud/nativeIntent` entry recognizes the existing provider return link. A cold link
opens chat. `CloudAmdReturnBridge` handles warm links after navigation is ready and keeps a visible
chat mounted. A browser opened by the app also requests a refresh when the user returns manually.
The bridge reads the current account through Cloud, which owns the status and model catalog.
