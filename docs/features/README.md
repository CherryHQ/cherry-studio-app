# Cherry Mobile Feature Map

This directory is the user-perspective sitemap for Cherry Studio Mobile. It gives humans and coding
agents a shared vocabulary for navigating the app, selecting stable `testID` controls, driving
repeatable verification scenarios, and recognizing mobile-specific pitfalls.

Architectural module ownership lives in [Code Organization](../references/code-organization.md) and
[Page Module Conventions](../../src/frontend/features/README.md); this directory describes how a
user reaches and verifies product behavior.

## Core User Paths

| Feature | Primary User Journey | Verification Coverage |
| --- | --- | --- |
| [Onboarding](./onboarding.md) | Fresh install welcome, sign-in or skip, model source, notifications, permissions | `.maestro/flows/onboarding-skip.yaml` + `agent-device` |
| [Chat Send And Stream](./chat-send-and-stream.md) | Compose, queue, stream replies, quotes, translations, user-question sheets | `agent-device` + Jest client/hook suites |
| [Model Picker](./model-picker.md) | Open model drawer, search, filter capabilities, fast-scroll providers, select per-session model | `agent-device` + Jest suites |
| [Provider Setup](./provider-setup.md) | Browse provider catalog, configure base URL/keys, test connection, add custom models | `agent-device` + Jest suites |
| [Sidebar And Navigation](./sidebar-and-navigation.md) | Open/dock sidebar, switch devices, check cloud quota, search, recents, return navigation | `agent-device` + Jest suites |
| [Settings And Appearance](./settings-and-appearance.md) | Open settings, switch dark/light theme, language, persistence across full restart | `.maestro/flows/appearance-persistence.yaml` + `agent-device` |
| [Files And Sharing](./files-and-sharing.md) | Browse file library, attach files, preview documents, export/share conversations | `agent-device` + Jest suites |
| [Voice And Background](./voice-and-background.md) | Dictation capture/elapsed status, read-aloud cancel, background/foreground handoff | `agent-device` + Jest suites |

## Maintenance Contract

Feature maps drift quickly when screens or `testID` attributes evolve. Maintain this directory as
verification infrastructure:

1. **Deterministic drift check:** Run `pnpm verify:features` (`pnpm verify:device check-map`). PR CI
   enforces that every page has the required sections, is indexed here, and references existing
   `testID` literals and Maestro flow files.
2. **Update alongside UI changes:** When adding a user-facing screen, renaming a `testID`, or adding
   a Maestro flow, update the owning feature page in the same PR.
3. **Never hide a product regression:** During routine map maintenance, fix only stale selectors,
   navigation steps, or documentation. If a previously passing user flow now fails on device, report
   the regression as a bug instead of weakening the acceptance criteria to make the map pass.
4. **Reuse shared drivers:** Drive device checks through `pnpm verify:device` and
   [Parallel Device Testing](../guides/parallel-device-testing.md) rather than inventing one-off
   shell scripts.
