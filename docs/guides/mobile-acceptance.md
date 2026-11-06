# Mobile Main-Path Acceptance

Status: benchmark catalog plus three main-flow e2e tests covering eight cases. The tests are written
from the app source and remain **draft** until an authorized replay with the e2e runner.

## What It Contains

[The catalog](../../scripts/mobileAcceptance/cases.json) defines the broad, shallow main-path
baseline: chat, drawings, file previews, settings and common navigation/relaunch behavior.
Each independently reportable action and file format has its own case ID, steps, expected outcome
and data requirements. This is a functional/stability baseline, not a performance score.

[Execution instructions](../../scripts/mobileAcceptance/instructions.md) own caller selection,
scope, evidence, preservation of dedicated data and script accumulation. The
[report template](../../scripts/mobileAcceptance/report-template.md) includes readable and structured
per-case results.

The [mobile-acceptance skill](../../.agents/skills/mobile-acceptance/SKILL.md) is a discoverable
entry point for agents. It references the same assets rather than maintaining another checklist.
Agents that do not load skills can read the instructions directly.

## Start From The Initiating User

Resolve the code target or PR, existing environment, device and dedicated dataset with the user.
Only ask for information absent from the request or conversation. Device discovery can supply
candidates; it does not authorize selecting or modifying one. No fixed device name, host application
or hand-written configuration file is required.

Examples:

- "Prepare the mobile main-path benchmark and script drafts."
- "Test PR 123 using my Android test device and its dedicated dataset."
- "List the available test devices so I can choose one for the drawing checks."

The first request prepares assets only. The second still needs any environment/device identity
not resolved by context. The third does not start a test. Do not ask again for already explicit
choices or authorization.

## Runbooks And Data

| Runbook | Scope |
| --- | --- |
| [Common](../../scripts/mobileAcceptance/scenarios/common.md) | Launch, navigation, background/return and relaunch checks |
| [Chat](../../scripts/mobileAcceptance/scenarios/chat.md) | Conversation, model, branch, attachment and in-app Agent operations |
| [Drawings](../../scripts/mobileAcceptance/scenarios/drawings.md) | Boards, templates, generation and both AI/local image editing |
| [Files](../../scripts/mobileAcceptance/scenarios/files.md) | Per-format previews and representative conversation entry points |
| [Settings](../../scripts/mobileAcceptance/scenarios/settings.md) | Reversible controls, saving and return navigation |

These Markdown runbooks are parameterized agent-readable scenario drafts for exploratory runs, not
automated tests. Read the chosen device tool's current documentation when translating them into
actions. The repository's [existing simulator workflow](./parallel-device-testing.md) provides
ownership and compatibility guidance for its environment; this asset package does not require its
workspace-specific variables, devices or proposed data-import tooling. User-selected physical
devices need a suitable tool and existing setup.

Use the caller's dedicated data. [Sample requirements and optional examples](../../scripts/mobileAcceptance/fixtures/README.md)
help identify suitable files; nothing is automatically imported. Missing prerequisites remain
visible as incomplete, and prepared data is not reset to make checks pass.

## Automated Runs

Automated cases are [e2e](https://e2e.tester.army/docs) tests in
[scripts/mobileAcceptance/tests](../../scripts/mobileAcceptance/tests/), driven by `@e2e-dev/mobile`
on agent-device. A testing agent performs each `agent.act` goal; the runner records the actions once
a following locator assertion passes and replays them without model calls on later runs. When the
app no longer matches a recording, the agent continues from the current screen and the runner
records again. Locator assertions, not the agent, decide every result.

`scripts/mobileAcceptance` is a standalone pnpm project with its own lockfile, because the runner
needs AI SDK 7 while the app pins AI SDK 6. Install it separately, one install at a time:

```bash
pnpm --dir scripts/mobileAcceptance install --frozen-lockfile
```

### Prepare Once

Use the [existing device workflow](./parallel-device-testing.md) for the device, development client
and Metro. The runner neither builds, installs nor starts them.

- Select a **disposable** device: every test clears the app's data. Use this workspace's temporary
  device; the configuration refuses the resident `Cherry Test` and `Cherry_Test`.
- Boot it with a compatible development client installed and start this workspace's Metro.
- Close this workspace's own agent-device session on that device first (`agent-device close`,
  without `--shutdown`). The runner opens its own session, and two sessions fight over one device.

Each test then starts the same way, like Cherry Desktop's fresh profiles: clear the app data, load
Metro (iOS through `--initialUrl`, Android through the development-client link), decline the
privacy prompt and complete onboarding with a custom OpenAI-compatible service. That service is
a [local mock](../../scripts/mobileAcceptance/tests/mockChatService.ts) on the host: tests register
each question's answer and read the context the app sent. The app never calls a real model, and
the onboarding connection check is answered by the mock as well.

### Inputs

Set these in the environment or in a gitignored `scripts/mobileAcceptance/.env`:

| Variable | Meaning |
| --- | --- |
| `CHERRY_ACCEPTANCE_IOS_DEVICE`, `CHERRY_ACCEPTANCE_ANDROID_DEVICE` | Selected disposable simulator or emulator name; at least one is required, and only named devices are used |
| `CHERRY_TEST_CUSTOM_PROVIDER_BASE_URL`, `CHERRY_TEST_CUSTOM_PROVIDER_CHAT_MODEL`, `CHERRY_TEST_CUSTOM_PROVIDER_API_KEY` | OpenAI-compatible endpoint with tool calling for the testing agent, under the same names as Cherry Desktop's E2E; the key is redacted from reports |

Metro uses `CONDUCTOR_PORT`; the iOS and Android mocks use `CONDUCTOR_PORT + 1` and
`CONDUCTOR_PORT + 2` so both targets can run concurrently (outside Conductor, Metro uses `8081`
and each mock gets a free port). Export `AGENT_DEVICE_STATE_DIR` as the device workflow describes. The testing agent
drives only the native conversation menu; it needs its model only until that step has a verified
recording, and the onboarding/launch test never needs one.

### Commands

```bash
pnpm acceptance list
pnpm acceptance run
pnpm acceptance run chat --target ios
pnpm acceptance run --strict-cache
pnpm acceptance run --no-cache
```

`list` starts no device but still needs a device variable. Recording runs keep the default cache. `--strict-cache` fails a step whose
recording no longer replays (`REPLAY_STALE`) instead of spending model calls, which suits a
regression gate after recordings exist. `--no-cache` rules out a stale replay. Conductor workspaces
share verified recordings under `$CONDUCTOR_ROOT_PATH/.local/mobile-acceptance-cache`; other
checkouts use `.e2e/cache`. The root script disables the runner's anonymous telemetry.

### Results

Read `scripts/mobileAcceptance/.e2e/summary.md` first, then each failed test's
`results/<test>/trace.md` (steps, cache decisions and the screen at failure). `report.json` is the
complete record.

| Exit code | Meaning |
| --- | --- |
| 0 | Every selected test passed |
| 1 | An assertion or agent goal failed; read its trace before calling it a product problem |
| 2 | Configuration, model configuration or a stale strict recording |
| 3 | Device, app, model provider or cleanup failure |
| 130 | Interrupted |

A test filtered out by platform does not appear in `list` or the report; it is not a pass.

### Scope And Data

| Test | Cases | Checked |
| --- | --- | --- |
| [common](../../scripts/mobileAcceptance/tests/common.e2e.ts) | `common.onboarding`, `common.launch` | First-run setup with a custom service completes; a relaunch opens a usable chat screen |
| [chat](../../scripts/mobileAcceptance/tests/chat.e2e.ts) | `chat.send`, `common.relaunch-chat`, `chat.delete-conversation` | A reply appears; after a restart the conversation is restored and the follow-up request carries the earlier question and reply; after deletion and a restart it does not return |
| [Agents](../../scripts/mobileAcceptance/tests/agents.e2e.ts) | `chat.agent-create`, `chat.agent-chat`, `chat.agent-delete` | An Agent created from the header picker opens a conversation whose request carries its instructions; Agent and conversation survive a restart; both are deleted |

Every test runs on iOS and Android. Answers never appear in their questions, so finding one on
screen proves the reply arrived. Context and Agent instructions are checked in the requests the
mock received, not inferred from model output.

Known limits: fresh data cannot reproduce upgrade migrations of existing databases; the
conversation row menu is a native context menu, so the testing agent opens it; most screens use
custom headers, so replay anchors on the app identity rather than a screen title and relies on
locating the recorded controls; file pickers (`setInputFiles`) are not supported on devices.

## Grow The Test Collection

Follow [Accumulate tests](../../scripts/mobileAcceptance/instructions.md#accumulate-tests). Add the
test under `scripts/mobileAcceptance/tests`, set the case's `automation`, and keep it draft until an
authorized replay records its exact case, platform, app revision and tool versions. Keep the
benchmark's expected behavior unchanged when repairing a test. Run
`pnpm --dir scripts/mobileAcceptance typecheck` and `pnpm acceptance list` after changing tests or
configuration. Environment installation, device scheduling, data snapshots and release
orchestration remain outside this package.
