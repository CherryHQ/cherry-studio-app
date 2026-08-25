# AI Runtime

Portable, behavior-preserving ports of Cherry Studio desktop AI runtime logic.

Despite the package name, this package is not Cherry Mobile's Agent Runtime. Pi is the sole target
local conversation engine. These exports remain portable desktop-aligned helpers for provider,
message, tool, and auxiliary AI behavior while that migration proceeds.

## Interface

Consumers use only the declared `messages`, `provider`, `runtime`, `tools`, and `utils` subpaths.
Expo, React Native, app services, storage, device APIs, and application logging stay in backend
adapters.

## Trust Workflow

The delegated map records every desktop and mobile AI file, its source hash, classification,
target, and evidence. At desktop commit `12498d68`, it tracks 608 desktop files, 183 baseline mobile
files (176 TypeScript), and 229 package source files. The Provider slice classifies 118 semantic
ports and keeps only the two Local Embedding files blocked. The full AI runtime backlog remains 317
blocked files; blocked entries stay visible but do not fail the implemented-port gate.

Run both checks before treating mapped code as trusted:

```bash
pnpm check
pnpm ai-runtime:check --desktop-root <path-to-cherry-studio-desktop>
```

The second command rejects added or missing sources, source/target hash drift, duplicate targets,
missing evidence, a dirty desktop AI tree, and platform imports. When it reports drift, review only
the listed paths, update their behavior and evidence, then update the recorded hashes.
