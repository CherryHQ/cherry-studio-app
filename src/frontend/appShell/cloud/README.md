# CherryAI entry

Settings and the chat model picker display the full server model directory and resolve actions against the current account.
Guest models with explicit anonymous access use signed inference. Login-required taps return through the existing login route with the selected model ID. The signed-in
catalog and effective entitlements decide whether to select, explain a plan requirement, or offer
AMD activation. The profile-scoped login intent binds the original tap to its model and destination.
It is consumed once before resuming the action, including an answer on an existing message.

`useCloudAmdModelAction` shows the account-scoped AMD action when a model row is pressed in the chat
picker or provider settings. The App requests a browser entry on confirmation. These surfaces
derive read-only model identities from the current Cloud catalog with `toCloudModelPreview`.
The UI-free `cloud/nativeIntent` entry recognizes the existing provider return link. A cold link
opens chat. `CloudAmdReturnBridge` handles warm links after navigation is ready and keeps a visible
chat mounted. A browser opened by the app also requests a refresh when the user returns manually.
The bridge reads the current account through Cloud, which owns the status and model catalog.
