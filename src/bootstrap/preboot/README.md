# Preboot

Preboot contains mandatory global runtime setup that must execute before `AppBootstrapRuntime` is
created. It is the mobile counterpart of Desktop `main/core/preboot` by timing and responsibility,
not by process topology: mobile still runs frontend and backend in one Hermes runtime.

## Admission Rules

A module belongs here only when all of the following are true:

1. It must execute before bootstrap composition or an imported dependency may observe an invalid
   global runtime.
2. It is required for the app to start or for a foundational SDK to execute correctly.
3. It directly patches global runtime behavior, or is a pure helper for that patch.
4. It does not require React state, an initialized database, preferences, or any composed frontend or
   backend module.

Feature initialization, data repair, catalog refresh, prefetching, and diagnostics do not belong
here merely because they run early.

## Current Modules

- `abortSignal.ts` supplies the missing `AbortSignal.throwIfAborted()` behavior required by MCP tool
  execution.
- `blob.ts` installs Expo's Blob implementation on the Hermes global.
- `webCrypto.ts` installs `crypto.getRandomValues`/`crypto.randomUUID` from expo-crypto; the `uuid`
  package behind Drizzle id column defaults reads the bare `crypto` global that Hermes lacks.

## Import Rules

Preboot deliberately has no barrel. `src/app/_layout.tsx` imports each module from its concrete path
so order and side effects remain visible:

```ts
import '@/bootstrap/preboot/abortSignal';
import '@/bootstrap/preboot/blob';
import '@/bootstrap/preboot/webCrypto';
```

Preboot must not import app routes, backend modules, frontend modules, composition, or runtime. Add a
focused test beside any non-trivial global patch and make repeated evaluation safe where the runtime
or test environment can load it more than once.
