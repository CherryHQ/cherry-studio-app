# Shared Contracts

`Backend` and its module/session interfaces form the workflow seam. Workflow results and events
also live here. Ordinary resource endpoints belong in `shared/data/api`; preferences belong in
`shared/data/preference`. Implementations belong in backend and assembly belongs in bootstrap; this
directory defines no transport, IPC, or serialization layer.

Contracts may depend on `shared/data`, but never on frontend, backend, bootstrap, React Native,
Expo, or concrete persistence and integration implementations.
