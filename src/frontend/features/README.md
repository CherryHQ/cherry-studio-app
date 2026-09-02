# Page Module Conventions

This directory is the implementation tree for application pages. Expo Router files in `src/app`
define URLs and navigator configuration; matching modules under `src/frontend/features` own screen UI,
page state, and page-local code.

## Page Tree

The first level represents top-level product pages. Child pages are nested beneath the page that
owns their navigation flow instead of being promoted into flat domain modules.

```text
features/
  settings/
    SettingsScreen.tsx
    components/
    hooks/
    appearance/
      AppearanceSettingsScreen.tsx
      components/
    mcp/
      McpScreen.tsx
      server/
        McpServerScreen.tsx
        components/
    provider/
      ProviderListScreen.tsx
      catalog/
      new/
      detail/
        ProviderDetailScreen.tsx
        edit/
        modelAdd/
        modelPull/
```

The implementation name may use repository `camelCase` conventions even when the URL uses
`kebab-case`, for example `fontSize/` for `/settings/font-size`.

## Ownership

- A page directory owns its screen, child pages, and page-local `components`, `hooks`, `context`,
  `utils`, and tests.
- A component used only within one page tree stays under that page's `components/` directory.
- Code shared by independent pages moves to a neutral owner such as `frontend/components`,
  `frontend/data`, `frontend/hooks`, or `frontend/utils`.
- App-wide navigation, sidebar, startup, background activity, and transient route coordination live
  in `frontend/appShell`; they are not pages.
- Route adapters import the public `index.ts` of the exact page they mount. Parent and child page
  internals use relative imports.
- One page must not import another page's private files. Promote the shared capability instead.

## Current Top-Level Pages

- `chat/`: the main Agent Session conversation page.
- `agents/`: Agent list plus the shared create/edit child page.
- `drawings/`: painting history and selection page.
- `home/`: home page and its `aiUsage/` child page.
- `library/`: file library page.
- `onboarding/`: onboarding page.
- `paintings/`: painting composer plus `viewer/` and `viewer/conversation/` child pages.
- `search/`: transient search result page; its cross-page request session lives in
  `appShell/search`.
- `sessions/`: Agent Session management page; reusable list UI lives in
  `components/SessionList`.
- `settings/`: settings home and all settings child pages, including provider, model, MCP, and web
  search configuration.

`src/frontend/features` is intentionally page-shaped. It must not become a flat collection of product
domains or a home for non-page application infrastructure.
