# Browser And React Debugging

Use this reference for React DOM, React Native Web, browser-rendered UI, and localhost frontend bugs.

## Detect The Stack

Inspect the repo before choosing a browser tool:

```bash
cat package.json
```

Look for:

- framework: `next`, `vite`, `react-scripts`, `remix`, `astro`, `expo`, `react-native-web`
- React packages: `react`, `react-dom`, `react-native-web`
- browser/test tooling: `@playwright/test`, `playwright`, `cypress`, `vitest`, `@testing-library/react`, `storybook`
- scripts: `dev`, `start`, `test`, `test:e2e`, `playwright`, `cypress`, `storybook`

If package metadata is insufficient, inspect config files such as `vite.config.*`, `next.config.*`, `playwright.config.*`, `cypress.config.*`, `vitest.config.*`, and `.storybook/`.

## Browser Adapter Order

1. **Existing repo test tooling**: prefer existing Playwright, Cypress, Vitest browser mode, Storybook tests, or Testing Library coverage when it can reproduce the bug. This gives the best regression path.
2. **Host-provided browser automation**: use the browser tools exposed by the current agent environment for live localhost inspection, DOM state, user interactions, screenshots, console errors, and network evidence.
3. **Playwright**: use as the generic public fallback for deterministic browser repro scripts/tests when no repo tooling exists.
4. **agent-device web**: use when the browser flow must be replayable alongside mobile/device flows, recorded, captured as CLI evidence, or used in a unified cross-platform workflow. When using agent-device web, follow the agent-device install and update rules in [app-device.md](app-device.md).
5. **Raw CDP, Puppeteer, or React DevTools**: use when the bug requires low-level runtime evaluation, performance tracing, heap inspection, React render profiling, or when existing tools expose that route directly.

Before using a non-repo tool, detect it:

```bash
command -v playwright
command -v agent-device
```

If Playwright is needed but unavailable, suggest installing the package that fits the repo's package manager, for example:

```bash
npm install -D @playwright/test
npx playwright install
```

If agent-device web is needed but unavailable, suggest:

```bash
npm install -g agent-device@latest
agent-device web setup
agent-device web doctor
```

## React Web Defaults

| Target | Preferred approach |
| --- | --- |
| React DOM app | Existing browser tests, then host browser automation, then Playwright |
| React Native Web app | Browser tools/Playwright first; use mobile tools only when comparing native behavior |
| Storybook repro | Existing Storybook test runner or Playwright against Storybook |
| Hydration or SSR bug | Framework dev server plus browser console/network evidence |
| Render performance bug | React DevTools/profiler or browser performance tooling before adding logs |

## Evidence To Capture

For browser bugs, prefer evidence that can become a regression:

- failing browser test or script
- console error with source location
- network request/response mismatch
- DOM state or accessible role/name mismatch
- screenshot only when visual layout matters
- performance trace or React profiler result for performance claims

Do not stop when the symptom merely disappears if the same behavior can be asserted through DOM, URL, console, network, or test state.
