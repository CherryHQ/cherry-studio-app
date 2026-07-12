# Keep Flat src Layout

Cherry Mobile keeps its flat top-level source layout — `src/{app,screens,data,ai,services,components,hooks,...}` — and does not adopt Cherry desktop's `main`/`renderer`/`shared` process split. The desktop split encodes an Electron process boundary that does not exist in a single React Native runtime, so importing it would add ceremony without enforcing a real boundary. This decision is coupled to ADR 0008: as long as the storage engine and its seams are not being reorganized, there is no structural pressure to re-layer.

**Considered Options**

- Keep the flat layout and rely on import-direction discipline plus ADR-scoped ownership docs.
- Adopt a desktop-style `main`/`renderer`/`shared` (or `runtime`/`ui`/`shared`) split.

**Consequences**

The flat layout has no hard layering violations today: UI never imports `@/data/db`, `@/data` never imports `@/screens`, and `@/ai` depends on `@/data` types only (`import type`). The accepted cost is that the flat layout does not make the runtime tier legible — the injected service graph spans `src/ai` (`AiService`, constructed in `src/data/services/createDataServices.ts`), `src/data/services`, and `src/services/webSearch`; the `ChatRuntime` runtime owner lives under `src/screens/ChatScreen/runtime/`; and `providerRegistryService` is a module-level singleton imported directly (e.g. `src/hooks/features/settings/useProviderModelPull.ts`) rather than flowing through the injected graph. These are known and tolerated. Reopen this decision if the runtime tier grows enough that its scattering across `ai/`, `data/services/`, `services/`, and `screens/` starts causing real coupling or churn, at which point extracting a shared runtime layer (not a process split) is the first move to consider.
