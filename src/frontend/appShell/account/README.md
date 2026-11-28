# Account navigation

This App Shell module owns the shared sign-in form, `/login`, `/auth/callback`, and the enterprise
session gate. `Backend.account` remains the authority on credentials and their match to the active
data profile. Navigation never treats a community guest as an expired enterprise account.

## Entry and completion

- Settings opens `accountSignInHref(returnTo)` with push navigation, retaining its source page.
  An entry can supply `cancelTo` when closing login should return to its source and success should
  continue to another page.
- `useAccountSignInForm` records the entry's validated return target before authentication. The
  existing profile-scoped persistent UI cache holds only that href, never credentials or callback
  codes. Onboarding supplies `/onboarding`; organization switching records its profile settings page.
- Native routing stages the original account callback URLs in memory before bootstrap and opens
  the callback page with an opaque delivery ID. A warm return handled in place can replace the
  operating system's last URL while the queued account delivery waits for its page. A cold
  batch also checks the latest native URL at claim time, covering an account return received before
  the router subscribed to events. Warm and discarded tickets never recover links from that cache. Once claimed,
  the page passes the original URLs to the account runtime. A replacement navigation or new sign-in
  discards an abandoned delivery. The native main queue retires exact matches in the system
  link stores. A profile switch also retires any unmounted account deliveries and waits for
  the acknowledgements before restarting JavaScript.
- Both the live browser result and `useAccountCallback` dismiss to the same target. This removes
  login and callback pages together, or replaces a standalone cold entry when its target is absent.
  The last target remains until another attempt replaces it, so duplicate delivery has the same
  destination. `AccountRuntime` still owns one-use callback validation and deduplication.
- An expired callback failure returns to the retryable login route. Other failures return to the
  saved target. Without saved intent, interrupted onboarding resumes from its persisted
  status; an ordinary cold entry falls back to profile settings.
- A callback effect that has been left cannot navigate later. A direct browser result only closes
  the login page while that page is focused. Cross-profile activation reloads the app instead of
  applying another profile's return intent.

## Session gate

`AccountSessionGate` always retains its navigator children. While stored credentials restore, or
while a refused session is waiting to enter login, it covers the content and disables interaction
and accessibility. Once the root navigator exists, refusal pushes `/login` with `purpose=expired`
and the complete original route identity. It never replaces the page tree with a second login UI.
Sheets, menus and dialogs render in portals above the cover, so the gate closes dismissible
surfaces first and waits for a pending decision to be answered before opening login.
An in-flight account activation settles before the gate requests expired login, so switching
profiles does not create a spurious recovery page. The login route owns sign-out, back prevention
and same-profile completion. System share delivery
waits for account admission and retains its pending selection while login temporarily covers it.

Pure route construction lives in `accountRoute.ts`. `accountNavigation.ts` uses the existing cache
owner for recoverable continuation. These are account-specific boundaries, not another app router.
