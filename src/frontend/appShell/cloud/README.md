# CherryAI entry

Settings and the chat model picker display the full server model directory and resolve actions against the current account.
The catalog's `is_free` flag drives the Free badge and filter. Locked rows display an amber lock
tag naming whether the model requires sign-in, a subscription, or AMD authorization / the next
AMD setup step (AMD rows show AMD authorization even before sign-in). Guest models with anonymous access use signed
inference. A sign-in-required tap opens the existing login route and can resume the tapped model
on return. A missing plan entitlement shows an informational alert on the current screen.
Models requiring activation expose an action only when the directory supplies an entry endpoint.
The profile-scoped login intent binds the original tap to its model and destination.
It is consumed once before resuming the action, including an answer on an existing message.

`useCloudModelActivation` uses the AMD account status to choose between registration, linking,
verification and usage. Other providers use the generic activation action. The app requests a fresh
browser entry on confirmation. These surfaces
derive read-only model identities from the current Cloud catalog with `toCloudModelPreview`.
The UI-free `cloud/nativeIntent` entry recognizes the existing provider return link. A cold link
opens chat. `CloudAmdReturnBridge` handles warm links after navigation is ready and keeps a visible
chat mounted. A browser opened by the app also requests a refresh when the user returns manually.
The bridge reads the current account through Cloud, which owns the status and model catalog.
