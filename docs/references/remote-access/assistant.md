# Desktop Assistant Access

Mobile consumes desktop Assistants and their current topic branches through an independent
`assistant` grant. The implementation requires negotiated remote protocol version 2 and
`connection.hello.assistantVersion === 1`. Agent access keeps its existing version checks and
workspace semantics. An Agent grant never authorizes Assistant requests.

## Product Scope

- The sidebar separates desktop Agents and Assistants. Routes, query keys, drafts, notifications
  and source handles retain the domain even when topic and session IDs match.
- Assistant discovery exposes the configured default model. Topic discovery includes existing
  topics; history retains each message's recorded model, including multi-model replies.
- Text-only first send creates a topic without a workspace. Later sends pin the assistant
  configuration revision, history revision and branch anchor from the observed view.
- Busy or stale submissions are rejected and retain the user's text. Refreshing the current
  view does not automatically resubmit or select a different branch.
- Streaming, explicit cancellation and ordinary tool approval/denial use the shared chat UI.
  OAuth, forms and other desktop-required interactions direct the user to the desktop.
- Existing attachments expose metadata. Uploads, model switching, assistant editing and branch
  management are outside this mobile slice.

## Ownership And Recovery

`RemoteAssistantRuntime` retains one scope per connection and drains it on host shutdown.
`RemoteAssistantScope` owns its Assistant lease, topic views, resources and observation demand.
The connection manager owns physical reconnects. Route exit, mobile interruption and grant
revocation release mobile observation/protection without cancelling desktop execution.

`TopicSync` installs and verifies a fresh checkpoint before activating events. It applies events
before ACK and rebuilds on a gap or reset. Text presentation is coalesced; unchanged messages and
parts keep their view identity. History and deferred content pin both `historyRevision` and
`parentAnchorId`, with bounded content caches and byte/digest validation.
The shared protocol applies `part.updated.afterPartId` to place new and replaced parts in the
desktop's canonical order. A late tool result stays beside its input; a missing predecessor
requires recovery. Checkpoint parts retain the same order.
Assistant history pages are normalized to the common port's newest-first order. Subscription
replacement waits for pending allocation and closure so route changes cannot leak subscriptions
or reject the next subscription on the same connection. Approval input is decoded only after the
backend verifies its bound revision and digest.

`RemoteAssistantActions` persists exact command IDs and parameters before transmission in an
Assistant-specific MMKV journal. Recovery asks for receipts before retrying an absent command
with the same parameters. Creation and the first send have separate persisted IDs. A failed
first send remains attached to the created topic, including failures before send admission.
Reopening a source after process restart recovers its journal and current desktop state; the
mobile database never becomes a second desktop transcript store.

New pairing requests Assistant access only when the QR advertises protocol version 2. Rescanning
an existing pairing with missing requested capabilities opens a fresh unauthenticated channel
for explicit PC approval. Existing grants remain valid if that new claim is not approved.

## Local Protocol Package

The current development override uses Desktop PR #21676 at `c4894c0038` because the published
`@cherrystudio/remote-protocol@0.5.0` does not contain the Assistant export. This is a local
integration dependency, not a published release requirement. Both Mobile and its published
transport resolve the same tarball through `pnpm-workspace.yaml`.

To reproduce the current override, build and pack that desktop checkout after obtaining build
authorization, then install Mobile dependencies once:

```bash
# In the desktop checkout at c4894c0038a1bd615d3b33da2e67e87423a1cf68:
pnpm --filter @cherrystudio/remote-protocol build
cd packages/remote-protocol
pnpm pack --pack-destination /absolute/mobile-workspace/.context/local-packages/c4894c0038

# In the mobile checkout:
pnpm install --ignore-scripts
```

The resulting local path is
`.context/local-packages/c4894c0038/cherrystudio-remote-protocol-0.5.0.tgz`. Generated artifacts stay
under `.context`; no desktop source deep-import is used. `.easignore` includes only this tarball
from `.context` so local EAS builds can install the same dependency. Replace this temporary
override, remove its `.easignore` exception and refresh the lockfile when an Assistant-capable
package is published. A fresh checkout needs the local tarball before installation while this
override exists.
The Mobile PR remains a draft until an Assistant-capable package is published and this override
is replaced with the registry dependency. The local package is not included in Git.

## Acceptance

Focused Mobile suites cover command receipt recovery, checkpoint/reset behavior, branch-pinned
sends, domain routing, no-workspace starts, approval targets, background demand and grant
retirement. They do not establish device interoperability. Actual iOS/Android pairing, existing
history, first/continued send, streamed completion, cancellation, tool decisions, mobile restart,
desktop restart and background behavior require the assigned development devices and a
configured desktop test profile. Record those results separately; a mock model is not evidence
of a real provider round trip.

Recorded development-client acceptance on 2026-10-15 covered Assistant-only pairing, catalogs,
history, first send, continuation, cancellation, ordinary tool approval/denial, pending approval
after restart, and background recovery on both iOS and Android. iOS additionally recovered the
existing pairing and continued its topic after a desktop restart. These runs used the local
protocol package from `6c7f7fa6`; they have not been repeated after the `c4894c0038` ordering update.

- [iOS approval and denial results](images/assistant-ios.png)
- [Android completed reply after returning from the background](images/assistant-android.png)

Physical camera recognition, simultaneous live multi-model generation, desktop-only forms/OAuth,
independent grant revocation and notification taps remain outside the recorded device coverage.
Multi-model history and attachment metadata were checked using explicitly marked history fixtures.
