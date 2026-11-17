# App Branding

`getAppLogo` selects in-app artwork from the active profile fixed before React starts.
Enterprise and private profiles use the PC enterprise artwork; community profiles retain the
existing community artwork. Sign-in, About, and every account card consume this boundary; account
kind remains in the card's title and detail rather than replacing its brand image. The native
launch screen and its matching React startup cover retain their shared artwork to avoid a brand
jump during handoff. Launcher and notification artwork stay unchanged.
