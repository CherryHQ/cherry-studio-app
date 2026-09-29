# Provider Models

This module owns provider model listing, connectivity checks, synchronization, and manual creation.

## Public Interface

- Provider pages consume the model components, workflow hooks, and pure helpers owned here.

## Organization

- `components/` contains model rows, the pricing editor, and `ProviderModelSettings`, the settings
  rows shared by model details and manual creation.
- `hooks/` owns displayed group state plus add/sync workflows.
- `utils/` contains pure grouping and filtering helpers, synchronization previews, and the check's
  selection resolvers.

The provider detail page exposes synchronization and manual creation as two independent header
actions. `ProviderModelAddScreen` renders the task selected by the route without a mode switch. The
legacy pull route redirects into the synchronization task.

Activation requires valid stored configuration and at least one enabled model supported by the app.
Synchronization and health checks are read-only with respect to provider activation. Setup model tasks
carry an explicit `enableProvider` intent; completion enables through the providers backend module and
returns to the validated `returnTo` href. A failed enable retains saved models for a direct retry.

Synchronization pulls the catalogue once per visit, cancels the request when leaving, and starts with
no changes selected. Errors are classified into configuration, authentication, network, timeout,
unavailable-directory, and rate-limit outcomes. The screen owns inline feedback and routes to
configuration repair or an independent manual-add task with the same setup intent and return target.
An empty directory also offers manual creation. Removal results report protected skipped models.
The manual form and synchronization task mount independently under `detail/modelAdd/components/`;
the synchronization preview lives with that task, while the legacy pull page only redirects.

Manual creation and editing expose text/image/embedding/rerank classification, reasoning and tool
capabilities, image/audio/video inputs, group, streaming support metadata, and pricing. Existing list
rules derive chat/drawing groups and keep unsupported types out of chat selection. This is model
configuration, not admission of new execution paths: Pi still controls conversation protocols and
supported media, and the streaming flag remains a model capability declaration.

The local registry resolver supplies the model baseline; untouched fields stay omitted, and name
and group overrides survive ID edits. Endpoint selection remains single-choice, preserving
untouched catalog endpoint lists and gateway routing. Drawing retains native catalog routes or uses
a configured OpenAI image endpoint. Type changes update the corresponding capability, endpoint, and
output modality together. Unmanaged catalog metadata survives unrelated edits.

Pricing supports USD/CNY, base input/output/cache rates, and input-token tiers. Unknown prices remain
unpriced; zero is an explicit free rate. Empty cache rates use the input rate. Tier thresholds must
be positive, safe integers in increasing order, and incomplete tiers block saving. Editing token
rates preserves per-image and per-minute prices. Clearing an edited token limit submits `null` to
restore catalog or app defaults through the existing nullable storage columns.

Manual creation accepts one model at a time. Multiple or duplicate IDs and conflicting interfaces
produce field errors.

`ProviderModelSettings` renders a model's settings as rows in one order for both model details and
manual creation: name, type and endpoint; reasoning, tool use and streaming switches; image, audio
and video input switches; token limits (not for drawing models); pricing; group and notes (notes on
saved models only). Switches change in place. Names, limits, notes and pricing open a sheet that
edits a copy and applies it on Save; a rejected value keeps the sheet open with its error.

Model details keep their introduction (avatar, name, provider and purpose, model ID) and put these
rows under it. `useSavedModelSettings` writes each change immediately: it is the former edit draft
with one field changed, turned into a patch by the same builders, so inheritance, validation and
`null` limit resets are unchanged. There is no separate edit page, Save button or discard prompt.
Deleting from details uses the list's protected-deletion flow and leaves the page when it succeeds.
Manual creation adapts its draft through `useNewModelSettings`, shows catalog values as
placeholders, and creates the model once with Add. Failed writes are reported and immediate
duplicate submissions are guarded. The separate synchronization workflow retains its batch support.
