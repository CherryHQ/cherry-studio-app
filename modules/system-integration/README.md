# System Integration

This local Expo module owns the real native boundary for system entry points. Frontend code uses
`Backend.systemEntry` and `Backend.translation`; it never imports this module. See the
[architecture and behavior contract](../../docs/references/system-integration-design.md).

## Native targets

- Android: `TranslationActivity` handles `ACTION_PROCESS_TEXT` in a dialog, without overlay
  permission. `ShareReceiverActivity` handles ordinary shares and offers translation before
  persisting pure text. `ShortcutEntryActivity` accepts only chat/painting navigation.
- iOS: `CherryTranslationExtension` is an ExtensionKit translation provider requiring iOS 18.4.
  `CherryShareExtension` supports iOS 17 and stages ordinary shares after confirmation. It asks the
  user to open Cherry; it does not attempt an unsupported extension-to-app launch.
- `CherryAppIntents.swift` compiles into the main application target. New chat and Ask Cherry open
  the app; Ask waits at most 55 seconds for the existing Agent and preserves its tool approvals.
  Translation executes natively and returns text to Shortcuts without creating a Cherry record.

`scripts/withSystemIntegration.js` copies the extension sources, configures targets and resources,
embeds the translation product under `Extensions`, and declares Android launcher shortcuts.
`app.config.ts` includes both extensions in the EAS configuration. The main app's minimum iOS
version stays at 17. Existing Widget configuration is preserved.

These source changes require a new custom development client. An OTA update or Expo Go cannot add
the module or extensions. Local EAS Android development and iOS simulator builds succeeded on
2026-09-17. Simulator checks passed share preview/cancellation and Android launcher navigation,
but found failures in the app translation screen on both platforms, iOS selected-text delivery,
iOS App Shortcut execution, and Android's missing-model label. The app language picker no longer
uses the unavailable `Intl.DisplayNames`. The selected-text extension now observes the system
context inside a SwiftUI view, waits for input, and replaces the translation session when the
selection changes. Android ignores null model metadata and hides an empty model label; unavailable
configuration publications omit missing names. These source fixes await device verification.
Real model requests, physical-device provisioning, and automated suites remain unverified;
this implementation is not ready for release.

The earlier iOS development artifact contains all three Cherry actions and its shortcut provider
in `Metadata.appintents`, with matching provider symbols in the debug binary. The shortcut failure
remains unresolved: [developers report the same failure with Apple's sample on iOS 26.5 simulators](https://developer.apple.com/forums/thread/836585),
but the earlier Cherry evidence contains only the error UI, not the system execution logs needed
to establish the same cause. Validate on a physical device or a different runtime and capture
Shortcuts/App Intents system errors before changing action registration.

## Configuration and privacy

The app is the only configuration writer. It projects the selected translation model, target
language, prompt template, and model-compatible request parameters into one versioned configuration.
Swift/Kotlin executors read that projection,
not the main SQLite database. They do not initialize React Native, chat, tools, or a job runtime.

Native configuration version 2 supports only HTTPS OpenAI Chat Completions with standard Bearer API-key auth.
Custom headers, other endpoint protocols, cloud signing, OAuth, local HTTP, and provider-specific
service-tier/verbosity options are rejected. One enabled key is selected for the snapshot; there is
no native key rotation, fallback model, automatic retry, or tool execution. App translation uses
the existing AI SDK provider implementations through the dedicated non-recording entry point.

Translation preferences follow desktop: a configurable prompt with `{{target_language}}` and
`{{text}}`, reasoning effort `none` by default, and opt-in temperature/Top-P (both stored as `1`).
The shared registry resolver emits off only when supported and gates sampling by model capabilities.
The native projection converts supported reasoning options to HTTP fields, rejecting SDK-only
options it cannot represent. The executors interpolate the saved prompt once into a user message;
placeholders inside source text are left untouched. Changing these settings revokes the previous
snapshot and cancels pending calls before publishing a replacement. Version 1 snapshots are
rejected; open Cherry once after updating to publish version 2. Subsequent system translations do
not open the main app or run its JavaScript.

- Translation: 16,000 UTF-16 input units, 64,000 output units, 512 KiB native response limit,
  45-second deadline, non-streaming result, and cancellation on close/configuration change.
- No translation source, result, history, job, or per-invocation usage record is persisted.
  The copy action and Shortcuts return value intentionally hand content to the system.
- iOS uses `group.<bundle-id>.system-integration` and a dedicated shared Keychain access group;
  secrets are accessible only while unlocked, on that device. Widgets do not receive the group.
- Android uses `noBackupFilesDir`, AES-GCM, and an Android Keystore key. iOS shared files use
  complete file protection and are excluded from backup. A missing snapshot fails closed.
- The last configuration survives normal app shutdown, allowing native-only translation after the
  user has configured a model in Cherry. Related settings writes revoke it before committing.

Ordinary shares have a different policy: explicitly accepted text and attachments may be staged
for 24 hours. Limits are 131,072 UTF-16 text units, 10 attachments, 25 MiB per attachment, and
50 MiB total. Files are copied while source access is valid; links are not fetched. Native stores
validate that attachment paths belong to their private staging directory. JavaScript validates the
versioned envelope again through `entrySchema.ts`.

Share imports publish identity-only receipts before copying into managed storage. The entry ID
becomes the new Agent Session ID, so retry checks durable acceptance before resending. Route params
contain only in-memory handoff handles. Translation never uses the durable share queue; converting
an already staged ordinary share to translation first removes that staging entry.

## Activation and acceptance

After an authorized development build, select a translation model under **Settings → Models**.
**Translation settings** on that screen controls the default language, prompt, reasoning, and sampling.
System entry points have no separate settings page or capability-status dashboard. Translation
surfaces own language selection and actionable setup errors. On iOS 18.4+, select Cherry in the system default
translation-app settings. iOS does not expose a reliable read API for that selection, so Cherry
does not display an invented default-app status. Android selection-menu availability depends on
the source app's use of the standard text-processing action.

Before release, authorize and perform these checks:

1. Generate native projects and build both development clients; confirm module autolinking,
   ExtensionKit embedding, App Intent discovery, App Groups, Keychain provisioning, and the
   translation-app entitlement for every build profile.
2. Run the focused suites for `createTranslationModule`, `TranslationConfigurationRuntime`,
   `createSystemEntryModule`, the native entry schema, `AiService`, and bootstrap disposal.
3. Exercise cold/warm invocation, lock state, model/key changes, cancellation, late responses,
   retries, unsupported protocols, iOS 17/18.4 availability, and Android source-app variations.
4. Inspect local content/usage storage after successful, failed, and cancelled translations;
   verify ordinary share restart/expiry/import cleanup and Ask cancellation around admission.

Native request/response compatibility and lifecycle behavior still require that execution evidence.
