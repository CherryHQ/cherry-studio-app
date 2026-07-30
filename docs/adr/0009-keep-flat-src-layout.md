# Keep Flat src Layout

> **Superseded in part by [ADR 0010](0010-adopt-feature-and-runtime-layering.md) and [ADR 0011](0011-separate-in-process-frontend-and-backend.md).** The reopen condition below was met: the runtime tier's scattering caused real coupling. ADR 0011 replaces the flat layout with an in-process frontend/backend seam. The rejection of a desktop-style `main`/`renderer` process split remains in force.

Cherry Mobile keeps its flat top-level source layout — `src/{app,screens,data,ai,services,components,hooks,...}` — and does not adopt Cherry desktop's `main`/`renderer`/`shared` process split. The desktop split encodes an Electron process boundary that does not exist in a single React Native runtime, so importing it would add ceremony without enforcing a real boundary. This decision is coupled to ADR 0008: as long as the storage engine and its seams are not being reorganized, there is no structural pressure to re-layer.

**Considered Options**

- Keep the flat layout and rely on import-direction discipline plus ADR-scoped ownership docs.
- Adopt a desktop-style `main`/`renderer`/`shared` (or `runtime`/`ui`/`shared`) split.

**Consequences**

At the time of writing the flat layout had no hard layering violations: UI never imported `@/data/db` and `@/data` never imported `@/screens` (the claim that `@/ai` depended on `@/data` types only did not hold up — `src/ai/tools` grew value imports of `@/services/webSearch`, one of the defects that triggered ADR 0010). The accepted cost was that the flat layout did not make the runtime tier legible — the injected service graph spanned `src/ai` (`AiService`, constructed in `src/data/services/createDataServices.ts`), `src/data/services`, and `src/services/webSearch`; the `ChatRuntime` runtime owner lived under `src/screens/ChatScreen/runtime/`; and `providerRegistryService` is a module-level singleton imported directly (e.g. by `useProviderModelPull` in the provider settings feature) rather than flowing through the injected graph. These were known and tolerated. Reopen this decision if the runtime tier grows enough that its scattering across `ai/`, `data/services/`, `services/`, and `screens/` starts causing real coupling or churn, at which point extracting a shared runtime layer (not a process split) is the first move to consider.
