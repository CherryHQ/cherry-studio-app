# Bootstrap Composition

Composition creates the concrete backend graph and connects implementations to their narrow
dependency interfaces. It is wiring code, not a service locator and not a home for business rules.

## Current Modules

- `createBackendServices.ts` constructs the private desktop-aligned services plus mobile AI, MCP,
  tool-resolver, and device-adapter dependencies.
- `createBackend.ts` creates the app-owned `ChatRuntime`, builds factory-shaped workflow modules,
  adapts the graph into the workflow-only `Backend` interface, and supplies the MCP mutation
  coordinator required by Data API handlers.

`createAppBootstrapRuntime()` owns the top-level `CacheService`, `DbService`, and `DataApiService`
instances and calls these composition functions. Concrete classes never enter frontend React state.

## Admission Rules

Composition may:

- instantiate concrete backend classes;
- connect constructor dependencies and narrow adapters;
- select the implementation satisfying a shared interface;
- create app-owned objects without starting their work;
- return private dependency bundles needed by runtime assembly.

Composition must not:

- initialize, start, warm, repair, dispose, or otherwise run app-lifetime resources;
- contain provider/model/chat/painting business decisions;
- import React, frontend providers, app routes, preboot, or runtime owners;
- expose the concrete backend service graph through React context;
- introduce a general registry, service locator, or lifecycle framework.

There is no directory barrel. Internal callers import the concrete composition function they need.
