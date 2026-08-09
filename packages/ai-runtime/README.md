# AI Runtime

Portable, behavior-preserving ports of Cherry Studio desktop AI runtime logic.

## Interface

Consumers use only the declared `messages`, `provider`, `runtime`, `tools`, and `utils` subpaths.
Expo, React Native, app services, storage, device APIs, and application logging stay in backend
adapters.

## Trust Workflow

Treat a mapped port as trusted only when its recorded desktop source hash is unchanged and
`pnpm check` passes. When a source hash changes, review only the paths reported by the provenance
check, update the port and its contract evidence, then record the new hash.
