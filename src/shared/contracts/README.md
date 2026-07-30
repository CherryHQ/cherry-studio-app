# Shared Contracts

`MobileBackend` and its module and session interfaces form the only frontend-to-backend seam.
Workflow results and events also live here. Implementations belong in backend and assembly belongs
in bootstrap; this directory defines no transport, IPC, or serialization layer.

Contracts may depend on `shared/data`, but never on frontend, backend, bootstrap, React Native,
Expo, or concrete persistence and integration implementations.
