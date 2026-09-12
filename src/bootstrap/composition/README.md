# Bootstrap Composition

Composition creates the concrete backend graph and connects implementations to their narrow
dependency interfaces. It is wiring code, not a service locator and not a home for business rules.

## Current Modules

- `createDataServices.ts` names the private desktop-aligned persistence singletons.
- `createBackendServices.ts` assembles those ownership modules into the private backend graph. The
  device-permission and managed-file adapters are backend module singletons it spreads in
  (`backend/services/permissions`, `backend/services/file/fileContent`); the AI, MCP, web-search,
  chat, and job runtimes are lifecycle services the host resolves and hands in.
- `createBackend.ts` builds factory-shaped workflow modules, adapts the graph into the workflow-only
  `Backend` interface, and supplies the MCP mutation coordinator required by Data API handlers.

`createAppBootstrapRuntime()` owns the `ApplicationHost` and `DataApiService`, resolves the host's
infrastructure services, and calls these composition functions. Concrete classes never enter
frontend React state.

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
