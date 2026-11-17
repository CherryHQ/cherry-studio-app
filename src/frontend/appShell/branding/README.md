# App Branding

`getAppLogo` selects in-app artwork from the active profile fixed before React starts.
Enterprise and private profiles use the PC enterprise artwork; community profiles retain the
existing community artwork. Sign-in, About, and the account page consume this boundary. The native
launch screen and its matching React startup cover retain their shared artwork to avoid a brand
jump during handoff. Notification artwork remains independently configured.

`useAppIcon` observes `Backend.appIcon`. Launcher-icon consent belongs to the installation, not a
profile preference or backup. General settings owns the explicit opt-in and turning it off restores
the community icon. The backend/native boundary owns synchronization and capability detection.
