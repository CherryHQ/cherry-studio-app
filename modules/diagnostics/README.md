# Native Diagnostics

Local Expo module for Cherry Mobile diagnostics. Workflow ownership and the Desktop compatibility
contract are documented in [Diagnostics](../../src/backend/services/diagnostics/README.md).

The native boundary owns system document save completion, file identity and hashing, the
provisioned HMAC credential, and bounded file-backed HTTP transfer.
The module never decides which logs or chat records to collect. There are no package downloads
or new native SDK dependencies.

Native crash reporting belongs to the app's existing Sentry integration. This module does not
capture or inventory crash reports.

Rebuild the development client after adding or changing this module. Configure the Cherry client
credential through `CHERRYAI_CLIENT_SECRET` (or Desktop's `MAIN_VITE_CHERRYAI_CLIENT_SECRET`) in
the native build environment. Missing credentials affect upload only. Do not put the credential
in JavaScript or Expo `extra` configuration.
