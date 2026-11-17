# App Branding

`getAppLogo` selects in-app artwork from the active profile fixed before React starts.
Enterprise and private profiles use the PC enterprise artwork; community profiles retain the
existing community artwork. Sign-in, About, and the account page consume this boundary. The native
launch screen and its matching React startup cover retain their shared artwork to avoid a brand
jump during handoff. Notification artwork remains independently configured.

The backend/native App Icon workflow automatically synchronizes supported launcher icons with the
selected account space. It has no settings control or separate preference. Returning to a community
space restores the community icon; bootstrap owns synchronization and capability detection.
